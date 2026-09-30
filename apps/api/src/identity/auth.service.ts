import { randomBytes, createHash } from 'node:crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ProblemException } from '../common/problem.exception';
import type { RequestStaff } from '../common/request-context';
import { PrismaService } from '../prisma/prisma.service';
import { verifyPassword } from './password';

const DUMMY_HASH = `scrypt$32768$8$1$${Buffer.alloc(16).toString('base64url')}$${Buffer.alloc(32).toString('base64url')}`;

const staffAccessInclude = {
  business: true,
  roles: {
    include: { role: { include: { permissions: true } } },
  },
} as const;

type StaffWithAccess = {
  id: string;
  businessId: string;
  email: string;
  displayName: string;
  passwordHash: string;
  status: 'ACTIVE' | 'LOCKED';
  roles: Array<{
    role: { code: string; permissions: Array<{ permissionKey: string }> };
  }>;
};

@Injectable()
export class AuthService {
  readonly cookieName: string;
  readonly ttlMilliseconds: number;
  readonly secureCookie: boolean;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.secureCookie = config.get<string>('SESSION_COOKIE_SECURE') === 'true';
    this.cookieName = this.secureCookie ? '__Host-crm_session' : 'crm_session';
    const ttlHours = Number(config.get<string>('SESSION_TTL_HOURS') ?? 12);
    this.ttlMilliseconds = Math.max(1, Math.min(ttlHours, 168)) * 60 * 60 * 1000;
  }

  private hashToken(rawToken: string): string {
    return createHash('sha256').update(rawToken).digest('base64url');
  }

  private findStaffWithAccess(emailNormalized: string) {
    return this.prisma.staffUser.findUnique({
      where: { emailNormalized },
      include: staffAccessInclude,
    }) as Promise<StaffWithAccess | null>;
  }

  private toRequestStaff(staff: StaffWithAccess): RequestStaff {
    return {
      id: staff.id,
      businessId: staff.businessId,
      email: staff.email,
      displayName: staff.displayName,
      roles: staff.roles.map(({ role }) => role.code),
      permissions: [
        ...new Set(
          staff.roles.flatMap(({ role }) =>
            role.permissions.map(({ permissionKey }) => permissionKey),
          ),
        ),
      ].sort(),
    };
  }

  async login(
    email: string,
    password: string,
    metadata: { ipAddress?: string; userAgent?: string; requestId?: string },
  ): Promise<{ rawToken: string; staff: RequestStaff; expiresAt: Date }> {
    const emailNormalized = email.trim().toLocaleLowerCase('en-US');
    const staff = await this.findStaffWithAccess(emailNormalized);
    const passwordOk = await verifyPassword(password, staff?.passwordHash ?? DUMMY_HASH);
    if (!staff || !passwordOk || staff.status !== 'ACTIVE') {
      throw new ProblemException(
        HttpStatus.UNAUTHORIZED,
        'INVALID_CREDENTIALS',
        'Email hoặc mật khẩu không đúng, hoặc tài khoản đã bị khóa.',
      );
    }

    const rawToken = randomBytes(32).toString('base64url');
    const sessionHash = this.hashToken(rawToken);
    const expiresAt = new Date(Date.now() + this.ttlMilliseconds);
    await this.prisma.$transaction([
      this.prisma.session.create({
        data: {
          id: sessionHash,
          staffUserId: staff.id,
          expiresAt,
          ipAddress: metadata.ipAddress,
          userAgent: metadata.userAgent?.slice(0, 500),
        },
      }),
      this.prisma.auditLog.create({
        data: {
          businessId: staff.businessId,
          actorId: staff.id,
          action: 'auth.login',
          entityType: 'Session',
          entityId: sessionHash,
          requestId: metadata.requestId,
        },
      }),
    ]);
    return { rawToken, staff: this.toRequestStaff(staff), expiresAt };
  }

  async authenticate(
    rawToken?: string,
  ): Promise<{ staff: RequestStaff; sessionHash: string } | null> {
    if (!rawToken || rawToken.length > 256) return null;
    const sessionHash = this.hashToken(rawToken);
    const session = await this.prisma.session.findUnique({
      where: { id: sessionHash },
      include: {
        staffUser: {
          include: {
            business: true,
            roles: { include: { role: { include: { permissions: true } } } },
          },
        },
      },
    });
    if (
      !session ||
      session.revokedAt ||
      session.expiresAt <= new Date() ||
      session.staffUser.status !== 'ACTIVE'
    ) {
      return null;
    }
    if (Date.now() - session.lastSeenAt.getTime() > 5 * 60 * 1000) {
      await this.prisma.session.updateMany({
        where: { id: sessionHash, revokedAt: null },
        data: { lastSeenAt: new Date() },
      });
    }
    return { staff: this.toRequestStaff(session.staffUser), sessionHash };
  }

  async logout(sessionHash: string, staff: RequestStaff, requestId?: string): Promise<void> {
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.session.updateMany({
        where: { id: sessionHash, staffUserId: staff.id, revokedAt: null },
        data: { revokedAt: now },
      }),
      this.prisma.auditLog.create({
        data: {
          businessId: staff.businessId,
          actorId: staff.id,
          action: 'auth.logout',
          entityType: 'Session',
          entityId: sessionHash,
          requestId,
        },
      }),
    ]);
  }
}
