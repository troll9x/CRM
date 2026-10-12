import { createHash } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApplication } from '../src/bootstrap';
import { PrismaService } from '../src/prisma/prisma.service';
import { ZaloAuthService } from '../src/integrations/zalo-auth.service';

const ownerEmail = process.env.SEED_OWNER_EMAIL ?? 'owner@crm.local';
const ownerPassword = process.env.SEED_OWNER_PASSWORD ?? 'Local-test-password-123!';
const oaId = '456789123001';
const config: Record<string, string> = {
  ZALO_APP_ID: '123456789',
  ZALO_APP_SECRET: 'fixture-zalo-secret',
  ZALO_OAUTH_REDIRECT_URI: 'https://callback.example.test/api/v1/integrations/oauth/zalo/callback',
  ZALO_OA_SECRET_KEY: 'fixture-webhook-secret',
  INTEGRATION_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 17).toString('base64'),
};
const previous = Object.fromEntries(Object.keys(config).map((key) => [key, process.env[key]]));

describe('Zalo OA OAuth local contract (mock provider, scratch database only)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let providerMode: 'normal' | 'exchangeFail' | 'refreshFail' = 'normal';
  const provider = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(
      input instanceof URL ? input.href : typeof input === 'string' ? input : input.url,
    );
    if (url.pathname === '/v4/oa/access_token') {
      const body = init?.body as URLSearchParams;
      if (
        providerMode === 'exchangeFail' ||
        (providerMode === 'refreshFail' && body.get('grant_type') === 'refresh_token')
      )
        return Promise.resolve(new Response(JSON.stringify({ error: -1 }), { status: 200 }));
      const rotated = body.get('grant_type') === 'refresh_token';
      return Promise.resolve(
        new Response(
          JSON.stringify({
            access_token: rotated ? 'fixture-rotated-token' : 'fixture-oa-token',
            refresh_token: rotated ? 'fixture-rotated-refresh' : 'fixture-oa-refresh',
            expires_in: rotated ? '3600' : '60',
            refresh_token_expires_in: '2592000',
          }),
          { status: 200 },
        ),
      );
    }
    if (url.pathname === '/v2.0/oa/getoa')
      return Promise.resolve(
        new Response(JSON.stringify({ error: 0, data: { oaid: oaId, name: 'Fixture OA' } }), {
          status: 200,
        }),
      );
    return Promise.resolve(new Response(JSON.stringify({ error: -1 }), { status: 404 }));
  });

  beforeAll(async () => {
    if (!process.env.DATABASE_URL?.includes('channel_auth_scratch'))
      throw new Error('This suite requires an explicitly named scratch database.');
    Object.assign(process.env, config);
    vi.stubGlobal('fetch', provider);
    app = await createApplication();
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    if (app) await app.close();
    vi.unstubAllGlobals();
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  async function owner() {
    const agent = request.agent(app.getHttpServer());
    await agent
      .post('/api/v1/auth/sessions')
      .send({ email: ownerEmail, password: ownerPassword })
      .expect(201);
    return agent;
  }

  it('checks role, state, PKCE, denial, replay and expiration', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/integrations/oauth/zalo/start')
      .send({})
      .expect(401);
    const agent = await owner();
    const start = await agent.post('/api/v1/integrations/oauth/zalo/start').send({}).expect(201);
    const authorization = new URL(start.body.data.authorizationUrl as string);
    expect(authorization.host).toBe('oauth.zaloapp.com');
    expect(authorization.pathname).toBe('/v4/oa/permission');
    expect(authorization.searchParams.get('code_challenge')).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const state = authorization.searchParams.get('state')!;
    const stored = await prisma.integrationAuthAttempt.findUniqueOrThrow({
      where: { id: start.body.data.attemptId as string },
    });
    expect(stored.stateHash).toBe(createHash('sha256').update(state).digest('hex'));
    expect(stored.credentialCiphertext).not.toContain('codeVerifier');
    const [first, second] = await Promise.all([
      request(app.getHttpServer())
        .get('/api/v1/integrations/oauth/zalo/callback')
        .query({ state, error: 'access_denied' }),
      request(app.getHttpServer())
        .get('/api/v1/integrations/oauth/zalo/callback')
        .query({ state, error: 'access_denied' }),
    ]);
    expect([first.status, second.status].sort()).toEqual([303, 409]);
    const denied = await prisma.integrationAuthAttempt.findUniqueOrThrow({
      where: { id: stored.id },
    });
    expect(denied.status).toBe('DENIED');
    expect(denied.credentialCiphertext).toBeNull();
    await request(app.getHttpServer())
      .get('/api/v1/integrations/oauth/zalo/callback')
      .query({ state, code: 'fixture-code' })
      .expect(409);
    const expired = await agent.post('/api/v1/integrations/oauth/zalo/start').send({}).expect(201);
    const expiredState = new URL(expired.body.data.authorizationUrl as string).searchParams.get(
      'state',
    )!;
    await prisma.integrationAuthAttempt.update({
      where: { id: expired.body.data.attemptId as string },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await request(app.getHttpServer())
      .get('/api/v1/integrations/oauth/zalo/callback')
      .query({ state: expiredState, code: 'fixture-code' })
      .expect(409);
  });

  it('binds verified OA, refreshes rotating token, reconnects in place and disconnects', async () => {
    const agent = await owner();
    const start = await agent.post('/api/v1/integrations/oauth/zalo/start').send({}).expect(201);
    const state = new URL(start.body.data.authorizationUrl as string).searchParams.get('state')!;
    await request(app.getHttpServer())
      .get('/api/v1/integrations/oauth/zalo/callback')
      .query({ state, code: 'fixture-code', oa_id: oaId })
      .expect(303);
    const attemptId = start.body.data.attemptId as string;
    const choice = await agent
      .get(`/api/v1/integrations/oauth/zalo/attempts/${attemptId}`)
      .expect(200);
    expect(choice.body.data.accounts).toEqual([{ id: oaId, name: 'Fixture OA' }]);
    expect(JSON.stringify(choice.body)).not.toContain('fixture-oa-token');
    const currentStaff = await prisma.staffUser.findFirstOrThrow({
      where: { emailNormalized: ownerEmail.toLowerCase() },
      select: { id: true, businessId: true },
    });
    await expect(
      app
        .get(ZaloAuthService)
        .attempt({ id: 'other-actor', businessId: currentStaff.businessId } as never, attemptId),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      app
        .get(ZaloAuthService)
        .attempt({ id: currentStaff.id, businessId: 'other-business' } as never, attemptId),
    ).rejects.toMatchObject({ status: 404 });
    await agent
      .post(`/api/v1/integrations/oauth/zalo/attempts/${attemptId}/finalize`)
      .send({ oaId: '111111' })
      .expect(403);
    const saved = await agent
      .post(`/api/v1/integrations/oauth/zalo/attempts/${attemptId}/finalize`)
      .send({ oaId })
      .expect(201);
    const id = saved.body.data.id as string;
    const row = await prisma.integrationConnection.findUniqueOrThrow({ where: { id } });
    expect(row.status).toBe('CONNECTED');
    expect(row.credentialCiphertext).not.toContain('fixture-oa-token');
    await agent
      .post(`/api/v1/integrations/oauth/zalo/attempts/${attemptId}/finalize`)
      .send({ oaId })
      .expect(409);
    providerMode = 'refreshFail';
    expect(await app.get(ZaloAuthService).refreshDue()).toBe(true);
    const failedRefresh = await prisma.integrationConnection.findUniqueOrThrow({ where: { id } });
    expect(failedRefresh.credentialCiphertext).toBe(row.credentialCiphertext);
    expect(failedRefresh.lastErrorCode).toBe('ZALO_REFRESH_FAILED');
    providerMode = 'normal';
    expect(await app.get(ZaloAuthService).refreshDue()).toBe(true);
    const refreshed = await prisma.integrationConnection.findUniqueOrThrow({ where: { id } });
    expect(refreshed.credentialCiphertext).not.toBe(row.credentialCiphertext);
    expect(refreshed.tokenExpiresAt!.getTime()).toBeGreaterThan(row.tokenExpiresAt!.getTime());
    const reconnect = await agent
      .post('/api/v1/integrations/oauth/zalo/start')
      .send({ reconnectConnectionId: id })
      .expect(201);
    const nextState = new URL(reconnect.body.data.authorizationUrl as string).searchParams.get(
      'state',
    )!;
    await request(app.getHttpServer())
      .get('/api/v1/integrations/oauth/zalo/callback')
      .query({ state: nextState, code: 'fixture-code', oa_id: oaId })
      .expect(303);
    const again = await agent
      .post(`/api/v1/integrations/oauth/zalo/attempts/${reconnect.body.data.attemptId}/finalize`)
      .send({ oaId })
      .expect(201);
    expect(again.body.data.id).toBe(id);
    expect(
      await prisma.integrationConnection.count({
        where: { provider: 'ZALO', externalAccountId: oaId },
      }),
    ).toBe(1);
    const disconnected = await agent
      .post(`/api/v1/integrations/oauth/zalo/connections/${id}/disconnect`)
      .send({})
      .expect(201);
    expect(disconnected.body.data.upstreamUnsubscribed).toBe(false);
    const stopped = await prisma.integrationConnection.findUniqueOrThrow({ where: { id } });
    expect(stopped.status).toBe('PAUSED');
    expect(stopped.credentialCiphertext).toBeNull();
  });

  it('does not bind a mismatched OA or failed exchange and does not expose tokens', async () => {
    const agent = await owner();
    for (const mode of ['normal', 'exchangeFail'] as const) {
      providerMode = mode;
      const start = await agent.post('/api/v1/integrations/oauth/zalo/start').send({}).expect(201);
      const state = new URL(start.body.data.authorizationUrl as string).searchParams.get('state')!;
      const result = await request(app.getHttpServer())
        .get('/api/v1/integrations/oauth/zalo/callback')
        .query({ state, code: 'fixture-code', oa_id: mode === 'normal' ? '999999' : oaId })
        .expect(303);
      expect(result.headers.location).toContain('channelResult=failed');
      const row = await prisma.integrationAuthAttempt.findUniqueOrThrow({
        where: { id: start.body.data.attemptId as string },
      });
      expect(row.status).toBe('FAILED');
      expect(row.credentialCiphertext).toBeNull();
    }
    providerMode = 'normal';
  });
});
