import { createHmac } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApplication } from '../src/bootstrap';
import { PrismaService } from '../src/prisma/prisma.service';
import { IntegrationWorkerService } from '../src/integrations/integration-worker.service';

const databaseName = new URL(process.env.DATABASE_URL ?? 'postgresql://x:x@localhost/none')
  .pathname;
if (!databaseName.includes('scratch'))
  throw new Error('Multi-Page E2E requires a scratch database.');

describe('Facebook Page routing with mock signed webhook', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const secret = 'fixture-two-page-webhook-secret';
  const previousSecret = process.env.FACEBOOK_APP_SECRET;
  const pageIds = [String(Date.now()) + '11', String(Date.now()) + '22'];
  const connectionIds: string[] = [];
  const businessId = 'business_local_default';
  const userId = 'same-external-user';

  beforeAll(async () => {
    process.env.FACEBOOK_APP_SECRET = secret;
    app = await createApplication();
    await app.init();
    prisma = app.get(PrismaService);
    for (const [index, pageId] of pageIds.entries()) {
      const connection = await prisma.integrationConnection.create({
        data: {
          businessId,
          provider: 'FACEBOOK',
          externalAccountId: pageId,
          displayName: `Fixture Page ${index + 1}`,
          status: 'CONNECTED',
          capabilities: { authorization: 'VERIFIED' },
        },
      });
      connectionIds.push(connection.id);
    }
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.conversationMessage.deleteMany({
        where: { connectionId: { in: connectionIds } },
      });
      await prisma.conversation.deleteMany({ where: { connectionId: { in: connectionIds } } });
      await prisma.externalCustomerIdentity.deleteMany({
        where: { connectionId: { in: connectionIds } },
      });
      await prisma.integrationJob.deleteMany({ where: { connectionId: { in: connectionIds } } });
      await prisma.integrationConnection.deleteMany({ where: { id: { in: connectionIds } } });
    }
    if (app) await app.close();
    if (previousSecret === undefined) delete process.env.FACEBOOK_APP_SECRET;
    else process.env.FACEBOOK_APP_SECRET = previousSecret;
  });

  async function deliver(entries: unknown[], expectedStatus = 200) {
    const raw = JSON.stringify({ object: 'page', entry: entries });
    const signature = `sha256=${createHmac('sha256', secret).update(raw).digest('hex')}`;
    return request(app.getHttpServer())
      .post('/api/v1/webhooks/facebook')
      .set('x-hub-signature-256', signature)
      .set('content-type', 'application/json')
      .send(raw)
      .expect(expectedStatus);
  }

  it('routes same user ID to two separate Pages and deduplicates replay and echo', async () => {
    const entries = pageIds.map((pageId, index) => ({
      id: pageId,
      messaging: [
        {
          sender: { id: userId },
          recipient: { id: pageId },
          timestamp: Date.now(),
          message: { mid: `fixture-inbound-${index}`, text: `Page ${index + 1}` },
        },
      ],
    }));
    await deliver(entries);
    await deliver(entries);
    expect(
      await prisma.integrationJob.count({ where: { connectionId: { in: connectionIds } } }),
    ).toBe(2);
    await app.get(IntegrationWorkerService).runOnce();
    await app.get(IntegrationWorkerService).runOnce();
    const identities = await prisma.externalCustomerIdentity.findMany({
      where: { connectionId: { in: connectionIds }, externalUserId: userId },
    });
    expect(identities).toHaveLength(2);
    expect(identities[0]?.id).not.toBe(identities[1]?.id);
    const conversations = await prisma.conversation.findMany({
      where: { connectionId: { in: connectionIds } },
    });
    expect(conversations).toHaveLength(2);
    for (const connectionId of connectionIds) {
      expect(
        await prisma.conversationMessage.count({ where: { connectionId, direction: 'INBOUND' } }),
      ).toBe(1);
    }
    const firstChat = conversations.find((row) => row.connectionId === connectionIds[0])!;
    await prisma.conversationMessage.create({
      data: {
        connectionId: connectionIds[0]!,
        conversationId: firstChat.id,
        externalMessageId: 'fixture-outbound-echo',
        direction: 'OUTBOUND_ECHO',
        contentType: 'text',
        body: 'Fixture CRM reply',
        providerAt: new Date(),
      },
    });
    const echo = [
      {
        id: pageIds[0],
        messaging: [
          {
            sender: { id: pageIds[0] },
            recipient: { id: userId },
            timestamp: Date.now(),
            message: { mid: 'fixture-outbound-echo', text: 'Fixture CRM reply', is_echo: true },
          },
        ],
      },
    ];
    await deliver(echo);
    await deliver(echo);
    await app.get(IntegrationWorkerService).runOnce();
    expect(
      await prisma.conversationMessage.count({
        where: { connectionId: connectionIds[0], externalMessageId: 'fixture-outbound-echo' },
      }),
    ).toBe(1);
    expect(
      await prisma.conversationMessage.count({ where: { connectionId: connectionIds[1] } }),
    ).toBe(1);
  });

  it('rejects an unknown Page without creating a job', async () => {
    await deliver(
      [
        {
          id: '999000888777666',
          messaging: [
            {
              sender: { id: userId },
              recipient: { id: '999000888777666' },
              timestamp: Date.now(),
              message: { mid: 'fixture-unknown-page', text: 'Unknown' },
            },
          ],
        },
      ],
      503,
    );
    expect(
      await prisma.integrationJob.count({ where: { providerObjectId: 'fixture-unknown-page' } }),
    ).toBe(0);
  });
});
