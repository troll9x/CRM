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
import { ZaloOAuthClient, type ZaloGrant } from './zalo-oauth.client';

@Injectable()
export class ZaloAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly zalo: ZaloOAuthClient,
  ) {}

  private crypto() {
    return new CredentialCrypto(this.config.get<string>('INTEGRATION_TOKEN_ENCRYPTION_KEY'));
  }

  private returnUrl(id: string, result: string) {
    const configured = this.config.get<string>('WEB_ORIGIN')?.split(',')[0]?.trim() ?? '';
    let url: URL;
    try {
      url = new URL(configured);
    } catch {
      throw new BadRequestException('WEB_ORIGIN chưa hợp lệ cho callback.');
    }
    if ((url.protocol !== 'https:' && url.hostname !== 'localhost') || url.pathname !== '/')
      throw new BadRequestException('WEB_ORIGIN chưa hợp lệ cho callback.');
    url.searchParams.set('channelAttempt', id);
    url.searchParams.set('channelProvider', 'ZALO');
    url.searchParams.set('channelResult', result);
    return url.toString();
  }

  async start(actor: RequestStaff, reconnectConnectionId?: string) {
    const crypto = this.crypto();
    const redirectUri = this.zalo.redirectUri();
    this.returnUrl('probe', 'probe');
    if (reconnectConnectionId) {
      const existing = await this.prisma.integrationConnection.findFirst({
        where: { id: reconnectConnectionId, businessId: actor.businessId, provider: 'ZALO' },
        select: { id: true },
      });
      if (!existing) throw new NotFoundException('Không tìm thấy OA để kết nối lại.');
    }
    const state = randomBytes(32).toString('base64url');
    const codeVerifier = randomBytes(32).toString('base64url');
    const challenge = createHash('sha256').update(codeVerifier).digest('base64url');
    const attempt = await this.prisma.integrationAuthAttempt.create({
      data: {
        businessId: actor.businessId,
        actorId: actor.id,
        provider: 'ZALO',
        stateHash: createHash('sha256').update(state).digest('hex'),
        redirectUri,
        reconnectConnectionId,
        expiresAt: new Date(Date.now() + 10 * 60_000),
        credentialCiphertext: crypto.encrypt(
          { codeVerifier },
          `zalo-pkce:${actor.businessId}:${state}`,
        ),
      },
      select: { id: true, expiresAt: true },
    });
    return {
      attemptId: attempt.id,
      expiresAt: attempt.expiresAt,
      authorizationUrl: this.zalo.authorizationUrl(state, challenge),
    };
  }

  async callback(query: { state?: string; code?: string; oaId?: string; error?: string }) {
    if (typeof query.state !== 'string' || !/^[A-Za-z0-9_-]{40,80}$/.test(query.state))
      throw new BadRequestException('OAuth state không hợp lệ.');
    const stateHash = createHash('sha256').update(query.state).digest('hex');
    const attempt = await this.prisma.integrationAuthAttempt.findUnique({ where: { stateHash } });
    if (!attempt || attempt.provider !== 'ZALO')
      throw new BadRequestException('OAuth state không hợp lệ.');
    const claimed = await this.prisma.integrationAuthAttempt.updateMany({
      where: { id: attempt.id, provider: 'ZALO', status: 'PENDING', expiresAt: { gt: new Date() } },
      data: { status: 'CLAIMED', claimedAt: new Date() },
    });
    if (claimed.count !== 1)
      throw new ConflictException('Yêu cầu cấp quyền đã hết hạn hoặc đã sử dụng.');
    if (query.error || typeof query.code !== 'string' || !query.code) {
      await this.prisma.integrationAuthAttempt.update({
        where: { id: attempt.id },
        data: { status: 'DENIED', errorCode: 'PROVIDER_DENIED', credentialCiphertext: null },
      });
      return this.returnUrl(attempt.id, 'denied');
    }
    try {
      const pending = this.crypto().decrypt<{ codeVerifier: string }>(
        attempt.credentialCiphertext!,
        `zalo-pkce:${attempt.businessId}:${query.state}`,
      );
      const grant = await this.zalo.exchangeCode(query.code, pending.codeVerifier, query.oaId);
      await this.prisma.integrationAuthAttempt.update({
        where: { id: attempt.id },
        data: {
          status: 'READY',
          credentialCiphertext: this.crypto().encrypt(
            grant,
            `zalo-attempt:${attempt.id}:${attempt.businessId}`,
          ),
          availableAccounts: [{ id: grant.oaId, name: grant.oaName }],
          expiresAt: new Date(Date.now() + 15 * 60_000),
        },
      });
      return this.returnUrl(attempt.id, 'ready');
    } catch {
      await this.prisma.integrationAuthAttempt.update({
        where: { id: attempt.id },
        data: {
          status: 'FAILED',
          errorCode: 'PROVIDER_EXCHANGE_FAILED',
          credentialCiphertext: null,
        },
      });
      return this.returnUrl(attempt.id, 'failed');
    }
  }

  async attempt(actor: RequestStaff, id: string) {
    const row = await this.prisma.integrationAuthAttempt.findFirst({
      where: { id, businessId: actor.businessId, actorId: actor.id, provider: 'ZALO' },
      select: { id: true, status: true, expiresAt: true, availableAccounts: true, errorCode: true },
    });
    if (!row) throw new NotFoundException('Không tìm thấy lần cấp quyền.');
    return {
      id: row.id,
      status: row.expiresAt <= new Date() && row.status === 'READY' ? 'EXPIRED' : row.status,
      expiresAt: row.expiresAt,
      accounts:
        row.status === 'READY' && Array.isArray(row.availableAccounts) ? row.availableAccounts : [],
      errorCode: row.errorCode,
    };
  }

  async finalize(actor: RequestStaff, id: string, oaId: string) {
    if (!/^\d+$/.test(oaId)) throw new BadRequestException('OA không hợp lệ.');
    const attempt = await this.prisma.integrationAuthAttempt.findFirst({
      where: { id, businessId: actor.businessId, actorId: actor.id, provider: 'ZALO' },
    });
    if (!attempt) throw new NotFoundException('Không tìm thấy lần cấp quyền.');
    if (
      attempt.status !== 'READY' ||
      attempt.expiresAt <= new Date() ||
      !attempt.credentialCiphertext
    )
      throw new ConflictException('Lần cấp quyền chưa sẵn sàng hoặc đã hết hạn.');
    const grant = this.crypto().decrypt<ZaloGrant>(
      attempt.credentialCiphertext,
      `zalo-attempt:${id}:${actor.businessId}`,
    );
    if (grant.oaId !== oaId) throw new ForbiddenException('OA này chưa được cấp quyền.');
    if (attempt.reconnectConnectionId) {
      const old = await this.prisma.integrationConnection.findFirst({
        where: {
          id: attempt.reconnectConnectionId,
          businessId: actor.businessId,
          provider: 'ZALO',
          externalAccountId: oaId,
        },
        select: { id: true },
      });
      if (!old) throw new ConflictException('Kết nối lại phải chọn đúng OA trước đó.');
    }
    const claimed = await this.prisma.integrationAuthAttempt.updateMany({
      where: { id, status: 'READY', expiresAt: { gt: new Date() } },
      data: { status: 'FINALIZING' },
    });
    if (claimed.count !== 1) throw new ConflictException('OA đang được hoàn tất ở yêu cầu khác.');
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`ZALO:${oaId}`}))`;
          const conflict = await tx.integrationConnection.findFirst({
            where: {
              provider: 'ZALO',
              externalAccountId: oaId,
              businessId: { not: actor.businessId },
              status: { in: ['CONNECTED', 'REAUTH_REQUIRED'] },
            },
            select: { id: true },
          });
          if (conflict) throw new ConflictException('OA đã được gắn với đơn vị khác trong CRM.');
          const ciphertext = this.crypto().encrypt(
            {
              accessToken: grant.accessToken,
              refreshToken: grant.refreshToken,
              refreshExpiresAt: grant.refreshExpiresAt,
            },
            `zalo-connection:${actor.businessId}:${oaId}`,
          );
          const saved = await tx.integrationConnection.upsert({
            where: {
              businessId_provider_externalAccountId: {
                businessId: actor.businessId,
                provider: 'ZALO',
                externalAccountId: oaId,
              },
            },
            create: {
              businessId: actor.businessId,
              provider: 'ZALO',
              externalAccountId: oaId,
              displayName: grant.oaName,
              status: 'CONNECTED',
              capabilities: {
                authorization: 'VERIFIED',
                webhookSubscription: 'APP_CONFIGURATION_PENDING',
              },
              credentialCiphertext: ciphertext,
              credentialKeyVersion: 1,
              tokenExpiresAt: new Date(grant.expiresAt),
              connectedAt: new Date(),
            },
            update: {
              displayName: grant.oaName,
              status: 'CONNECTED',
              capabilities: {
                authorization: 'VERIFIED',
                webhookSubscription: 'APP_CONFIGURATION_PENDING',
              },
              credentialCiphertext: ciphertext,
              credentialKeyVersion: 1,
              tokenExpiresAt: new Date(grant.expiresAt),
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
              action: 'integration.zalo.authorized',
              entityType: 'IntegrationConnection',
              entityId: saved.id,
              metadata: { attemptId: id, reconnected: Boolean(attempt.reconnectConnectionId) },
            },
          });
          return saved;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
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
      where: { id, businessId: actor.businessId, provider: 'ZALO' },
      select: { id: true },
    });
    if (!connection) throw new NotFoundException('Không tìm thấy kết nối Zalo OA.');
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.integrationConnection.update({
        where: { id },
        data: {
          status: 'PAUSED',
          capabilities: {
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
          action: 'integration.zalo.disconnected_local',
          entityType: 'IntegrationConnection',
          entityId: id,
        },
      });
      return { ...updated, upstreamUnsubscribed: false };
    });
  }

  // Run by the existing integration worker, not from a browser request. Lock the row
  // across token rotation so a second worker cannot reuse an already rotated refresh token.
  async refreshDue(now = new Date()) {
    const candidate = await this.prisma.integrationConnection.findFirst({
      where: {
        provider: 'ZALO',
        status: 'CONNECTED',
        credentialCiphertext: { not: null },
        tokenExpiresAt: { lte: new Date(now.getTime() + 5 * 60_000) },
      },
      orderBy: { tokenExpiresAt: 'asc' },
      select: { id: true },
    });
    if (!candidate) return false;
    try {
      await this.prisma.$transaction(
        async (tx) => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`ZALO-REFRESH:${candidate.id}`}))`;
          await tx.$queryRaw`SELECT id FROM integration_connections WHERE id = ${candidate.id} FOR UPDATE`;
          const row = await tx.integrationConnection.findUnique({ where: { id: candidate.id } });
          if (
            !row ||
            row.status !== 'CONNECTED' ||
            !row.credentialCiphertext ||
            !row.tokenExpiresAt ||
            row.tokenExpiresAt > new Date(Date.now() + 5 * 60_000)
          )
            return;
          const context = `zalo-connection:${row.businessId}:${row.externalAccountId}`;
          const current = this.crypto().decrypt<{
            accessToken: string;
            refreshToken: string;
            refreshExpiresAt: string | null;
          }>(row.credentialCiphertext, context);
          if (current.refreshExpiresAt && new Date(current.refreshExpiresAt) <= new Date()) {
            await tx.integrationConnection.update({
              where: { id: row.id },
              data: {
                status: 'REAUTH_REQUIRED',
                lastErrorCode: 'ZALO_REFRESH_EXPIRED',
                lastErrorAt: new Date(),
              },
            });
            return;
          }
          const next = await this.zalo.refresh(current.refreshToken);
          await tx.integrationConnection.update({
            where: { id: row.id },
            data: {
              credentialCiphertext: this.crypto().encrypt(
                {
                  accessToken: next.accessToken,
                  refreshToken: next.refreshToken,
                  refreshExpiresAt: next.refreshExpiresAt,
                },
                context,
              ),
              tokenExpiresAt: new Date(next.expiresAt),
              lastErrorCode: null,
              lastErrorAt: null,
            },
          });
        },
        { timeout: 20_000 },
      );
    } catch {
      // A transient provider failure must not delete the last durable refresh token.
      await this.prisma.integrationConnection.updateMany({
        where: { id: candidate.id, status: 'CONNECTED' },
        data: { lastErrorCode: 'ZALO_REFRESH_FAILED', lastErrorAt: new Date() },
      });
    }
    return true;
  }
}
