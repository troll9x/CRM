import type { INestApplication } from '@nestjs/common';
import { createHash, createHmac } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApplication } from '../src/bootstrap';
import { IntegrationWorkerService } from '../src/integrations/integration-worker.service';
import { IntegrationsService } from '../src/integrations/integrations.service';
import { PrismaService } from '../src/prisma/prisma.service';

const ownerEmail = process.env.SEED_OWNER_EMAIL ?? 'owner@crm.local';
const ownerPassword = process.env.SEED_OWNER_PASSWORD ?? 'Local-test-password-123!';
const externalAccountId = 'E2E-INTEGRATION-SHOP-01';

describe('multi-channel import foundation', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let connectionId = '';
  let zaloConnectionId = '';
  const previousWebhookSecret = process.env.FACEBOOK_APP_SECRET;
  const previousVerifyToken = process.env.FACEBOOK_WEBHOOK_VERIFY_TOKEN;
  const previousZaloSecret = process.env.ZALO_OA_SECRET_KEY;

  beforeAll(async () => {
    process.env.FACEBOOK_APP_SECRET = 'fixture-only-webhook-secret';
    process.env.FACEBOOK_WEBHOOK_VERIFY_TOKEN = 'fixture-only-verify-token';
    process.env.ZALO_OA_SECRET_KEY = 'fixture-only-zalo-secret';
    app = await createApplication();
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    if (connectionId) {
      const orders = await prisma.externalOrder.findMany({
        where: { connectionId },
        select: { id: true },
      });
      const orderIds = orders.map((order) => order.id);
      if (orderIds.length) {
        await prisma.adminAlert.deleteMany({ where: { externalOrderId: { in: orderIds } } });
        await prisma.externalOrderLine.deleteMany({ where: { externalOrderId: { in: orderIds } } });
        await prisma.externalOrder.deleteMany({ where: { id: { in: orderIds } } });
      }
      const conversations = await prisma.conversation.findMany({
        where: { connectionId },
        select: { id: true },
      });
      const conversationIds = conversations.map((conversation) => conversation.id);
      if (conversationIds.length) {
        await prisma.internalConversationNote.deleteMany({
          where: { conversationId: { in: conversationIds } },
        });
        await prisma.conversationMessage.deleteMany({
          where: { conversationId: { in: conversationIds } },
        });
        await prisma.conversation.deleteMany({ where: { id: { in: conversationIds } } });
      }
      await prisma.externalCustomerIdentity.deleteMany({ where: { connectionId } });
      await prisma.socialComment.deleteMany({ where: { connectionId } });
      await prisma.integrationJob.deleteMany({ where: { connectionId } });
      await prisma.externalProductMapping.deleteMany({ where: { connectionId } });
      await prisma.integrationConnection.deleteMany({ where: { id: connectionId } });
    }
    if (zaloConnectionId) {
      await prisma.conversationMessage.deleteMany({
        where: { conversation: { connectionId: zaloConnectionId } },
      });
      await prisma.conversation.deleteMany({ where: { connectionId: zaloConnectionId } });
      await prisma.externalCustomerIdentity.deleteMany({
        where: { connectionId: zaloConnectionId },
      });
      await prisma.integrationJob.deleteMany({ where: { connectionId: zaloConnectionId } });
      await prisma.integrationConnection.delete({ where: { id: zaloConnectionId } });
    }
    await app.close();
    if (previousWebhookSecret === undefined) delete process.env.FACEBOOK_APP_SECRET;
    else process.env.FACEBOOK_APP_SECRET = previousWebhookSecret;
    if (previousVerifyToken === undefined) delete process.env.FACEBOOK_WEBHOOK_VERIFY_TOKEN;
    else process.env.FACEBOOK_WEBHOOK_VERIFY_TOKEN = previousVerifyToken;
    if (previousZaloSecret === undefined) delete process.env.ZALO_OA_SECRET_KEY;
    else process.env.ZALO_OA_SECRET_KEY = previousZaloSecret;
  });

  it('deduplicates message/order deliveries and imports marketplace orders without financial or stock effects', async () => {
    const owner = request.agent(app.getHttpServer());
    await owner
      .post('/api/v1/auth/sessions')
      .send({ email: ownerEmail, password: ownerPassword })
      .expect(201);
    const integrations = app.get(IntegrationsService);
    const connection = await integrations.createConnection('business_local_default', {
      provider: 'SHOPEE',
      externalAccountId,
      displayName: 'E2E Shopee fixture (not connected)',
    });
    connectionId = connection.id;
    expect(connection.status).toBe('NEEDS_SETUP');

    const facebookConnection = await owner
      .post('/api/v1/integrations/connections')
      .send({
        provider: 'FACEBOOK',
        externalAccountId: 'E2E-INTEGRATION-FACEBOOK-01',
        displayName: 'Fixture Page (not connected)',
      })
      .expect(201);
    const facebookConnectionId = facebookConnection.body.data.id as string;
    const challenge = await request(app.getHttpServer())
      .get('/api/v1/webhooks/facebook')
      .query({
        'hub.mode': 'subscribe',
        'hub.verify_token': 'fixture-only-verify-token',
        'hub.challenge': 'challenge-fixture',
      })
      .expect(200);
    expect(challenge.text).toBe('challenge-fixture');
    const webhookPayload = {
      object: 'page',
      entry: [
        {
          id: 'E2E-INTEGRATION-FACEBOOK-01',
          messaging: [
            {
              sender: { id: 'fixture-user-fb' },
              recipient: { id: 'E2E-INTEGRATION-FACEBOOK-01' },
              timestamp: Date.now(),
              message: { mid: 'fixture-fb-message-01', text: 'Fixture only' },
            },
          ],
        },
      ],
    };
    const rawPayload = JSON.stringify(webhookPayload);
    const signature = `sha256=${createHmac('sha256', 'fixture-only-webhook-secret').update(rawPayload).digest('hex')}`;
    await request(app.getHttpServer())
      .post('/api/v1/webhooks/facebook')
      .set('x-hub-signature-256', signature)
      .send(rawPayload)
      .set('content-type', 'application/json')
      .expect(503);
    expect(
      await prisma.integrationJob.count({ where: { connectionId: facebookConnectionId } }),
    ).toBe(0);
    await prisma.integrationConnection.update({
      where: { id: facebookConnectionId },
      data: {
        status: 'CONNECTED',
        capabilities: { authorization: 'VERIFIED' },
      },
    });
    await request(app.getHttpServer())
      .post('/api/v1/webhooks/facebook')
      .set('x-hub-signature-256', signature)
      .send(rawPayload)
      .set('content-type', 'application/json')
      .expect(200);
    await request(app.getHttpServer())
      .post('/api/v1/webhooks/facebook')
      .set('x-hub-signature-256', 'sha256=invalid')
      .send(rawPayload)
      .set('content-type', 'application/json')
      .expect(401);
    expect(
      await prisma.integrationJob.count({
        where: {
          connectionId: facebookConnectionId,
          idempotencyKey: 'fb-message:fixture-fb-message-01',
        },
      }),
    ).toBe(1);
    await prisma.integrationJob.deleteMany({ where: { connectionId: facebookConnectionId } });
    await prisma.integrationConnection.delete({ where: { id: facebookConnectionId } });

    const zaloConnection = await owner
      .post('/api/v1/integrations/connections')
      .send({
        provider: 'ZALO',
        externalAccountId: 'E2E-INTEGRATION-ZALO-OA-01',
        displayName: 'Fixture OA (not connected)',
      })
      .expect(201);
    zaloConnectionId = zaloConnection.body.data.id as string;
    const zaloPayload = {
      app_id: 'fixture-app-id',
      sender: { id: 'fixture-zalo-user', display_name: 'Fixture Zalo user' },
      recipient: { id: 'E2E-INTEGRATION-ZALO-OA-01' },
      event_name: 'user_send_text',
      message: { msg_id: 'fixture-zalo-message-01', text: 'Fixture only' },
      timestamp: String(Date.now()),
    };
    const zaloRawPayload = JSON.stringify(zaloPayload);
    const zaloSignature = `mac=${createHash('sha256')
      .update(
        zaloPayload.app_id + zaloRawPayload + zaloPayload.timestamp + 'fixture-only-zalo-secret',
      )
      .digest('hex')}`;
    await request(app.getHttpServer())
      .post('/api/v1/webhooks/zalo')
      .set('x-zevent-signature', zaloSignature)
      .send(zaloRawPayload)
      .set('content-type', 'application/json')
      .expect(503);
    expect(await prisma.integrationJob.count({ where: { connectionId: zaloConnectionId } })).toBe(
      0,
    );
    await prisma.integrationConnection.update({
      where: { id: zaloConnectionId },
      data: {
        status: 'CONNECTED',
        capabilities: { authorization: 'VERIFIED' },
      },
    });
    await request(app.getHttpServer())
      .post('/api/v1/webhooks/zalo')
      .set('x-zevent-signature', zaloSignature)
      .send(zaloRawPayload)
      .set('content-type', 'application/json')
      .expect(200);
    await request(app.getHttpServer())
      .post('/api/v1/webhooks/zalo')
      .set('x-zevent-signature', 'mac=invalid')
      .send(zaloRawPayload)
      .set('content-type', 'application/json')
      .expect(401);
    expect(
      await prisma.integrationJob.count({
        where: {
          connectionId: zaloConnectionId,
          idempotencyKey: 'zalo-message:fixture-zalo-message-01',
        },
      }),
    ).toBe(1);
    await app.get(IntegrationWorkerService).runOnce();
    expect(
      await prisma.conversationMessage.count({
        where: { connectionId: zaloConnectionId, externalMessageId: 'fixture-zalo-message-01' },
      }),
    ).toBe(1);
    const before = {
      salesOrders: await prisma.salesOrder.count(),
      payments: await prisma.paymentReceipt.count(),
      movements: await prisma.stockMovement.count(),
    };
    const message = {
      type: 'message',
      conversationId: 'fixture-thread-1',
      externalUserId: 'fixture-user-1',
      messageId: 'fixture-message-1',
      body: 'Fixture for persistence tests only',
      contentType: 'text',
      timestamp: new Date().toISOString(),
    };
    const firstMessageJob = await integrations.enqueue({
      connectionId,
      kind: 'MESSAGE',
      idempotencyKey: 'fixture-message:1',
      providerObjectId: message.messageId,
      payload: message,
    });
    const duplicateMessageJob = await integrations.enqueue({
      connectionId,
      kind: 'MESSAGE',
      idempotencyKey: 'fixture-message:1',
      providerObjectId: message.messageId,
      payload: message,
    });
    expect(duplicateMessageJob.id).toBe(firstMessageJob.id);
    await app.get(IntegrationWorkerService).runOnce();
    expect(
      await prisma.conversationMessage.count({
        where: { connectionId, externalMessageId: message.messageId },
      }),
    ).toBe(1);

    const order = {
      type: 'order',
      orderId: 'fixture-market-order-1001',
      sourceStatus: 'UNPAID',
      normalizedStatus: 'UNPAID',
      currency: 'VND',
      totalAmount: '123000',
      recipient: { displayName: 'Fixture recipient' },
      lines: [
        {
          productId: 'source-sku-1',
          title: 'Fixture product',
          quantity: '2',
          unit: 'item',
          unitPrice: '61500',
          lineAmount: '123000',
        },
      ],
    };
    const firstOrderJob = await integrations.enqueue({
      connectionId,
      kind: 'ORDER',
      idempotencyKey: 'fixture-order:1001:create',
      providerObjectId: order.orderId,
      payload: order,
    });
    await integrations.enqueue({
      connectionId,
      kind: 'ORDER',
      idempotencyKey: 'fixture-order:1001:create',
      providerObjectId: order.orderId,
      payload: order,
    });
    await app.get(IntegrationWorkerService).runOnce();
    expect(
      await prisma.externalOrder.count({ where: { connectionId, externalOrderId: order.orderId } }),
    ).toBe(1);
    expect(
      await prisma.externalOrderLine.count({
        where: { externalOrder: { connectionId, externalOrderId: order.orderId } },
      }),
    ).toBe(1);
    expect(
      await prisma.adminAlert.count({
        where: { externalOrder: { connectionId, externalOrderId: order.orderId } },
      }),
    ).toBe(1);

    const updateJob = await integrations.enqueue({
      connectionId,
      kind: 'ORDER',
      idempotencyKey: 'fixture-order:1001:update-2',
      providerObjectId: order.orderId,
      payload: {
        ...order,
        sourceStatus: 'AWAITING_SHIPMENT',
        normalizedStatus: 'AWAITING_SHIPMENT',
      },
    });
    expect(updateJob.id).not.toBe(firstOrderJob.id);
    await app.get(IntegrationWorkerService).runOnce();
    expect(
      await prisma.integrationJob.count({
        where: { connectionId, kind: 'ORDER', status: 'SUCCEEDED' },
      }),
    ).toBe(2);
    expect(
      await prisma.externalOrder.count({ where: { connectionId, externalOrderId: order.orderId } }),
    ).toBe(1);
    expect(
      await prisma.adminAlert.count({
        where: { externalOrder: { connectionId, externalOrderId: order.orderId } },
      }),
    ).toBe(1);
    expect(await prisma.salesOrder.count()).toBe(before.salesOrders);
    expect(await prisma.paymentReceipt.count()).toBe(before.payments);
    expect(await prisma.stockMovement.count()).toBe(before.movements);

    await owner
      .patch(`/api/v1/integrations/connections/${connectionId}/status`)
      .send({ status: 'PAUSED' })
      .expect(200);
    const pausedJob = await integrations.enqueue({
      connectionId,
      kind: 'COMMENT',
      idempotencyKey: 'fixture-paused-comment:1',
      providerObjectId: 'fixture-paused-comment',
      payload: {
        type: 'comment',
        commentId: 'fixture-paused-comment',
        postId: 'fixture-post',
        timestamp: new Date().toISOString(),
      },
    });
    expect(pausedJob.status).toBe('BLOCKED');
    await owner.post(`/api/v1/integrations/jobs/${pausedJob.id}/retry`).expect(409);
    await owner
      .patch(`/api/v1/integrations/connections/${connectionId}/status`)
      .send({ status: 'CONFIGURED_UNVERIFIED' })
      .expect(200);
    await owner.post(`/api/v1/integrations/jobs/${pausedJob.id}/retry`).expect(201);
    await app.get(IntegrationWorkerService).runOnce();
    expect(
      await prisma.socialComment.count({
        where: { connectionId, externalCommentId: 'fixture-paused-comment' },
      }),
    ).toBe(1);
  });
});
