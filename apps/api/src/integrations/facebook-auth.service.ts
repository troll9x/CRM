import { createHash, randomBytes } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { RequestStaff } from '../common/request-context';
import { CredentialCrypto } from './credential-crypto';
import { FacebookOAuthClient, type FacebookGrant } from './facebook-oauth.client';

type AvailablePage = { id: string; name: string; tasks: string[] };

@Injectable()
export class FacebookAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly facebook: FacebookOAuthClient,
  ) {}

  private crypto() {
    return new CredentialCrypto(this.config.get<string>('INTEGRATION_TOKEN_ENCRYPTION_KEY'));
  }

  private hashState(state: string) {
    return createHash('sha256').update(state).digest('hex');
  }

  private returnUrl(id: string, result: string) {
    const configured = this.config.get<string>('WEB_ORIGIN')?.split(',')[0]?.trim() ?? '';
    const origin = new URL(configured);
    if (
      (origin.protocol !== 'https:' && origin.hostname !== 'localhost') ||
      origin.pathname !== '/'
    )
      throw new BadRequestException('WEB_ORIGIN chưa hợp lệ cho callback.');
    origin.searchParams.set('channelAttempt', id);
    origin.searchParams.set('channelResult', result);
    return origin.toString();
  }

  async start(actor: RequestStaff, reconnectConnectionId?: string) {
    this.crypto();
    const redirectUri = this.facebook.redirectUri();
    this.returnUrl('probe', 'probe');
    if (reconnectConnectionId) {
      const connection = await this.prisma.integrationConnection.findFirst({
        where: { id: reconnectConnectionId, businessId: actor.businessId, provider: 'FACEBOOK' },
        select: { id: true },
      });
      if (!connection) throw new NotFoundException('Không tìm thấy Page để kết nối lại.');
    }
    const state = randomBytes(32).toString('base64url');
    const attempt = await this.prisma.integrationAuthAttempt.create({
      data: {
        businessId: actor.businessId,
        actorId: actor.id,
        provider: 'FACEBOOK',
        stateHash: this.hashState(state),
        redirectUri,
        reconnectConnectionId,
        expiresAt: new Date(Date.now() + 15 * 60_000),
      },
      select: { id: true, expiresAt: true },
    });
    return {
      attemptId: attempt.id,
      expiresAt: attempt.expiresAt,
      authorizationUrl: this.facebook.authorizationUrl(state),
    };
  }

  async callback(query: { state?: string; code?: string; error?: string }) {
    if (typeof query.state !== 'string' || !/^[A-Za-z0-9_-]{40,80}$/.test(query.state))
      throw new BadRequestException('OAuth state không hợp lệ.');
    const stateHash = this.hashState(query.state);
    const attempt = await this.prisma.integrationAuthAttempt.findUnique({ where: { stateHash } });
    if (!attempt || attempt.provider !== 'FACEBOOK')
      throw new BadRequestException('OAuth state không hợp lệ.');
    const claimed = await this.prisma.integrationAuthAttempt.updateMany({
      where: {
        id: attempt.id,
        provider: 'FACEBOOK',
        status: 'PENDING',
        expiresAt: { gt: new Date() },
      },
      data: { status: 'CLAIMED', claimedAt: new Date() },
    });
    if (claimed.count !== 1)
      throw new ConflictException('Yêu cầu cấp quyền đã hết hạn hoặc đã sử dụng.');
    if (query.error || typeof query.code !== 'string' || !query.code) {
      await this.prisma.integrationAuthAttempt.update({
        where: { id: attempt.id },
        data: { status: 'DENIED', errorCode: 'PROVIDER_DENIED' },
      });
      return this.returnUrl(attempt.id, 'denied');
    }
    try {
      const grant = await this.facebook.exchangeCode(query.code, attempt.redirectUri);
      const availableAccounts: AvailablePage[] = grant.pages.map(({ id, name, tasks }) => ({
        id,
        name,
        tasks,
      }));
      await this.prisma.integrationAuthAttempt.update({
        where: { id: attempt.id },
        data: {
          status: 'READY',
          credentialCiphertext: this.crypto().encrypt(
            grant,
            `facebook-attempt:${attempt.id}:${attempt.businessId}`,
          ),
          availableAccounts,
          // Selection gets a new limited window after the provider callback.
          expiresAt: new Date(Date.now() + 15 * 60_000),
        },
      });
      return this.returnUrl(attempt.id, 'ready');
    } catch {
      await this.prisma.integrationAuthAttempt.update({
        where: { id: attempt.id },
        data: { status: 'FAILED', errorCode: 'PROVIDER_EXCHANGE_FAILED' },
      });
      return this.returnUrl(attempt.id, 'failed');
    }
  }

  async attempt(actor: RequestStaff, id: string) {
    const row = await this.prisma.integrationAuthAttempt.findFirst({
      where: { id, businessId: actor.businessId, actorId: actor.id, provider: 'FACEBOOK' },
      select: { id: true, status: true, expiresAt: true, availableAccounts: true, errorCode: true },
    });
    if (!row) throw new NotFoundException('Không tìm thấy lần cấp quyền.');
    const accounts = Array.isArray(row.availableAccounts) ? row.availableAccounts : [];
    return {
      id: row.id,
      status: row.expiresAt <= new Date() && row.status === 'READY' ? 'EXPIRED' : row.status,
      expiresAt: row.expiresAt,
      accounts: row.status === 'READY' ? accounts : [],
      errorCode: row.errorCode,
    };
  }

  async finalize(actor: RequestStaff, id: string, pageId: string) {
    if (!/^\d+$/.test(pageId)) throw new BadRequestException('Page không hợp lệ.');
    const attempt = await this.prisma.integrationAuthAttempt.findFirst({
      where: { id, businessId: actor.businessId, actorId: actor.id, provider: 'FACEBOOK' },
    });
    if (!attempt) throw new NotFoundException('Không tìm thấy lần cấp quyền.');
    if (
      attempt.status !== 'READY' ||
      attempt.expiresAt <= new Date() ||
      !attempt.credentialCiphertext
    )
      throw new ConflictException('Lần cấp quyền chưa sẵn sàng hoặc đã hết hạn.');
    const available = Array.isArray(attempt.availableAccounts) ? attempt.availableAccounts : [];
    if (
      !available.some(
        (page) => page && typeof page === 'object' && 'id' in page && page.id === pageId,
      )
    )
      throw new ForbiddenException('Page này không nằm trong danh sách được cấp quyền.');
    const grant = this.crypto().decrypt<FacebookGrant>(
      attempt.credentialCiphertext,
      `facebook-attempt:${id}:${actor.businessId}`,
    );
    const page = grant.pages.find((item) => item.id === pageId);
    if (!page) throw new ForbiddenException('Page chưa được cấp token.');
    if (!page.tasks.some((task) => /MESSAG|FULL_CONTROL/.test(task)))
      throw new ForbiddenException('Người cấp quyền chưa có tác vụ nhắn tin trên Page.');
    if (attempt.reconnectConnectionId) {
      const existing = await this.prisma.integrationConnection.findFirst({
        where: {
          id: attempt.reconnectConnectionId,
          businessId: actor.businessId,
          provider: 'FACEBOOK',
          externalAccountId: pageId,
        },
        select: { id: true },
      });
      if (!existing) throw new ConflictException('Kết nối lại phải chọn đúng Page trước đó.');
    }
    const claimed = await this.prisma.integrationAuthAttempt.updateMany({
      where: { id, status: 'READY', expiresAt: { gt: new Date() } },
      data: { status: 'FINALIZING' },
    });
    if (claimed.count !== 1) throw new ConflictException('Page đang được hoàn tất ở yêu cầu khác.');
    try {
      await this.facebook.subscribe(page);
      const connection = await this.prisma.$transaction(
        async (tx) => {
          // One Page must not be routed to two businesses by the public webhook.
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`FACEBOOK:${pageId}`}))`;
          const conflicting = await tx.integrationConnection.findFirst({
            where: {
              provider: 'FACEBOOK',
              externalAccountId: pageId,
              businessId: { not: actor.businessId },
              status: { in: ['CONNECTED', 'REAUTH_REQUIRED'] },
            },
            select: { id: true },
          });
          if (conflicting)
            throw new ConflictException('Page đã được gắn với đơn vị khác trong CRM.');
          const existing = await tx.integrationConnection.findUnique({
            where: {
              businessId_provider_externalAccountId: {
                businessId: actor.businessId,
                provider: 'FACEBOOK',
                externalAccountId: pageId,
              },
            },
            select: { id: true, capabilities: true },
          });
          const oldCapabilities =
            existing?.capabilities &&
            typeof existing.capabilities === 'object' &&
            !Array.isArray(existing.capabilities)
              ? (existing.capabilities as Record<string, unknown>)
              : {};
          const capabilities = {
            ...oldCapabilities,
            authorization: 'VERIFIED',
            // The Page's subscribed_apps readback verifies only the Page-level
            // subscription. It does not prove app-dashboard webhook setup or delivery.
            pageSubscription: 'VERIFIED',
            webhookSubscription: 'APP_CONFIGURATION_PENDING',
            messages: 'PAGE_SUBSCRIBED',
            comments: 'PAGE_SUBSCRIBED',
          };
          const ciphertext = this.crypto().encrypt(
            { pageToken: page.accessToken, userToken: grant.userToken },
            `facebook-connection:${actor.businessId}:${pageId}`,
          );
          const saved = await tx.integrationConnection.upsert({
            where: {
              businessId_provider_externalAccountId: {
                businessId: actor.businessId,
                provider: 'FACEBOOK',
                externalAccountId: pageId,
              },
            },
            create: {
              businessId: actor.businessId,
              provider: 'FACEBOOK',
              externalAccountId: pageId,
              displayName: page.name,
              status: 'CONNECTED',
              capabilities,
              credentialCiphertext: ciphertext,
              credentialKeyVersion: 1,
              tokenExpiresAt: grant.expiresAt ? new Date(grant.expiresAt) : null,
              connectedAt: new Date(),
            },
            update: {
              displayName: page.name,
              status: 'CONNECTED',
              capabilities,
              credentialCiphertext: ciphertext,
              credentialKeyVersion: 1,
              tokenExpiresAt: grant.expiresAt ? new Date(grant.expiresAt) : null,
              connectedAt: new Date(),
              lastErrorAt: null,
              lastErrorCode: null,
            },
            select: { id: true, status: true, displayName: true },
          });
          await tx.integrationAuthAttempt.update({
            where: { id },
            data: {
              status: 'COMPLETED',
              credentialCiphertext: null,
              availableAccounts: Prisma.DbNull,
            },
          });
          await tx.auditLog.create({
            data: {
              businessId: actor.businessId,
              actorId: actor.id,
              action: 'integration.facebook.authorized',
              entityType: 'IntegrationConnection',
              entityId: saved.id,
              metadata: { attemptId: id, reconnected: Boolean(existing) },
            },
          });
          return saved;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
      return connection;
    } catch (error) {
      await this.prisma.integrationAuthAttempt.updateMany({
        where: { id, status: 'FINALIZING' },
        data: { status: 'READY', errorCode: 'FINALIZE_FAILED' },
      });
      throw error;
    }
  }

  async disconnect(actor: RequestStaff, id: string) {
    const connection = await this.prisma.integrationConnection.findFirst({
      where: { id, businessId: actor.businessId, provider: 'FACEBOOK' },
      select: { id: true, capabilities: true },
    });
    if (!connection) throw new NotFoundException('Không tìm thấy kết nối Facebook.');
    const capabilities =
      connection.capabilities &&
      typeof connection.capabilities === 'object' &&
      !Array.isArray(connection.capabilities)
        ? (connection.capabilities as Record<string, unknown>)
        : {};
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.integrationConnection.update({
        where: { id },
        data: {
          status: 'PAUSED',
          capabilities: {
            ...capabilities,
            authorization: 'DISCONNECTED',
            webhookSubscription: 'UPSTREAM_NOT_REMOVED',
          },
          credentialCiphertext: null,
          credentialKeyVersion: null,
          tokenExpiresAt: null,
        },
        select: { id: true, status: true },
      });
      await tx.auditLog.create({
        data: {
          businessId: actor.businessId,
          actorId: actor.id,
          action: 'integration.facebook.disconnected_local',
          entityType: 'IntegrationConnection',
          entityId: id,
        },
      });
      return { ...updated, upstreamUnsubscribed: false };
    });
  }
}
