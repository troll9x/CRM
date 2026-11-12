import { Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { ProblemException } from '../common/problem.exception';
import type { RequestStaff } from '../common/request-context';
import { PrismaService } from '../prisma/prisma.service';
import type { AssignRolesDto } from './dto/assign-roles.dto';
import type { CreateStaffDto } from './dto/create-staff.dto';
import type { UpdateStaffDto } from './dto/update-staff.dto';
import { hashPassword } from './password';

const access = { roles: { include: { role: { include: { permissions: true } } } } } as const;
type AccessRole = { code: string; permissions: Array<{ permissionKey: string }> };
const permissionKeys = (roles: Array<{ role: AccessRole }>) =>
  [...new Set(roles.flatMap(({ role }) => role.permissions.map((p) => p.permissionKey)))].sort();

@Injectable()
export class StaffService {
  constructor(private readonly prisma: PrismaService) {}

  async list(actor: RequestStaff) {
    const rows = await this.prisma.staffUser.findMany({
      where: { businessId: actor.businessId },
      orderBy: { displayName: 'asc' },
      select: {
        id: true,
        email: true,
        displayName: true,
        status: true,
        createdAt: true,
        roles: { select: { role: { select: { code: true, name: true, permissions: true } } } },
      },
    });
    return rows.map(({ roles, ...staff }) => ({
      ...staff,
      roles: roles.map(({ role }) => ({ role: { code: role.code, name: role.name } })),
      permissions: permissionKeys(roles),
      canManage: this.canManage(actor, roles),
    }));
  }

  private canManage(actor: RequestStaff, roles: Array<{ role: AccessRole }>) {
    return (
      (!roles.some(({ role }) => role.code === 'owner') || actor.roles.includes('owner')) &&
      permissionKeys(roles).every((key) => actor.permissions.includes(key))
    );
  }

  private async manage<T>(
    actor: RequestStaff,
    fn: (tx: Prisma.TransactionClient, current: RequestStaff) => Promise<T>,
  ) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        // Serialize grants/revocations and reload actor authority after taking the business lock.
        await tx.$queryRaw`SELECT id FROM businesses WHERE id = ${actor.businessId} FOR UPDATE`;
        const fresh = await tx.staffUser.findFirst({
          where: { id: actor.id, businessId: actor.businessId, status: 'ACTIVE' },
          include: access,
        });
        const permissions = fresh ? permissionKeys(fresh.roles) : [];
        if (!fresh || !permissions.includes('staff.manage'))
          throw new ProblemException(
            403,
            'PERMISSION_DENIED',
            'Bạn không có quyền quản lý tài khoản.',
          );
        return fn(tx, { ...actor, permissions, roles: fresh.roles.map(({ role }) => role.code) });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        throw new ProblemException(409, 'EMAIL_ALREADY_EXISTS', 'Email đã được sử dụng.');
      throw error;
    }
  }

  private async target(tx: Prisma.TransactionClient, id: string, actor: RequestStaff) {
    const target = await tx.staffUser.findFirst({
      where: { id, businessId: actor.businessId },
      include: access,
    });
    if (!target) throw new ProblemException(404, 'RESOURCE_NOT_FOUND', 'Không tìm thấy nhân viên.');
    if (!this.canManage(actor, target.roles))
      throw new ProblemException(
        403,
        'STAFF_ACCESS_EXCEEDS_ACTOR',
        'Tài khoản này có quyền vượt phạm vi quản lý của bạn.',
      );
    return target;
  }

  private async grantRoles(tx: Prisma.TransactionClient, codes: string[], actor: RequestStaff) {
    const unique = [...new Set(codes)];
    if (!actor.permissions.includes('roles.manage'))
      throw new ProblemException(403, 'PERMISSION_DENIED', 'Bạn không có quyền gán vai trò.');
    const roles = await tx.role.findMany({
      where: { businessId: actor.businessId, code: { in: unique } },
      include: { permissions: true },
    });
    if (roles.length !== unique.length)
      throw new ProblemException(
        422,
        'UNKNOWN_ROLE',
        'Có vai trò không tồn tại trong đơn vị kinh doanh.',
      );
    if (
      !this.canManage(
        actor,
        roles.map((role) => ({ role })),
      )
    )
      throw new ProblemException(
        403,
        'ROLE_ACCESS_EXCEEDS_ACTOR',
        'Không thể cấp quyền vượt quá quyền của bạn.',
      );
    return roles;
  }

  private async keepOwner(
    tx: Prisma.TransactionClient,
    target: { id: string; status: string; roles: Array<{ role: AccessRole }> },
    actor: RequestStaff,
  ) {
    if (target.status !== 'ACTIVE' || !target.roles.some(({ role }) => role.code === 'owner'))
      return;
    const others = await tx.staffUser.count({
      where: {
        businessId: actor.businessId,
        status: 'ACTIVE',
        id: { not: target.id },
        roles: { some: { role: { code: 'owner', businessId: actor.businessId } } },
      },
    });
    if (!others)
      throw new ProblemException(
        409,
        'LAST_ACTIVE_OWNER',
        'Phải giữ ít nhất một chủ cửa hàng đang hoạt động.',
      );
  }

  private audit(
    tx: Prisma.TransactionClient,
    actor: RequestStaff,
    id: string,
    action: string,
    requestId: string,
    metadata?: Prisma.InputJsonValue,
  ) {
    return tx.auditLog.create({
      data: {
        businessId: actor.businessId,
        actorId: actor.id,
        action,
        entityType: 'StaffUser',
        entityId: id,
        requestId,
        ...(metadata ? { metadata } : {}),
      },
    });
  }

  async create(dto: CreateStaffDto, actor: RequestStaff, requestId: string) {
    const passwordHash = await hashPassword(dto.password);
    return this.manage(actor, async (tx, current) => {
      const roles = dto.roleCodes.length ? await this.grantRoles(tx, dto.roleCodes, current) : [];
      const staff = await tx.staffUser.create({
        data: {
          businessId: current.businessId,
          email: dto.email.trim(),
          emailNormalized: dto.email.trim().toLowerCase(),
          displayName: dto.displayName.trim(),
          passwordHash,
          roles: { create: roles.map((role) => ({ roleId: role.id })) },
        },
        select: { id: true, email: true, displayName: true, status: true },
      });
      await this.audit(tx, current, staff.id, 'staff.create', requestId, {
        roleCodes: roles.map((r) => r.code),
      });
      return staff;
    });
  }

  async update(staffId: string, dto: UpdateStaffDto, actor: RequestStaff, requestId: string) {
    return this.manage(actor, async (tx, current) => {
      await this.target(tx, staffId, current);
      const staff = await tx.staffUser.update({
        where: { id: staffId },
        data: {
          email: dto.email.trim(),
          emailNormalized: dto.email.trim().toLowerCase(),
          displayName: dto.displayName.trim(),
        },
        select: { id: true, email: true, displayName: true, status: true },
      });
      await this.audit(tx, current, staffId, 'staff.update', requestId);
      return staff;
    });
  }

  async setLocked(staffId: string, locked: boolean, actor: RequestStaff, requestId: string) {
    return this.manage(actor, async (tx, current) => {
      const target = await this.target(tx, staffId, current);
      if (staffId === current.id && locked)
        throw new ProblemException(
          422,
          'CANNOT_LOCK_SELF',
          'Không thể tự khóa tài khoản đang sử dụng.',
        );
      if (locked) await this.keepOwner(tx, target, current);
      const staff = await tx.staffUser.update({
        where: { id: staffId },
        data: { status: locked ? 'LOCKED' : 'ACTIVE' },
        select: { id: true, email: true, displayName: true, status: true },
      });
      if (locked)
        await tx.session.updateMany({
          where: { staffUserId: staffId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      await this.audit(tx, current, staffId, locked ? 'staff.lock' : 'staff.unlock', requestId);
      return staff;
    });
  }

  async assignRoles(staffId: string, dto: AssignRolesDto, actor: RequestStaff, requestId: string) {
    return this.manage(actor, async (tx, current) => {
      const target = await this.target(tx, staffId, current);
      if (staffId === current.id)
        throw new ProblemException(
          422,
          'CANNOT_CHANGE_OWN_ROLES',
          'Nhờ một chủ cửa hàng khác thay đổi vai trò của bạn.',
        );
      const roles = await this.grantRoles(tx, dto.roleCodes, current);
      if (!roles.some((r) => r.code === 'owner')) await this.keepOwner(tx, target, current);
      await tx.staffUserRole.deleteMany({ where: { staffUserId: staffId } });
      if (roles.length)
        await tx.staffUserRole.createMany({
          data: roles.map((r) => ({ staffUserId: staffId, roleId: r.id })),
        });
      await tx.session.updateMany({
        where: { staffUserId: staffId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await this.audit(tx, current, staffId, 'staff.roles.assign', requestId, {
        roleCodes: roles.map((r) => r.code),
      });
      return { id: staffId, roleCodes: roles.map((r) => r.code), sessionsRevoked: true };
    });
  }

  async resetPassword(staffId: string, password: string, actor: RequestStaff, requestId: string) {
    const passwordHash = await hashPassword(password);
    return this.manage(actor, async (tx, current) => {
      await this.target(tx, staffId, current);
      if (staffId === current.id)
        throw new ProblemException(
          422,
          'CANNOT_RESET_SELF',
          'Không thể đặt lại mật khẩu của chính bạn qua màn hình quản trị.',
        );
      await tx.staffUser.update({ where: { id: staffId }, data: { passwordHash } });
      await tx.session.updateMany({
        where: { staffUserId: staffId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await this.audit(tx, current, staffId, 'staff.password.reset', requestId);
      return { id: staffId, sessionsRevoked: true };
    });
  }
}
