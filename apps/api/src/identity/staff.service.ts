import { HttpStatus, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { ProblemException } from '../common/problem.exception';
import type { RequestStaff } from '../common/request-context';
import { PrismaService } from '../prisma/prisma.service';
import type { AssignRolesDto } from './dto/assign-roles.dto';
import type { CreateStaffDto } from './dto/create-staff.dto';
import { hashPassword } from './password';

@Injectable()
export class StaffService {
  constructor(private readonly prisma: PrismaService) {}

  list(businessId: string) {
    return this.prisma.staffUser.findMany({
      where: { businessId },
      orderBy: { displayName: 'asc' },
      select: {
        id: true,
        email: true,
        displayName: true,
        status: true,
        createdAt: true,
        roles: { select: { role: { select: { code: true, name: true } } } },
      },
    });
  }

  async create(dto: CreateStaffDto, actor: RequestStaff, requestId: string) {
    const emailNormalized = dto.email.trim().toLocaleLowerCase('en-US');
    const existing = await this.prisma.staffUser.findUnique({ where: { emailNormalized } });
    if (existing) {
      throw new ProblemException(
        HttpStatus.CONFLICT,
        'EMAIL_ALREADY_EXISTS',
        'Email đã được sử dụng.',
      );
    }
    const uniqueCodes = [...new Set(dto.roleCodes)];
    const roles = (await this.prisma.role.findMany({
      where: { businessId: actor.businessId, code: { in: uniqueCodes } },
    })) as Array<{ id: string }>;
    if (roles.length !== uniqueCodes.length) {
      throw new ProblemException(
        422,
        'UNKNOWN_ROLE',
        'Có vai trò không tồn tại trong đơn vị kinh doanh.',
      );
    }
    const passwordHash = await hashPassword(dto.password);
    const staffId = randomUUID();
    const [staff] = await this.prisma.$transaction([
      this.prisma.staffUser.create({
        data: {
          id: staffId,
          businessId: actor.businessId,
          email: dto.email.trim(),
          emailNormalized,
          displayName: dto.displayName.trim(),
          passwordHash,
          roles: { create: roles.map((role) => ({ roleId: role.id })) },
        },
        select: { id: true, email: true, displayName: true, status: true },
      }),
      this.prisma.auditLog.create({
        data: {
          businessId: actor.businessId,
          actorId: actor.id,
          action: 'staff.create',
          entityType: 'StaffUser',
          entityId: staffId,
          requestId,
          metadata: { roleCodes: uniqueCodes },
        },
      }),
    ]);
    return staff;
  }

  async setLocked(staffId: string, locked: boolean, actor: RequestStaff, requestId: string) {
    if (staffId === actor.id && locked) {
      throw new ProblemException(
        422,
        'CANNOT_LOCK_SELF',
        'Không thể tự khóa tài khoản đang sử dụng.',
      );
    }
    const target = await this.prisma.staffUser.findFirst({
      where: { id: staffId, businessId: actor.businessId },
    });
    if (!target) throw new ProblemException(404, 'RESOURCE_NOT_FOUND', 'Không tìm thấy nhân viên.');

    const status = locked ? 'LOCKED' : 'ACTIVE';
    const update = this.prisma.staffUser.update({
      where: { id: staffId },
      data: { status },
      select: { id: true, email: true, displayName: true, status: true },
    });
    const audit = this.prisma.auditLog.create({
      data: {
        businessId: actor.businessId,
        actorId: actor.id,
        action: locked ? 'staff.lock' : 'staff.unlock',
        entityType: 'StaffUser',
        entityId: staffId,
        requestId,
      },
    });
    let updated;
    if (locked) {
      [updated] = await this.prisma.$transaction([
        update,
        this.prisma.session.updateMany({
          where: { staffUserId: staffId, revokedAt: null },
          data: { revokedAt: new Date() },
        }),
        audit,
      ]);
    } else {
      [updated] = await this.prisma.$transaction([update, audit]);
    }
    return updated;
  }

  async assignRoles(staffId: string, dto: AssignRolesDto, actor: RequestStaff, requestId: string) {
    const target = await this.prisma.staffUser.findFirst({
      where: { id: staffId, businessId: actor.businessId },
    });
    if (!target) throw new ProblemException(404, 'RESOURCE_NOT_FOUND', 'Không tìm thấy nhân viên.');
    const uniqueCodes = [...new Set(dto.roleCodes)];
    const roles = (await this.prisma.role.findMany({
      where: { businessId: actor.businessId, code: { in: uniqueCodes } },
    })) as Array<{ id: string }>;
    if (roles.length !== uniqueCodes.length) {
      throw new ProblemException(
        422,
        'UNKNOWN_ROLE',
        'Có vai trò không tồn tại trong đơn vị kinh doanh.',
      );
    }
    const deleteRoles = this.prisma.staffUserRole.deleteMany({ where: { staffUserId: staffId } });
    const revokeSessions = this.prisma.session.updateMany({
      where: { staffUserId: staffId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    const audit = this.prisma.auditLog.create({
      data: {
        businessId: actor.businessId,
        actorId: actor.id,
        action: 'staff.roles.assign',
        entityType: 'StaffUser',
        entityId: staffId,
        requestId,
        metadata: { roleCodes: uniqueCodes },
      },
    });
    if (roles.length) {
      await this.prisma.$transaction([
        deleteRoles,
        this.prisma.staffUserRole.createMany({
          data: roles.map((role) => ({ staffUserId: staffId, roleId: role.id })),
        }),
        revokeSessions,
        audit,
      ]);
    } else {
      await this.prisma.$transaction([deleteRoles, revokeSessions, audit]);
    }
    return { id: staffId, roleCodes: uniqueCodes, sessionsRevoked: true };
  }
}
