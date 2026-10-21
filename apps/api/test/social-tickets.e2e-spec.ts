import type { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApplication } from '../src/bootstrap';
import { PrismaService } from '../src/prisma/prisma.service';

const databaseName = process.env.DATABASE_URL
  ? new URL(process.env.DATABASE_URL).pathname.slice(1)
  : '';
if (!databaseName.includes('scratch'))
  throw new Error('Social ticket E2E requires an isolated scratch database.');

describe('social tickets from stored chat and comments', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let conversationId = '';
  let commentId = '';
  let foreignCommentId = '';
  const requestPrefix = randomUUID();
  const ownerEmail = process.env.SEED_OWNER_EMAIL ?? 'owner@crm.local';
  const ownerPassword = process.env.SEED_OWNER_PASSWORD ?? 'Local-test-password-123!';

  beforeAll(async () => {
    app = await createApplication();
    await app.init();
    prisma = app.get(PrismaService);
    const connection = await prisma.integrationConnection.create({
      data: {
        businessId: 'business_local_default',
        provider: 'FACEBOOK',
        externalAccountId: `fixture-social-page-${randomUUID()}`,
        displayName: 'Fixture Page',
      },
    });
    const conversation = await prisma.conversation.create({
      data: {
        businessId: 'business_local_default',
        connectionId: connection.id,
        externalId: 'fixture-conversation',
        unreadAt: new Date(),
      },
    });
    conversationId = conversation.id;
    const comment = await prisma.socialComment.create({
      data: {
        businessId: 'business_local_default',
        connectionId: connection.id,
        externalCommentId: 'fixture-comment',
        externalPostId: 'fixture-post',
        body: 'Fixture comment',
        sourceUrl: 'https://www.facebook.com/fixture/posts/1',
        providerAt: new Date(),
      },
    });
    commentId = comment.id;
    const foreign = await prisma.business.create({ data: { name: 'Isolated foreign business' } });
    const foreignConnection = await prisma.integrationConnection.create({
      data: {
        businessId: foreign.id,
        provider: 'FACEBOOK',
        externalAccountId: `foreign-fixture-page-${randomUUID()}`,
        displayName: 'Foreign Page',
      },
    });
    const foreignComment = await prisma.socialComment.create({
      data: {
        businessId: foreign.id,
        connectionId: foreignConnection.id,
        externalCommentId: 'foreign-comment',
        externalPostId: 'foreign-post',
        providerAt: new Date(),
      },
    });
    foreignCommentId = foreignComment.id;
  });

  afterAll(async () => {
    await app?.close();
  });

  it('enforces source scope, idempotency, version, lifecycle and audit', async () => {
    const owner = request.agent(app.getHttpServer());
    await owner
      .post('/api/v1/auth/sessions')
      .send({ email: ownerEmail, password: ownerPassword })
      .expect(201);
    await request(app.getHttpServer()).get('/api/v1/integrations/tickets').expect(401);
    await owner
      .post('/api/v1/integrations/tickets')
      .send({
        sourceType: 'COMMENT',
        sourceId: foreignCommentId,
        requestKey: `${requestPrefix}-foreign`,
        kind: 'OTHER',
        priority: 'NORMAL',
        summary: 'Should not exist',
      })
      .expect(404);
    await owner
      .post('/api/v1/integrations/tickets')
      .send({
        sourceType: 'CONVERSATION',
        sourceId: conversationId,
        requestKey: `${requestPrefix}-bad-assignee`,
        kind: 'OTHER',
        priority: 'NORMAL',
        summary: 'Should not exist',
        assignedStaffId: 'other-business-staff',
      })
      .expect(404);
    const assignees = await owner.get('/api/v1/integrations/assignees').expect(200);
    const assigneeId = assignees.body.data[0].id as string;
    const payload = {
      sourceType: 'CONVERSATION',
      sourceId: conversationId,
      requestKey: `${requestPrefix}-conversation`,
      kind: 'PRODUCT',
      priority: 'HIGH',
      summary: 'Need a product quote',
      labels: ['new', 'priority'],
      assignedStaffId: assigneeId,
    };
    const created = await owner.post('/api/v1/integrations/tickets').send(payload).expect(201);
    const id = created.body.data.id as string;
    expect(created.body.data.version).toBe(1);
    expect(created.body.data.events).toHaveLength(1);
    expect(created.body.data.assignedStaff.id).toBe(assigneeId);
    expect(
      (await owner.post('/api/v1/integrations/tickets').send(payload).expect(201)).body.data.id,
    ).toBe(id);
    await owner
      .post('/api/v1/integrations/tickets')
      .send({ ...payload, summary: 'Different request' })
      .expect(409);
    await owner
      .patch(`/api/v1/integrations/tickets/${id}`)
      .send({ expectedVersion: 1, status: 'CLOSED' })
      .expect(409);
    const updated = await owner
      .patch(`/api/v1/integrations/tickets/${id}`)
      .send({ expectedVersion: 1, status: 'IN_PROGRESS' })
      .expect(200);
    expect(updated.body.data.version).toBe(2);
    await owner
      .patch(`/api/v1/integrations/tickets/${id}`)
      .send({ expectedVersion: 1, priority: 'URGENT' })
      .expect(409);
    const resolved = await owner
      .patch(`/api/v1/integrations/tickets/${id}`)
      .send({ expectedVersion: 2, status: 'RESOLVED' })
      .expect(200);
    const closed = await owner
      .patch(`/api/v1/integrations/tickets/${id}`)
      .send({ expectedVersion: resolved.body.data.version, status: 'CLOSED' })
      .expect(200);
    expect(closed.body.data.events).toHaveLength(4);
    expect((await owner.get('/api/v1/integrations/tickets').expect(200)).body.data).toEqual(
      expect.arrayContaining([expect.objectContaining({ id, status: 'CLOSED' })]),
    );
    await owner.post(`/api/v1/integrations/conversations/${conversationId}/mark-read`).expect(201);
    expect(
      (await prisma.conversation.findUniqueOrThrow({ where: { id: conversationId } })).unreadAt,
    ).toBeNull();

    const commentTicket = await owner
      .post('/api/v1/integrations/tickets')
      .send({
        sourceType: 'COMMENT',
        sourceId: commentId,
        requestKey: `${requestPrefix}-comment`,
        kind: 'COMPLAINT',
        priority: 'NORMAL',
        summary: 'Comment case',
      })
      .expect(201);
    expect(commentTicket.body.data.sourceUrl).toBe('https://www.facebook.com/fixture/posts/1');
    expect(
      await prisma.socialTicket.count({
        where: { id: { in: [id, commentTicket.body.data.id as string] } },
      }),
    ).toBe(2);
  });
});
