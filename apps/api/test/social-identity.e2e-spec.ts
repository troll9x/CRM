import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApplication } from '../src/bootstrap';
import { PrismaService } from '../src/prisma/prisma.service';

const ownerEmail = process.env.SEED_OWNER_EMAIL ?? 'owner@crm.local';
const ownerPassword = process.env.SEED_OWNER_PASSWORD ?? 'Local-test-password-123!';
const businessId = 'business_local_default';
const labelPrefix = 'Social Identity E2E';

describe('SOCIAL-IDENTITY-01 customer identity, suggestions and merge', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let owner: ReturnType<typeof request.agent>;
  let ownerId = '';
  const connectionIds: string[] = [];

  async function createCustomer(name: string, phone?: string) {
    const response = await owner
      .post('/api/v1/customers')
      .send({
        displayName: name,
        groupCode: 'retail',
        ...(phone ? { contacts: [{ type: 'PHONE', value: phone }] } : {}),
      })
      .expect(201);
    return response.body.data.customer as {
      id: string;
      version: number;
      customerCode: string;
      displayName: string;
    };
  }

  async function createConnection(provider: 'FACEBOOK' | 'ZALO', externalAccountId: string) {
    const response = await owner
      .post('/api/v1/integrations/connections')
      .send({ provider, externalAccountId, displayName: `${labelPrefix} ${provider}` })
      .expect(201);
    const connection = response.body.data as { id: string; status: string };
    connectionIds.push(connection.id);
    expect(connection.status).toBe('NEEDS_SETUP');
    return connection.id;
  }

  async function cleanup() {
    for (const connectionId of connectionIds) {
      const conversations = await prisma.conversation.findMany({
        where: { connectionId },
        select: { id: true },
      });
      const ids = conversations.map((conversation) => conversation.id);
      if (ids.length) {
        await prisma.internalConversationNote.deleteMany({
          where: { conversationId: { in: ids } },
        });
        await prisma.conversationMessage.deleteMany({ where: { conversationId: { in: ids } } });
        await prisma.conversation.deleteMany({ where: { id: { in: ids } } });
      }
      await prisma.externalCustomerIdentity.deleteMany({ where: { connectionId } });
      await prisma.integrationJob.deleteMany({ where: { connectionId } });
    }
    const customers = await prisma.customer.findMany({
      where: { businessId, displayName: { startsWith: labelPrefix } },
      select: { id: true },
    });
    const customerIds = customers.map((customer) => customer.id);
    if (customerIds.length) {
      await prisma.customerMergeCommand.deleteMany({
        where: { businessId, sourceId: { in: customerIds } },
      });
      await prisma.customerDuplicateSuggestion.deleteMany({
        where: {
          businessId,
          OR: [{ customerAId: { in: customerIds } }, { customerBId: { in: customerIds } }],
        },
      });
      await prisma.customer.updateMany({
        where: { id: { in: customerIds } },
        data: { mergedIntoId: null },
      });
      await prisma.customerNote.deleteMany({ where: { customerId: { in: customerIds } } });
      await prisma.quote.deleteMany({ where: { customerId: { in: customerIds } } });
      await prisma.salesOrder.deleteMany({ where: { customerId: { in: customerIds } } });
      await prisma.contactPoint.deleteMany({ where: { customerId: { in: customerIds } } });
      await prisma.address.deleteMany({ where: { customerId: { in: customerIds } } });
      await prisma.customer.deleteMany({ where: { id: { in: customerIds } } });
    }
    for (const connectionId of connectionIds) {
      await prisma.integrationConnection.deleteMany({ where: { id: connectionId } });
    }
    connectionIds.length = 0;
  }

  beforeAll(async () => {
    app = await createApplication();
    await app.init();
    prisma = app.get(PrismaService);
    await cleanup();
    owner = request.agent(app.getHttpServer());
    await owner
      .post('/api/v1/auth/sessions')
      .send({ email: ownerEmail, password: ownerPassword })
      .expect(201);
    const staff = await prisma.staffUser.findUnique({
      where: { emailNormalized: ownerEmail.toLowerCase() },
      select: { id: true },
    });
    ownerId = staff!.id;
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  it('reuses the same account connection without claiming OAuth or a live connection', async () => {
    const externalAccountId = `${labelPrefix}-PAGE-01`;
    const first = await owner
      .post('/api/v1/integrations/connections')
      .send({ provider: 'FACEBOOK', externalAccountId, displayName: 'Page A' })
      .expect(201);
    const second = await owner
      .post('/api/v1/integrations/connections')
      .send({ provider: 'FACEBOOK', externalAccountId, displayName: 'Page A renamed' })
      .expect(201);
    expect(second.body.data.id).toBe(first.body.data.id);
    expect(second.body.data.status).toBe('NEEDS_SETUP');
    expect(second.body.data.externalAccountId).toBeUndefined();
    connectionIds.push(first.body.data.id);
    const rows = await prisma.integrationConnection.count({
      where: { businessId, provider: 'FACEBOOK', externalAccountId },
    });
    expect(rows).toBe(1);
  });

  it('links multiple Facebook/Zalo identities with preview/version/audit, rejects silent overwrite, and unlinks without deleting threads', async () => {
    const customer = await createCustomer(`${labelPrefix} multi-account`);
    const other = await createCustomer(`${labelPrefix} other`);
    const facebookConnectionId = await createConnection('FACEBOOK', `${labelPrefix}-FB`);
    const zaloConnectionId = await createConnection('ZALO', `${labelPrefix}-ZALO`);
    const [facebookIdentity, zaloIdentity] = await Promise.all([
      prisma.externalCustomerIdentity.create({
        data: {
          businessId,
          connectionId: facebookConnectionId,
          externalUserId: 'fb-person-0001',
          displayName: 'Social test person',
        },
      }),
      prisma.externalCustomerIdentity.create({
        data: {
          businessId,
          connectionId: zaloConnectionId,
          externalUserId: 'zalo-person-0001',
          displayName: 'Social test person',
        },
      }),
    ]);
    const conversation = await prisma.conversation.create({
      data: {
        businessId,
        connectionId: facebookConnectionId,
        identityId: facebookIdentity.id,
        externalId: 'thread-social-01',
      },
    });
    await prisma.conversationMessage.create({
      data: {
        connectionId: facebookConnectionId,
        conversationId: conversation.id,
        externalMessageId: 'message-social-01',
        body: 'Synthetic test content',
        providerAt: new Date(),
      },
    });

    for (const identity of [facebookIdentity, zaloIdentity]) {
      await owner
        .post(`/api/v1/integrations/identities/${identity.id}/link-preview`)
        .send({ customerId: customer.id })
        .expect(201);
      await owner
        .post(`/api/v1/integrations/identities/${identity.id}/link-customer`)
        .send({ customerId: customer.id, expectedVersion: 1, expectedCustomerId: null })
        .expect(201);
    }
    const profile = await owner.get(`/api/v1/customers/${customer.id}`).expect(200);
    expect(profile.body.data.linkedIdentities).toHaveLength(2);
    expect(profile.body.data.linkedConversations).toHaveLength(1);
    expect(profile.body.data.linkedIdentities[0].externalUserIdMasked).not.toContain('person-0001');

    await owner
      .post(`/api/v1/integrations/identities/${facebookIdentity.id}/link-customer`)
      .send({ customerId: other.id, expectedVersion: 2, expectedCustomerId: customer.id })
      .expect(409);
    await owner
      .post(`/api/v1/integrations/identities/${facebookIdentity.id}/transfer-customer`)
      .send({ customerId: other.id, expectedVersion: 2, expectedCustomerId: customer.id })
      .expect(201);
    await owner
      .post(`/api/v1/integrations/identities/${facebookIdentity.id}/unlink-customer`)
      .send({ expectedVersion: 3, expectedCustomerId: other.id })
      .expect(201);
    expect(await prisma.conversation.count({ where: { id: conversation.id } })).toBe(1);
    expect(
      await prisma.conversationMessage.count({ where: { conversationId: conversation.id } }),
    ).toBe(1);
    expect(
      await prisma.auditLog.count({
        where: { entityType: 'ExternalCustomerIdentity', entityId: facebookIdentity.id },
      }),
    ).toBeGreaterThanOrEqual(3);
  });

  it('persists exact indexed phone matches, does not propose name-only matches, and rejects masked phone values', async () => {
    await createCustomer(`${labelPrefix} shared phone A`, '0901 234 567');
    await createCustomer(`${labelPrefix} shared phone B`, '+84 (901) 234-567');
    await createCustomer(`${labelPrefix} same name no evidence`);
    const sameName = await createCustomer(`${labelPrefix} same name no evidence`);
    await owner
      .post(`/api/v1/customers/${sameName.id}/duplicate-suggestions/scan`)
      .send({ version: sameName.version })
      .expect(201);
    const suggestions = await owner.get('/api/v1/customers/duplicate-suggestions').expect(200);
    const suggestionData = suggestions.body.data as {
      id: string;
      evidence: { fields: string[] };
      customerA: { id: string; version: number; displayName: string };
      customerB: { version: number; displayName: string };
    }[];
    const phoneSuggestions = suggestionData.filter(
      (item) =>
        item.evidence.fields.includes('PHONE') &&
        item.customerA.displayName.includes('shared phone') &&
        item.customerB.displayName.includes('shared phone'),
    );
    expect(phoneSuggestions).toHaveLength(1);
    expect(
      suggestionData.some(
        (item) =>
          item.customerA.displayName === sameName.displayName &&
          item.customerB.displayName === sameName.displayName,
      ),
    ).toBe(false);
    await owner
      .post('/api/v1/customers')
      .send({
        displayName: `${labelPrefix} masked`,
        groupCode: 'retail',
        contacts: [{ type: 'PHONE', value: '0901***567' }],
      })
      .expect(400);

    const suggestion = phoneSuggestions[0] as {
      id: string;
      customerA: { id: string; version: number };
      customerB: { version: number };
    };
    await owner
      .post(`/api/v1/customers/duplicate-suggestions/${suggestion.id}/decision`)
      .send({
        decision: 'REJECT',
        versionA: suggestion.customerA.version,
        versionB: suggestion.customerB.version,
        reason: 'Đã xác nhận là hai người khác nhau.',
      })
      .expect(201);
    await owner
      .post(`/api/v1/customers/${suggestion.customerA.id}/duplicate-suggestions/scan`)
      .send({ version: suggestion.customerA.version })
      .expect(201);
    expect(
      (
        (await owner.get('/api/v1/customers/duplicate-suggestions').expect(200)).body.data as {
          id: string;
        }[]
      ).some((item) => item.id === suggestion.id),
    ).toBe(false);
    expect(
      await prisma.customerDuplicateSuggestion.count({
        where: { id: suggestion.id, status: 'REJECTED' },
      }),
    ).toBe(1);
  });

  it('merges historical CRM links transactionally, redirects the old ID, and replays idempotently without money/stock events', async () => {
    const source = await createCustomer(`${labelPrefix} merge source`);
    const target = await createCustomer(`${labelPrefix} merge target`);
    const connectionId = await createConnection('FACEBOOK', `${labelPrefix}-MERGE`);
    const identity = await prisma.externalCustomerIdentity.create({
      data: {
        businessId,
        connectionId,
        externalUserId: 'merge-person-01',
        displayName: 'Merge test person',
        customerId: source.id,
        linkedAt: new Date(),
        linkedById: ownerId,
      },
    });
    const quote = await prisma.quote.create({
      data: {
        businessId,
        customerId: source.id,
        createdById: ownerId,
        quoteNumber: `Q-${Date.now()}`,
        lineSubtotalVnd: '125000',
        lineDiscountVnd: '0',
        orderDiscountVnd: '0',
        grandTotalVnd: '125000',
      },
    });
    const order = await prisma.salesOrder.create({
      data: {
        businessId,
        customerId: source.id,
        createdById: ownerId,
        orderNumber: `SO-${Date.now()}`,
        lineSubtotalVnd: '125000',
        lineDiscountVnd: '0',
        orderDiscountVnd: '0',
        shippingFeeVnd: '0',
        taxVnd: '0',
        depositVnd: '0',
        grandTotalVnd: '125000',
      },
    });
    await prisma.customerNote.create({
      data: {
        businessId,
        customerId: source.id,
        createdById: ownerId,
        content: 'Merge history fixture',
      },
    });
    const before = {
      stock: await prisma.stockMovement.count({ where: { businessId } }),
      receipts: await prisma.paymentReceipt.count({ where: { businessId } }),
      alerts: await prisma.adminAlert.count({ where: { businessId } }),
    };
    const preview = await owner
      .post(`/api/v1/customers/${source.id}/merge-preview`)
      .send({ targetCustomerId: target.id })
      .expect(201);
    expect(preview.body.data.canMerge).toBe(true);
    expect(preview.body.data.relationCounts.quotes).toBe(1);
    expect(preview.body.data.relationCounts.orders).toBe(1);
    const body = {
      targetCustomerId: target.id,
      sourceVersion: source.version,
      targetVersion: target.version,
    };
    const merged = await owner
      .post(`/api/v1/customers/${source.id}/merge`)
      .set('Idempotency-Key', 'social-identity-merge-0001')
      .send(body)
      .expect(201);
    const replay = await owner
      .post(`/api/v1/customers/${source.id}/merge`)
      .set('Idempotency-Key', 'social-identity-merge-0001')
      .send(body)
      .expect(201);
    expect(replay.body.data).toEqual(merged.body.data);
    await owner
      .post(`/api/v1/customers/${source.id}/merge`)
      .set('Idempotency-Key', 'social-identity-merge-0001')
      .send({ ...body, targetCustomerId: source.id })
      .expect(409);
    expect(
      (
        await prisma.customer.findUniqueOrThrow({
          where: { id: source.id },
          select: { status: true, mergedIntoId: true },
        })
      ).mergedIntoId,
    ).toBe(target.id);
    expect((await owner.get(`/api/v1/customers/${source.id}`).expect(200)).body.data.id).toBe(
      target.id,
    );
    expect(
      await prisma.externalCustomerIdentity.findUniqueOrThrow({
        where: { id: identity.id },
        select: { customerId: true },
      }),
    ).toEqual({ customerId: target.id });
    const mergedQuote = await prisma.quote.findUniqueOrThrow({
      where: { id: quote.id },
      select: { customerId: true, grandTotalVnd: true },
    });
    const mergedOrder = await prisma.salesOrder.findUniqueOrThrow({
      where: { id: order.id },
      select: { customerId: true, grandTotalVnd: true },
    });
    expect(mergedQuote.customerId).toBe(target.id);
    expect(mergedQuote.grandTotalVnd.toString()).toBe('125000');
    expect(mergedOrder.customerId).toBe(target.id);
    expect(mergedOrder.grandTotalVnd.toString()).toBe('125000');
    expect(await prisma.stockMovement.count({ where: { businessId } })).toBe(before.stock);
    expect(await prisma.paymentReceipt.count({ where: { businessId } })).toBe(before.receipts);
    expect(await prisma.adminAlert.count({ where: { businessId } })).toBe(before.alerts);
  });

  it('denies merge preview to a customer reader without the separate merge permission', async () => {
    const source = await createCustomer(`${labelPrefix} permission source`);
    const target = await createCustomer(`${labelPrefix} permission target`);
    const roleCode = `social-customer-reader-${Date.now()}`;
    const role = await prisma.role.create({
      data: {
        businessId,
        code: roleCode,
        name: 'Social customer reader E2E',
        permissions: { create: { permissionKey: 'customers.read' } },
      },
    });
    const email = `social-customer-reader-${Date.now()}@crm.local`;
    const password = 'Social-test-password-123!';
    await owner
      .post('/api/v1/staff')
      .send({ email, displayName: 'Social customer reader E2E', password, roleCodes: [roleCode] })
      .expect(201);
    const reader = request.agent(app.getHttpServer());
    await reader.post('/api/v1/auth/sessions').send({ email, password }).expect(201);
    await reader.get(`/api/v1/customers/${source.id}`).expect(200);
    await reader
      .post(`/api/v1/customers/${source.id}/merge-preview`)
      .send({ targetCustomerId: target.id })
      .expect(403);
    await reader
      .post(`/api/v1/customers/${source.id}/merge`)
      .set('Idempotency-Key', `social-identity-forbidden-${Date.now()}`)
      .send({
        targetCustomerId: target.id,
        sourceVersion: source.version,
        targetVersion: target.version,
      })
      .expect(403);
    await prisma.session.deleteMany({
      where: { staffUser: { emailNormalized: email.toLowerCase() } },
    });
    await prisma.staffUser.deleteMany({ where: { emailNormalized: email.toLowerCase() } });
    await prisma.role.delete({ where: { id: role.id } });
  });
});
