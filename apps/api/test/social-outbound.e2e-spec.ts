import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApplication } from '../src/bootstrap';
import { CredentialCrypto } from '../src/integrations/credential-crypto';
import { parseFacebookWebhook } from '../src/integrations/facebook-webhook-parser';
import { IntegrationsService } from '../src/integrations/integrations.service';
import { IntegrationWorkerService } from '../src/integrations/integration-worker.service';
import { PrismaService } from '../src/prisma/prisma.service';

const databaseName = process.env.DATABASE_URL
  ? new URL(process.env.DATABASE_URL).pathname.slice(1)
  : '';
if (!databaseName.includes('scratch'))
  throw new Error('Social outbound E2E requires an isolated scratch database.');

describe('Facebook outbound text with durable intent', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let conversationId = '';
  let commentId = '';
  let foreignConversationId = '';
  const pageId = `1579${Math.floor(Math.random() * 1e12).toString().padStart(12, '0')}`;
  const psid = '8889000012345678';
  let graphPosts = 0;
  let grantComments = false;
  let graphMode: 'ACCEPT' | 'UNKNOWN' = 'ACCEPT';
  const ownerEmail = process.env.SEED_OWNER_EMAIL ?? 'owner@crm.local';
  const ownerPassword = process.env.SEED_OWNER_PASSWORD ?? 'Local-test-password-123!';

  beforeAll(async () => {
    app = await createApplication();
    await app.init();
    prisma = app.get(PrismaService);
    const key = app.get(ConfigService).get<string>('INTEGRATION_TOKEN_ENCRYPTION_KEY');
    const credentialCiphertext = new CredentialCrypto(key).encrypt(
      { pageToken: 'fixture-page-token', userToken: 'fixture-user-token' },
      `facebook-connection:business_local_default:${pageId}`,
    );
    const connection = await prisma.integrationConnection.create({
      data: {
        businessId: 'business_local_default', provider: 'FACEBOOK', externalAccountId: pageId,
        displayName: 'Fixture Page', status: 'CONNECTED',
        capabilities: { authorization: 'VERIFIED' }, credentialCiphertext,
      },
    });
    const identity = await prisma.externalCustomerIdentity.create({
      data: { businessId: 'business_local_default', connectionId: connection.id, externalUserId: psid },
    });
    const conversation = await prisma.conversation.create({
      data: {
        businessId: 'business_local_default', connectionId: connection.id,
        identityId: identity.id, externalId: psid,
      },
    });
    conversationId = conversation.id;
    await prisma.conversationMessage.create({
      data: {
        connectionId: connection.id, conversationId, externalMessageId: `incoming-${randomUUID()}`,
        direction: 'INBOUND', body: 'Fixture inbound', providerAt: new Date(),
      },
    });
    commentId = (await prisma.socialComment.create({
      data: {
        businessId: 'business_local_default', connectionId: connection.id,
        externalCommentId: '111_222', externalPostId: '111_333',
        providerAt: new Date(),
      },
    })).id;
    const foreign = await prisma.business.create({ data: { name: 'Foreign outbound fixture' } });
    const foreignConnection = await prisma.integrationConnection.create({
      data: {
        businessId: foreign.id, provider: 'FACEBOOK',
        externalAccountId: `999${Math.floor(Math.random() * 1e10)}`,
        displayName: 'Foreign',
      },
    });
    foreignConversationId = (await prisma.conversation.create({
      data: { businessId: foreign.id, connectionId: foreignConnection.id, externalId: '9001' },
    })).id;
    vi.stubGlobal('fetch', vi.fn((input: string | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith('/me/permissions'))
        return new Response(JSON.stringify({ data: [
          { permission: 'pages_messaging', status: 'granted' },
          ...(grantComments ? [
            { permission: 'pages_read_user_content', status: 'granted' },
            { permission: 'pages_manage_engagement', status: 'granted' },
          ] : []),
        ] }), { status: 200 });
      if (url.pathname.endsWith('/me/accounts'))
        return new Response(JSON.stringify({ data: [{ id: pageId, tasks: grantComments ? ['MESSAGE', 'MODERATE'] : ['MESSAGE'] }] }), { status: 200 });
      if (url.pathname.endsWith('/me'))
        return new Response(JSON.stringify({ id: pageId }), { status: 200 });
      if (url.pathname.endsWith(`/${pageId}/messages`) && init?.method === 'POST') {
        graphPosts++;
        if (graphMode === 'UNKNOWN') throw new Error('simulated lost response');
        return new Response(JSON.stringify({
          recipient_id: psid, message_id: `m.outbound.${graphPosts}`,
        }), { status: 200 });
      }
      if (url.pathname.endsWith('/111_222/comments') && init?.method === 'POST') {
        graphPosts++;
        return new Response(JSON.stringify({ id: `111_reply_${graphPosts}` }), { status: 200 });
      }
      throw new Error('Unexpected Graph request');
    }));
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    await app?.close();
  });

  it('scopes source, sends once, persists provider ID and refuses comment without grant', async () => {
    const owner = request.agent(app.getHttpServer());
    await owner.post('/api/v1/auth/sessions')
      .send({ email: ownerEmail, password: ownerPassword }).expect(201);
    await request(app.getHttpServer())
      .post(`/api/v1/integrations/conversations/${conversationId}/send`)
      .send({ body: 'Hello', requestKey: randomUUID() }).expect(401);
    await owner.post(`/api/v1/integrations/conversations/${foreignConversationId}/send`)
      .send({ body: 'Hello', requestKey: randomUUID() }).expect(404);
    const capability = await owner.get(
      `/api/v1/integrations/conversations/${conversationId}/send-capability`,
    ).expect(200);
    expect(capability.body.data.status).toBe('CAN_SEND');
    const grants = await owner.get(
      `/api/v1/integrations/connections/${capability.body.data.connectionId}/facebook-grants`,
    ).expect(200);
    expect(grants.body.data).toMatchObject({
      status: 'CHECKED', permissions: { pages_messaging: true, pages_manage_engagement: false },
      tasks: { messaging: true, moderation: false },
    });
    const payload = { body: 'Fixture outbound reply', requestKey: randomUUID() };
    const first = await owner.post(`/api/v1/integrations/conversations/${conversationId}/send`)
      .send(payload).expect(201);
    expect(first.body.data).toMatchObject({
      status: 'SENT_TO_PROVIDER', providerObjectId: 'm.outbound.1',
    });
    const replay = await owner.post(`/api/v1/integrations/conversations/${conversationId}/send`)
      .send(payload).expect(201);
    expect(replay.body.data.id).toBe(first.body.data.id);
    expect(graphPosts).toBe(1);
    expect(await prisma.conversationMessage.count({
      where: { conversationId, externalMessageId: 'm.outbound.1' },
    })).toBe(1);
    const echo = parseFacebookWebhook({
      object: 'page', entry: [{
        id: pageId, messaging: [{
          sender: { id: pageId }, recipient: { id: psid },
          timestamp: Date.now(),
          message: { mid: 'm.outbound.1', is_echo: true, text: payload.body },
        }],
      }],
    })[0]?.events[0];
    expect(echo?.kind).toBe('MESSAGE');
    const connectionId = (await prisma.conversation.findUniqueOrThrow({
      where: { id: conversationId }, select: { connectionId: true },
    })).connectionId;
    await app.get(IntegrationsService).enqueue({
      connectionId, kind: 'MESSAGE', idempotencyKey: echo!.key,
      providerObjectId: echo!.objectId, providerAt: echo!.providerAt,
      payload: echo!.payload,
    });
    for (let i = 0; i < 12; i++) {
      if ((await prisma.integrationJob.findFirst({
        where: { connectionId, idempotencyKey: echo!.key }, select: { status: true },
      }))?.status === 'SUCCEEDED') break;
      await app.get(IntegrationWorkerService).runOnce();
    }
    expect(await prisma.conversationMessage.count({
      where: { conversationId, externalMessageId: 'm.outbound.1' },
    })).toBe(1);
    await owner.post(`/api/v1/integrations/conversations/${conversationId}/send`)
      .send({ ...payload, body: 'Different' }).expect(409);
    const commentCapability = await owner.get(
      `/api/v1/integrations/comments/${commentId}/reply-capability`,
    ).expect(200);
    expect(commentCapability.body.data.status).toBe('BLOCKED_PERMISSION');
    await owner.post(`/api/v1/integrations/comments/${commentId}/reply`)
      .send({ body: 'Reply', requestKey: randomUUID() }).expect(409);
  });

  it('keeps unknown send once and does not replay after timeout', async () => {
    graphMode = 'UNKNOWN';
    const owner = request.agent(app.getHttpServer());
    await owner.post('/api/v1/auth/sessions')
      .send({ email: ownerEmail, password: ownerPassword }).expect(201);
    const payload = { body: 'Maybe accepted', requestKey: randomUUID() };
    const first = await owner.post(`/api/v1/integrations/conversations/${conversationId}/send`)
      .send(payload).expect(201);
    expect(first.body.data.status).toBe('UNKNOWN');
    await owner.post(`/api/v1/integrations/conversations/${conversationId}/send`)
      .send(payload).expect(201);
    expect(graphPosts).toBe(2);
    expect(await prisma.conversationMessage.count({
      where: { conversationId, body: 'Maybe accepted' },
    })).toBe(0);
  });

  it('replies to the exact comment only after both grants and moderation task', async () => {
    graphMode = 'ACCEPT';
    grantComments = true;
    const owner = request.agent(app.getHttpServer());
    await owner.post('/api/v1/auth/sessions')
      .send({ email: ownerEmail, password: ownerPassword }).expect(201);
    const capability = await owner.get(
      `/api/v1/integrations/comments/${commentId}/reply-capability`,
    ).expect(200);
    expect(capability.body.data.status).toBe('CAN_SEND');
    const payload = { body: 'Fixture comment reply', requestKey: randomUUID() };
    const sent = await owner.post(`/api/v1/integrations/comments/${commentId}/reply`)
      .send(payload).expect(201);
    expect(sent.body.data).toMatchObject({
      status: 'SENT_TO_PROVIDER', providerObjectId: `111_reply_${graphPosts}`,
    });
    const reply = await prisma.socialComment.findUniqueOrThrow({
      where: { connectionId_externalCommentId: {
        connectionId: capability.body.data.connectionId,
        externalCommentId: sent.body.data.providerObjectId,
      } },
    });
    expect(reply.externalParentId).toBe('111_222');
    expect(reply.externalPostId).toBe('111_333');
    await owner.post(`/api/v1/integrations/comments/${commentId}/reply`)
      .send(payload).expect(201);
    expect(await prisma.socialComment.count({ where: { id: reply.id } })).toBe(1);
  });
});
