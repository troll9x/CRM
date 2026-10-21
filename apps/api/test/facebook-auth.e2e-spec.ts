import { createHash, randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApplication } from '../src/bootstrap';
import { PrismaService } from '../src/prisma/prisma.service';
import { FacebookAuthService } from '../src/integrations/facebook-auth.service';
import { IntegrationWorkerService } from '../src/integrations/integration-worker.service';

const ownerEmail = process.env.SEED_OWNER_EMAIL ?? 'owner@crm.local';
const ownerPassword = process.env.SEED_OWNER_PASSWORD ?? 'Local-test-password-123!';
const pageId = '987654321001';
const secondPageId = '987654321002';
const config: Record<string, string> = {
  FACEBOOK_APP_ID: '123456789',
  FACEBOOK_APP_SECRET: 'fixture-app-secret',
  FACEBOOK_GRAPH_API_VERSION: 'v25.0',
  FACEBOOK_OAUTH_REDIRECT_URI:
    'https://callback.example.test/api/v1/integrations/oauth/facebook/callback',
  FACEBOOK_OAUTH_SCOPES: 'pages_show_list,pages_messaging,pages_manage_metadata',
  FACEBOOK_WEBHOOK_VERIFY_TOKEN: 'fixture-verify-token',
  INTEGRATION_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 19).toString('base64'),
};
const previous = Object.fromEntries(Object.keys(config).map((key) => [key, process.env[key]]));

describe('Facebook OAuth local contract (mock provider, scratch database only)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let providerMode:
    'normal' | 'missingScope' | 'subscriptionFail' | 'secondSubscriptionFail' | 'paged' = 'normal';
  const graph = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(
      input instanceof URL ? input.href : typeof input === 'string' ? input : input.url,
    );
    const body = url.pathname.endsWith('/oauth/access_token')
      ? url.searchParams.has('code')
        ? url.searchParams.get('code') === 'invalid-code'
          ? { error: 'fixture exchange failure' }
          : { access_token: 'fixture-short-token' }
        : { access_token: 'fixture-user-token', expires_in: 3600 }
      : url.pathname.endsWith('/me/permissions')
        ? {
            data: config.FACEBOOK_OAUTH_SCOPES!.split(',').map((permission) => ({
              permission,
              status:
                providerMode === 'missingScope' && permission === 'pages_messaging'
                  ? 'declined'
                  : 'granted',
            })),
          }
        : url.pathname.endsWith('/me/accounts')
          ? providerMode === 'paged'
            ? url.searchParams.get('after') === 'next-page'
              ? {
                  data: [
                    {
                      id: secondPageId,
                      name: 'Second Fixture Page',
                      access_token: 'fixture-second-page-token',
                      tasks: ['PROFILE_PLUS_MESSAGING'],
                    },
                  ],
                }
              : {
                  data: [
                    {
                      id: pageId,
                      name: 'Fixture Page',
                      access_token: 'fixture-page-token',
                      tasks: ['PROFILE_PLUS_MESSAGING'],
                    },
                  ],
                  paging: {
                    next: 'https://graph.facebook.com/next',
                    cursors: { after: 'next-page' },
                  },
                }
            : {
                data: [
                  {
                    id: pageId,
                    name: 'Fixture Page',
                    access_token: 'fixture-page-token',
                    tasks: ['PROFILE_PLUS_MESSAGING'],
                  },
                  {
                    id: secondPageId,
                    name: 'Second Fixture Page',
                    access_token: 'fixture-second-page-token',
                    tasks: ['PROFILE_PLUS_MESSAGING'],
                  },
                ],
              }
          : url.pathname.endsWith('/subscribed_apps')
            ? init?.method === 'POST'
              ? {
                  success:
                    providerMode !== 'subscriptionFail' &&
                    !(
                      providerMode === 'secondSubscriptionFail' &&
                      url.pathname.includes(secondPageId)
                    ),
                }
              : { data: [{ id: config.FACEBOOK_APP_ID }] }
            : { error: 'unsupported fixture path' };
    return Promise.resolve(
      new Response(JSON.stringify(body), { status: 'error' in body ? 404 : 200 }),
    );
  });

  beforeAll(async () => {
    if (!process.env.DATABASE_URL?.includes('channel_auth_scratch'))
      throw new Error('This suite requires an explicitly named scratch database.');
    Object.assign(process.env, config);
    vi.stubGlobal('fetch', graph);
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

  it('rejects missing, expired and replayed state, including parallel callback claims', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/integrations/oauth/facebook/start')
      .send({})
      .expect(401);
    const agent = await owner();
    await request(app.getHttpServer())
      .get('/api/v1/integrations/oauth/facebook/callback')
      .query({ state: 'wrong' })
      .expect(400);
    const start = await agent
      .post('/api/v1/integrations/oauth/facebook/start')
      .send({})
      .expect(201);
    const state = new URL(start.body.data.authorizationUrl as string).searchParams.get('state')!;
    const [first, second] = await Promise.all([
      request(app.getHttpServer())
        .get('/api/v1/integrations/oauth/facebook/callback')
        .query({ state, error: 'access_denied' }),
      request(app.getHttpServer())
        .get('/api/v1/integrations/oauth/facebook/callback')
        .query({ state, error: 'access_denied' }),
    ]);
    expect([first.status, second.status].sort()).toEqual([303, 409]);
    const denied = await agent
      .get(`/api/v1/integrations/oauth/facebook/attempts/${start.body.data.attemptId}`)
      .expect(200);
    expect(denied.body.data.status).toBe('DENIED');
    const expired = await agent
      .post('/api/v1/integrations/oauth/facebook/start')
      .send({})
      .expect(201);
    const expiredState = new URL(expired.body.data.authorizationUrl as string).searchParams.get(
      'state',
    )!;
    await prisma.integrationAuthAttempt.update({
      where: { stateHash: createHash('sha256').update(expiredState).digest('hex') },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await request(app.getHttpServer())
      .get('/api/v1/integrations/oauth/facebook/callback')
      .query({ state: expiredState, code: 'fixture-code' })
      .expect(409);
  });

  it('exchanges, validates, encrypts, selects, subscribes, reconnects and disconnects without duplicates', async () => {
    const agent = await owner();
    const start = await agent
      .post('/api/v1/integrations/oauth/facebook/start')
      .send({})
      .expect(201);
    const state = new URL(start.body.data.authorizationUrl as string).searchParams.get('state')!;
    const callback = await request(app.getHttpServer())
      .get('/api/v1/integrations/oauth/facebook/callback')
      .query({ state, code: 'fixture-code' })
      .expect(303);
    expect(callback.headers.location).toContain('channelResult=ready');
    expect(JSON.stringify(callback.body)).not.toContain('fixture-user-token');
    const attemptId = start.body.data.attemptId as string;
    const choice = await agent
      .get(`/api/v1/integrations/oauth/facebook/attempts/${attemptId}`)
      .expect(200);
    expect(choice.body.data.accounts).toEqual([
      { id: pageId, name: 'Fixture Page', tasks: ['PROFILE_PLUS_MESSAGING'] },
      { id: secondPageId, name: 'Second Fixture Page', tasks: ['PROFILE_PLUS_MESSAGING'] },
    ]);
    expect(JSON.stringify(choice.body)).not.toContain('fixture-page-token');
    const currentStaff = await prisma.staffUser.findFirstOrThrow({
      where: { emailNormalized: ownerEmail.toLowerCase() },
      select: { id: true, businessId: true },
    });
    await expect(
      app
        .get(FacebookAuthService)
        .attempt({ id: 'other-actor', businessId: currentStaff.businessId } as never, attemptId),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      app
        .get(FacebookAuthService)
        .attempt({ id: currentStaff.id, businessId: 'other-business' } as never, attemptId),
    ).rejects.toMatchObject({ status: 404 });
    await agent
      .post(`/api/v1/integrations/oauth/facebook/attempts/${attemptId}/finalize`)
      .send({ pageId: '999999' })
      .expect(403);
    const final = await agent
      .post(`/api/v1/integrations/oauth/facebook/attempts/${attemptId}/finalize`)
      .send({ pageId })
      .expect(201);
    const connectionId = final.body.data.id as string;
    const row = await prisma.integrationConnection.findUniqueOrThrow({
      where: { id: connectionId },
    });
    expect(row.status).toBe('CONNECTED');
    expect(row.capabilities).toMatchObject({
      authorization: 'VERIFIED',
      pageSubscription: 'VERIFIED',
      webhookSubscription: 'APP_CONFIGURATION_PENDING',
      messages: 'PAGE_SUBSCRIBED',
      comments: 'PAGE_SUBSCRIBED',
    });
    expect(row.credentialCiphertext).toBeTruthy();
    expect(row.credentialCiphertext).not.toContain('fixture-page-token');
    expect(JSON.stringify(final.body)).not.toContain('fixture-page-token');
    await agent
      .post(`/api/v1/integrations/oauth/facebook/attempts/${attemptId}/finalize`)
      .send({ pageId })
      .expect(409);

    const reconnect = await agent
      .post('/api/v1/integrations/oauth/facebook/start')
      .send({ reconnectConnectionId: connectionId })
      .expect(201);
    const newState = new URL(reconnect.body.data.authorizationUrl as string).searchParams.get(
      'state',
    )!;
    await request(app.getHttpServer())
      .get('/api/v1/integrations/oauth/facebook/callback')
      .query({ state: newState, code: 'fixture-code-2' })
      .expect(303);
    providerMode = 'subscriptionFail';
    await agent
      .post(
        `/api/v1/integrations/oauth/facebook/attempts/${reconnect.body.data.attemptId}/finalize`,
      )
      .send({ pageId })
      .expect(502);
    expect(
      (await prisma.integrationConnection.findUniqueOrThrow({ where: { id: connectionId } }))
        .credentialCiphertext,
    ).toBe(row.credentialCiphertext);
    providerMode = 'normal';
    const again = await agent
      .post(
        `/api/v1/integrations/oauth/facebook/attempts/${reconnect.body.data.attemptId}/finalize`,
      )
      .send({ pageId })
      .expect(201);
    expect(again.body.data.id).toBe(connectionId);
    expect(
      await prisma.integrationConnection.count({
        where: { businessId: row.businessId, provider: 'FACEBOOK', externalAccountId: pageId },
      }),
    ).toBe(1);
    await prisma.integrationConnection.update({
      where: { id: connectionId },
      data: { tokenExpiresAt: new Date(Date.now() - 1000) },
    });
    await app.get(IntegrationWorkerService).runOnce();
    expect(
      (await prisma.integrationConnection.findUniqueOrThrow({ where: { id: connectionId } }))
        .status,
    ).toBe('REAUTH_REQUIRED');
    const expiredAttempt = await prisma.integrationAuthAttempt.findFirst({
      where: { errorCode: 'ATTEMPT_EXPIRED' },
    });
    expect(expiredAttempt?.credentialCiphertext).toBeNull();
    const disconnected = await agent
      .post(`/api/v1/integrations/oauth/facebook/connections/${connectionId}/disconnect`)
      .send({})
      .expect(201);
    expect(disconnected.body.data.upstreamUnsubscribed).toBe(false);
    const stopped = await prisma.integrationConnection.findUniqueOrThrow({
      where: { id: connectionId },
    });
    expect(stopped.credentialCiphertext).toBeNull();
    expect(stopped.status).toBe('PAUSED');
    expect(graph).toHaveBeenCalled();
  });

  it('rejects a failed exchange and missing granted scope before account selection', async () => {
    const agent = await owner();
    for (const [code, mode] of [
      ['invalid-code', 'normal'],
      ['fixture-code', 'missingScope'],
    ] as const) {
      providerMode = mode;
      const start = await agent
        .post('/api/v1/integrations/oauth/facebook/start')
        .send({})
        .expect(201);
      const state = new URL(start.body.data.authorizationUrl as string).searchParams.get('state')!;
      const callback = await request(app.getHttpServer())
        .get('/api/v1/integrations/oauth/facebook/callback')
        .query({ state, code })
        .expect(303);
      expect(callback.headers.location).toContain('channelResult=failed');
      const row = await prisma.integrationAuthAttempt.findUniqueOrThrow({
        where: { id: start.body.data.attemptId as string },
      });
      expect(row.status).toBe('FAILED');
      expect(row.credentialCiphertext).toBeNull();
    }
    providerMode = 'normal';
  });

  it('selects two Pages in one grant and disconnects only the selected Page', async () => {
    const agent = await owner();
    const start = await agent
      .post('/api/v1/integrations/oauth/facebook/start')
      .send({})
      .expect(201);
    const state = new URL(start.body.data.authorizationUrl as string).searchParams.get('state')!;
    await request(app.getHttpServer())
      .get('/api/v1/integrations/oauth/facebook/callback')
      .query({ state, code: 'fixture-multi-page' })
      .expect(303);
    const path = `/api/v1/integrations/oauth/facebook/attempts/${start.body.data.attemptId}/finalize`;
    await agent
      .post(path)
      .send({ pageIds: [pageId, pageId] })
      .expect(400);
    const result = await agent
      .post(path)
      .send({ pageIds: [pageId, secondPageId] })
      .expect(201);
    expect(result.body.data.connections).toHaveLength(2);
    const [first, second] = result.body.data.connections as [{ id: string }, { id: string }];
    expect(first.id).not.toBe(second.id);
    const rows = await prisma.integrationConnection.findMany({
      where: { id: { in: [first.id, second.id] } },
      orderBy: { externalAccountId: 'asc' },
    });
    expect(rows.map((row) => row.externalAccountId)).toEqual([pageId, secondPageId]);
    expect(rows.every((row) => row.status === 'CONNECTED' && !!row.credentialCiphertext)).toBe(
      true,
    );
    expect(JSON.stringify(result.body)).not.toContain('fixture-page-token');
    await agent
      .post(`/api/v1/integrations/oauth/facebook/connections/${first.id}/disconnect`)
      .send({})
      .expect(201);
    expect(
      (await prisma.integrationConnection.findUniqueOrThrow({ where: { id: second.id } })).status,
    ).toBe('CONNECTED');
  });

  it('loads another Page when the first Graph page has fewer than 100 items', async () => {
    providerMode = 'paged';
    try {
      const agent = await owner();
      const start = await agent
        .post('/api/v1/integrations/oauth/facebook/start')
        .send({})
        .expect(201);
      const state = new URL(start.body.data.authorizationUrl as string).searchParams.get('state')!;
      await request(app.getHttpServer())
        .get('/api/v1/integrations/oauth/facebook/callback')
        .query({ state, code: 'fixture-paged' })
        .expect(303);
      const attempt = await agent
        .get(`/api/v1/integrations/oauth/facebook/attempts/${start.body.data.attemptId}`)
        .expect(200);
      const accounts = attempt.body.data.accounts as Array<{ id: string }>;
      expect(accounts.map((page) => page.id)).toEqual([pageId, secondPageId]);
    } finally {
      providerMode = 'normal';
    }
  });

  it('reports the failing Page and leaves both CRM connections unchanged', async () => {
    const agent = await owner();
    const businessId = 'business_local_default';
    const before = await prisma.integrationConnection.findMany({
      where: {
        businessId,
        provider: 'FACEBOOK',
        externalAccountId: { in: [pageId, secondPageId] },
      },
      orderBy: { externalAccountId: 'asc' },
    });
    const start = await agent
      .post('/api/v1/integrations/oauth/facebook/start')
      .send({})
      .expect(201);
    const state = new URL(start.body.data.authorizationUrl as string).searchParams.get('state')!;
    await request(app.getHttpServer())
      .get('/api/v1/integrations/oauth/facebook/callback')
      .query({ state, code: 'fixture-fail-second' })
      .expect(303);
    providerMode = 'secondSubscriptionFail';
    try {
      const result = await agent
        .post(`/api/v1/integrations/oauth/facebook/attempts/${start.body.data.attemptId}/finalize`)
        .send({ pageIds: [pageId, secondPageId] })
        .expect(502);
      expect(result.body.error.code).toBe('PAGE_SUBSCRIPTION_FAILED');
      expect(result.body.error.message).toContain('Second Fixture Page');
      const after = await prisma.integrationConnection.findMany({
        where: {
          businessId,
          provider: 'FACEBOOK',
          externalAccountId: { in: [pageId, secondPageId] },
        },
        orderBy: { externalAccountId: 'asc' },
      });
      expect(
        after.map((row) => ({
          id: row.id,
          status: row.status,
          credentialCiphertext: row.credentialCiphertext,
        })),
      ).toEqual(
        before.map((row) => ({
          id: row.id,
          status: row.status,
          credentialCiphertext: row.credentialCiphertext,
        })),
      );
      const attempt = await prisma.integrationAuthAttempt.findUniqueOrThrow({
        where: { id: start.body.data.attemptId as string },
      });
      expect(attempt.status).toBe('READY');
    } finally {
      providerMode = 'normal';
    }
  });

  it('limits staff inbox and send access to assigned Page', async () => {
    const ownerAgent = await owner();
    const businessId = 'business_local_default';
    const first = await prisma.integrationConnection.findUniqueOrThrow({
      where: {
        businessId_provider_externalAccountId: {
          businessId,
          provider: 'FACEBOOK',
          externalAccountId: pageId,
        },
      },
    });
    const second = await prisma.integrationConnection.findUniqueOrThrow({
      where: {
        businessId_provider_externalAccountId: {
          businessId,
          provider: 'FACEBOOK',
          externalAccountId: secondPageId,
        },
      },
    });
    const email = `page-staff-${Date.now()}@crm.local`;
    const password = 'Fixture-staff-password-123!';
    const created = await ownerAgent
      .post('/api/v1/staff')
      .send({ email, password, displayName: 'Page Staff Fixture', roleCodes: ['sales'] })
      .expect(201);
    const staffId = created.body.data.id as string;
    const staffAgent = request.agent(app.getHttpServer());
    await staffAgent.post('/api/v1/auth/sessions').send({ email, password }).expect(201);
    const firstChat = await prisma.conversation.create({
      data: {
        businessId,
        connectionId: first.id,
        externalId: `fixture-first-${Date.now()}`,
        subject: 'Same customer name',
      },
    });
    const secondChat = await prisma.conversation.create({
      data: {
        businessId,
        connectionId: second.id,
        externalId: `fixture-second-${Date.now()}`,
        subject: 'Same customer name',
      },
    });
    try {
      const before = await staffAgent.get('/api/v1/integrations/inbox').expect(200);
      expect(before.body.data).toEqual([]);
      await staffAgent
        .get(`/api/v1/integrations/conversations/${secondChat.id}/messages`)
        .expect(403);
      await ownerAgent
        .put(`/api/v1/integrations/connections/${second.id}/staff-access/${staffId}`)
        .send({ canRead: true, canSend: false })
        .expect(200);
      const inbox = await staffAgent.get('/api/v1/integrations/inbox').expect(200);
      const visibleChats = inbox.body.data as Array<{ id: string }>;
      expect(visibleChats.map((row) => row.id)).toEqual([secondChat.id]);
      await staffAgent
        .get(`/api/v1/integrations/conversations/${firstChat.id}/messages`)
        .expect(403);
      await staffAgent
        .get(`/api/v1/integrations/conversations/${secondChat.id}/messages`)
        .expect(200);
      await staffAgent
        .post(`/api/v1/integrations/conversations/${secondChat.id}/send`)
        .send({ body: 'Fixture', requestKey: randomUUID() })
        .expect(403);
      await ownerAgent
        .put(`/api/v1/integrations/connections/${second.id}/staff-access/${staffId}`)
        .send({ canRead: true, canSend: true })
        .expect(200);
      const capability = await staffAgent
        .get(`/api/v1/integrations/conversations/${secondChat.id}/send-capability`)
        .expect(200);
      expect(capability.body.data.canSend).toBe(false); // Provider/window gate still applies.
      await ownerAgent
        .put(`/api/v1/integrations/connections/${second.id}/staff-access/${staffId}`)
        .send({ canRead: false, canSend: false })
        .expect(200);
      expect((await staffAgent.get('/api/v1/integrations/inbox').expect(200)).body.data).toEqual(
        [],
      );
    } finally {
      await prisma.conversation.deleteMany({
        where: { id: { in: [firstChat.id, secondChat.id] } },
      });
      await prisma.integrationStaffAccess.deleteMany({ where: { staffId } });
      await prisma.session.deleteMany({ where: { staffUserId: staffId } });
      await prisma.staffUserRole.deleteMany({ where: { staffUserId: staffId } });
      await prisma.auditLog.deleteMany({ where: { actorId: staffId } });
      await prisma.staffUser.delete({ where: { id: staffId } });
    }
  });

  it('refuses to attach one Page to a second business', async () => {
    const foreignBusiness = await prisma.business.create({
      data: {
        id: `fixture-other-business-${Date.now()}`,
        name: 'Other business fixture',
        timezone: 'Asia/Ho_Chi_Minh',
        currency: 'VND',
      },
    });
    const foreignConnection = await prisma.integrationConnection.create({
      data: {
        businessId: foreignBusiness.id,
        provider: 'FACEBOOK',
        externalAccountId: secondPageId,
        displayName: 'Foreign Page fixture',
        status: 'CONNECTED',
        capabilities: { authorization: 'VERIFIED' },
      },
    });
    try {
      const agent = await owner();
      const start = await agent
        .post('/api/v1/integrations/oauth/facebook/start')
        .send({})
        .expect(201);
      const state = new URL(start.body.data.authorizationUrl as string).searchParams.get('state')!;
      await request(app.getHttpServer())
        .get('/api/v1/integrations/oauth/facebook/callback')
        .query({ state, code: 'fixture-cross-business' })
        .expect(303);
      await agent
        .post(`/api/v1/integrations/oauth/facebook/attempts/${start.body.data.attemptId}/finalize`)
        .send({ pageId: secondPageId })
        .expect(409);
      expect(
        (
          await prisma.integrationConnection.findUniqueOrThrow({
            where: { id: foreignConnection.id },
          })
        ).businessId,
      ).toBe(foreignBusiness.id);
    } finally {
      await prisma.integrationConnection.delete({ where: { id: foreignConnection.id } });
      await prisma.business.delete({ where: { id: foreignBusiness.id } });
    }
  });
});
