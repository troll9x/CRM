import type { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApplication } from '../src/bootstrap';
import { PrismaService } from '../src/prisma/prisma.service';

const ownerEmail = process.env.SEED_OWNER_EMAIL ?? 'owner@crm.local';
const ownerPassword = process.env.SEED_OWNER_PASSWORD ?? 'Local-test-password-123!';

describe('quotes API', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let owner: ReturnType<typeof request.agent>;
  let sales: ReturnType<typeof request.agent>;
  let warehouse: ReturnType<typeof request.agent>;
  const suffix = randomUUID().slice(0, 8).toUpperCase();
  const sku = `E2E-QUOTE-${suffix}`;
  const name = `E2E Quote ${suffix}`;
  let customerId = '';
  let variantId = '';
  let salesEmail = '';
  let warehouseEmail = '';
  let quoteId = '';
  let warehouseId = '';

  async function cleanup() {
    const quotes = await prisma.quote.findMany({ where: { customerId }, select: { id: true } });
    const quoteIds = quotes.map((quote) => quote.id);
    const orders = await prisma.salesOrder.findMany({
      where: { customerId },
      select: { id: true },
    });
    const orderIds = orders.map((order) => order.id);
    if (orderIds.length) {
      await prisma.stockReservationEvent.deleteMany({ where: { orderId: { in: orderIds } } });
      await prisma.adminAlert.deleteMany({ where: { orderId: { in: orderIds } } });
      const receivables = await prisma.receivable.findMany({
        where: { orderId: { in: orderIds } },
        select: { id: true },
      });
      const receivableIds = receivables.map(({ id }) => id);
      if (receivableIds.length) {
        await prisma.receivableSettlement.deleteMany({
          where: { receivableId: { in: receivableIds } },
        });
        await prisma.receivable.deleteMany({ where: { id: { in: receivableIds } } });
      }
      await prisma.paymentAllocation.deleteMany({ where: { orderId: { in: orderIds } } });
      await prisma.salesOrderLine.deleteMany({ where: { orderId: { in: orderIds } } });
      await prisma.salesOrder.deleteMany({ where: { id: { in: orderIds } } });
    }
    if (customerId) {
      const receipts = await prisma.paymentReceipt.findMany({
        where: { customerId },
        select: { id: true },
      });
      const receiptIds = receipts.map(({ id }) => id);
      if (receiptIds.length) {
        await prisma.customerCreditEvent.deleteMany({ where: { paymentId: { in: receiptIds } } });
        await prisma.paymentReceipt.deleteMany({ where: { id: { in: receiptIds } } });
      }
      await prisma.customerCreditBalance.deleteMany({ where: { customerId } });
    }
    if (variantId) await prisma.stockBalance.deleteMany({ where: { variantId } });
    await prisma.orderCommand.deleteMany({ where: { idempotencyKey: { contains: suffix } } });
    if (quoteIds.length) {
      await prisma.quoteCommand.deleteMany({ where: { idempotencyKey: { contains: suffix } } });
      await prisma.quoteRevision.deleteMany({ where: { quoteId: { in: quoteIds } } });
      await prisma.quoteLine.deleteMany({ where: { quoteId: { in: quoteIds } } });
      await prisma.quote.deleteMany({ where: { id: { in: quoteIds } } });
    }
    await prisma.priceTierCommand.deleteMany({ where: { idempotencyKey: { contains: suffix } } });
    await prisma.priceTier.deleteMany({ where: { variantId } });
    const products = await prisma.product.findMany({ where: { name }, select: { id: true } });
    const productIds = products.map(({ id }) => id);
    if (productIds.length) {
      await prisma.unitConversion.deleteMany({
        where: { variant: { productId: { in: productIds } } },
      });
      await prisma.productVariant.deleteMany({ where: { productId: { in: productIds } } });
      await prisma.product.deleteMany({ where: { id: { in: productIds } } });
    }
    if (customerId) {
      await prisma.customerTask.deleteMany({ where: { customerId } });
      await prisma.salesOpportunity.deleteMany({ where: { customerId } });
      await prisma.address.deleteMany({ where: { customerId } });
      await prisma.contactPoint.deleteMany({ where: { customerId } });
      await prisma.customer.deleteMany({ where: { id: customerId } });
    }
    if (salesEmail)
      await prisma.staffUser.deleteMany({ where: { emailNormalized: salesEmail.toLowerCase() } });
    if (warehouseEmail)
      await prisma.staffUser.deleteMany({
        where: { emailNormalized: warehouseEmail.toLowerCase() },
      });
  }

  beforeAll(async () => {
    app = await createApplication();
    await app.init();
    prisma = app.get(PrismaService);
    owner = request.agent(app.getHttpServer());
    await owner
      .post('/api/v1/auth/sessions')
      .send({ email: ownerEmail, password: ownerPassword })
      .expect(201);
    const customer = await owner
      .post('/api/v1/customers')
      .send({ displayName: name, groupCode: 'retail', source: 'E2E' })
      .expect(201);
    customerId = customer.body.data.customer.id as string;
    const product = await owner
      .post('/api/v1/products')
      .send({
        name,
        variants: [{ sku, name: 'Sản phẩm báo giá', baseUnitCode: 'cai', baseUnitName: 'Cái' }],
      })
      .expect(201);
    variantId = product.body.data.variants[0].id as string;
    const warehouseRecord = await prisma.warehouse.findFirstOrThrow({
      where: { businessId: 'business_local_default', status: 'ACTIVE' },
      select: { id: true },
    });
    warehouseId = warehouseRecord.id;
    await prisma.stockBalance.create({
      data: {
        businessId: 'business_local_default',
        warehouseId: warehouseRecord.id,
        variantId,
        onHandQuantity: '10',
        averageCostVnd: '1000',
      },
    });
    await owner
      .put('/api/v1/price-tiers')
      .set('Idempotency-Key', `quote-e2e-${suffix}-price`)
      .send({
        variantId,
        quantityFrom: 1,
        expectedVersion: 0,
        priceVnd: '10000',
      })
      .expect(200);
    await owner
      .put('/api/v1/price-tiers')
      .set('Idempotency-Key', `quote-e2e-${suffix}-price5`)
      .send({
        variantId,
        quantityFrom: 5,
        expectedVersion: 0,
        priceVnd: '10000',
      })
      .expect(200);
    salesEmail = `quote-sales-${suffix}@crm.local`;
    await owner
      .post('/api/v1/staff')
      .send({
        email: salesEmail,
        displayName: 'Nhân viên báo giá',
        password: 'Sales-test-password-123!',
        roleCodes: ['sales'],
      })
      .expect(201);
    sales = request.agent(app.getHttpServer());
    await sales
      .post('/api/v1/auth/sessions')
      .send({ email: salesEmail, password: 'Sales-test-password-123!' })
      .expect(201);
    warehouseEmail = `quote-warehouse-${suffix}@crm.local`;
    await owner
      .post('/api/v1/staff')
      .send({
        email: warehouseEmail,
        displayName: 'Nhân viên kho',
        password: 'Warehouse-test-password-123!',
        roleCodes: ['warehouse'],
      })
      .expect(201);
    warehouse = request.agent(app.getHttpServer());
    await warehouse
      .post('/api/v1/auth/sessions')
      .send({ email: warehouseEmail, password: 'Warehouse-test-password-123!' })
      .expect(201);
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  it('keeps a scoped social source through quote creation and rejects mismatched sources', async () => {
    const connection = await prisma.integrationConnection.create({
      data: {
        businessId: 'business_local_default',
        provider: 'FACEBOOK',
        externalAccountId: `quote-fixture-${suffix}`,
        displayName: 'Quote source fixture',
      },
    });
    const identity = await prisma.externalCustomerIdentity.create({
      data: {
        businessId: 'business_local_default',
        connectionId: connection.id,
        externalUserId: `quote-customer-${suffix}`,
        customerId,
      },
    });
    const conversation = await prisma.conversation.create({
      data: {
        businessId: 'business_local_default',
        connectionId: connection.id,
        identityId: identity.id,
        externalId: `quote-chat-${suffix}`,
      },
    });
    const message = await prisma.conversationMessage.create({
      data: {
        connectionId: connection.id,
        conversationId: conversation.id,
        externalMessageId: `quote-message-${suffix}`,
        providerAt: new Date(),
        body: 'Fixture question',
      },
    });
    const ticket = await prisma.socialTicket.create({
      data: {
        businessId: 'business_local_default',
        conversationId: conversation.id,
        requestKey: `quote-ticket-${suffix}`,
        kind: 'OTHER',
        summary: 'Fixture ticket',
        createdById: (
          await prisma.staffUser.findFirstOrThrow({
            where: { emailNormalized: ownerEmail.toLowerCase() },
            select: { id: true },
          })
        ).id,
      },
    });
    let sourceOrderId = '';
    try {
      const input = {
        customerId,
        lines: [{ variantId, quantity: '1' }],
        sourceConversationId: conversation.id,
        sourceMessageId: message.id,
        sourceTicketId: ticket.id,
      };
      const key = `quote-e2e-${suffix}-social`;
      await sales
        .post('/api/v1/quotes')
        .set('Idempotency-Key', `quote-e2e-${suffix}-social-page-denied`)
        .send(input)
        .expect(403);
      const created = await owner.post('/api/v1/quotes').set('Idempotency-Key', key).send(input);
      expect(created.status, JSON.stringify(created.body)).toBe(201);
      expect(created.body.data).toMatchObject({
        sourceConversationId: conversation.id,
        sourceMessageId: message.id,
        sourceTicketId: ticket.id,
        sourceAccount: { provider: 'FACEBOOK', displayName: 'Quote source fixture' },
      });
      const quoteId = created.body.data.id as string;
      const repeated = await owner.post('/api/v1/quotes').set('Idempotency-Key', key).send(input);
      expect(repeated.body.data.id).toBe(quoteId);
      await warehouse
        .post('/api/v1/quotes')
        .set('Idempotency-Key', `quote-e2e-${suffix}-social-denied`)
        .send(input)
        .expect(403);
      await owner
        .post('/api/v1/quotes')
        .set('Idempotency-Key', `quote-e2e-${suffix}-social-mismatch`)
        .send({ ...input, sourceMessageId: randomUUID() })
        .expect(422);
      await owner
        .patch(`/api/v1/quotes/${quoteId}`)
        .set('Idempotency-Key', `quote-e2e-${suffix}-social-update`)
        .send({ sourceConversationId: randomUUID(), expectedVersion: 1 })
        .expect(400);
      await owner
        .patch(`/api/v1/quotes/${quoteId}`)
        .set('Idempotency-Key', `quote-e2e-${suffix}-social-customer`)
        .send({ customerId: randomUUID(), expectedVersion: 1 })
        .expect(422);
      const sent = await owner
        .post(`/api/v1/quotes/${quoteId}/send`)
        .set('Idempotency-Key', `quote-e2e-${suffix}-social-send`)
        .send({ expectedVersion: 1, receivedAt: new Date().toISOString() })
        .expect(201);
      expect(sent.body.data.status).toBe('SENT');
      const current = await owner.get(`/api/v1/quotes/${quoteId}`).expect(200);
      const converted = await owner
        .post(`/api/v1/quotes/${quoteId}/convert`)
        .set('Idempotency-Key', `quote-e2e-${suffix}-social-convert`)
        .send({ expectedVersion: current.body.data.version });
      expect(converted.status, JSON.stringify(converted.body)).toBe(201);
      sourceOrderId = converted.body.data.order.id as string;
      const order = await owner.get(`/api/v1/orders/${sourceOrderId}`).expect(200);
      expect(order.body.data.sourceQuote).toMatchObject({
        id: quoteId,
        sourceConversationId: conversation.id,
        sourceMessageId: message.id,
        sourceTicketId: ticket.id,
      });
    } finally {
      if (sourceOrderId) {
        await owner
          .post(`/api/v1/orders/${sourceOrderId}/cancel`)
          .set('Idempotency-Key', `quote-e2e-${suffix}-social-cancel`)
          .send({ expectedVersion: 1 })
          .expect(201);
        await prisma.stockReservationEvent.deleteMany({ where: { orderId: sourceOrderId } });
        await prisma.adminAlert.deleteMany({ where: { orderId: sourceOrderId } });
        await prisma.salesOrderLine.deleteMany({ where: { orderId: sourceOrderId } });
        await prisma.salesOrder.delete({ where: { id: sourceOrderId } });
      }
      await prisma.quoteCommand.deleteMany({ where: { idempotencyKey: { contains: suffix } } });
      await prisma.quoteRevision.deleteMany({
        where: { quote: { sourceConversationId: conversation.id } },
      });
      await prisma.quoteLine.deleteMany({
        where: { quote: { sourceConversationId: conversation.id } },
      });
      await prisma.quote.deleteMany({ where: { sourceConversationId: conversation.id } });
      await prisma.socialTicket.delete({ where: { id: ticket.id } });
      await prisma.conversationMessage.delete({ where: { id: message.id } });
      await prisma.conversation.delete({ where: { id: conversation.id } });
      await prisma.externalCustomerIdentity.delete({ where: { id: identity.id } });
      await prisma.integrationConnection.delete({ where: { id: connection.id } });
    }
  });

  it('creates manual draft orders with server-resolved prices and idempotent replay', async () => {
    const input = { customerId, lines: [{ variantId, quantity: '0.00005' }] };
    const key = `order-e2e-${suffix}-manual`;
    const created = await sales.post('/api/v1/orders').set('Idempotency-Key', key).send(input);
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    expect(created.body.data).toMatchObject({
      status: 'DRAFT',
      sourceQuote: null,
      sourceRevision: 0,
      lineSubtotalVnd: '1',
      grandTotalVnd: '1',
      lines: [{ quantity: '0.00005', unitPriceVnd: '10000', lineTotalVnd: '1' }],
    });
    const repeated = await sales.post('/api/v1/orders').set('Idempotency-Key', key).send(input);
    expect(repeated.status).toBe(201);
    expect(repeated.body.data.id).toBe(created.body.data.id);
    await sales
      .post('/api/v1/orders')
      .set('Idempotency-Key', key)
      .send({ ...input, lines: [{ variantId, quantity: '1' }] })
      .expect(409);
    await warehouse
      .post('/api/v1/orders')
      .set('Idempotency-Key', `order-e2e-${suffix}-forbidden`)
      .send(input)
      .expect(403);
    const stored = await prisma.salesOrder.findUniqueOrThrow({
      where: { id: created.body.data.id },
    });
    expect(stored.sourceQuoteId).toBeNull();
    expect(stored.status).toBe('DRAFT');
    const manualAlerts = await prisma.adminAlert.findMany({
      where: { orderId: stored.id, type: 'MANUAL_ORDER_CREATED' },
    });
    expect(manualAlerts).toHaveLength(1);
    const manualAlertId = manualAlerts[0]?.id;
    if (!manualAlertId) throw new Error('Expected manual-order admin alert.');
    await owner.post(`/api/v1/admin-alerts/${manualAlertId}/read`).expect(201);

    const payableOrder = await sales
      .post('/api/v1/orders')
      .set('Idempotency-Key', `order-e2e-${suffix}-payable`)
      .send({ customerId, lines: [{ variantId, quantity: '1' }] })
      .expect(201);
    const payableOrderId = payableOrder.body.data.id as string;
    const payableAlert = await prisma.adminAlert.findFirstOrThrow({
      where: { orderId: payableOrderId, type: 'MANUAL_ORDER_CREATED' },
      select: { id: true },
    });
    await owner.post(`/api/v1/admin-alerts/${payableAlert.id}/read`).expect(201);

    const firstReceiptKey = `payment-e2e-${suffix}-partial`;
    const firstReceipt = await owner
      .post('/api/v1/payments')
      .set('Idempotency-Key', firstReceiptKey)
      .send({
        customerId,
        amountVnd: '4000',
        allocations: [{ orderId: payableOrderId, amountVnd: '4000' }],
        note: 'Thu lần một',
      })
      .expect(201);
    expect(firstReceipt.body.data).toMatchObject({
      amountVnd: '4000',
      allocatedVnd: '4000',
      unallocatedVnd: '0',
    });
    const firstReceiptReplay = await owner
      .post('/api/v1/payments')
      .set('Idempotency-Key', firstReceiptKey)
      .send({
        customerId,
        amountVnd: '4000',
        allocations: [{ orderId: payableOrderId, amountVnd: '4000' }],
        note: 'Thu lần một',
      })
      .expect(201);
    expect(firstReceiptReplay.body.data.id).toBe(firstReceipt.body.data.id);
    const afterPartialPayment = await sales.get(`/api/v1/orders/${payableOrderId}`).expect(200);
    expect(afterPartialPayment.body.data).toMatchObject({
      status: 'DRAFT',
      paidVnd: '4000',
      remainingVnd: '6000',
      version: 2,
    });
    await owner
      .post(`/api/v1/orders/${payableOrderId}/cancel`)
      .set('Idempotency-Key', `payment-e2e-${suffix}-cancel-paid`)
      .send({ expectedVersion: 2 })
      .expect(409)
      .then((response) =>
        expect(response.body.error.code).toBe('ORDER_HAS_PAYMENTS_CANNOT_CANCEL'),
      );
    await sales
      .post(`/api/v1/orders/${payableOrderId}/confirm`)
      .set('Idempotency-Key', `payment-e2e-${suffix}-premature-confirm`)
      .send({ expectedVersion: 2 })
      .expect(409)
      .then((response) => expect(response.body.error.code).toBe('PAYMENT_REQUIRED_TO_CONFIRM'));

    const secondReceipt = await owner
      .post('/api/v1/payments')
      .set('Idempotency-Key', `payment-e2e-${suffix}-overpayment`)
      .send({
        customerId,
        amountVnd: '7000',
        allocations: [{ orderId: payableOrderId, amountVnd: '6000' }],
      })
      .expect(201);
    expect(secondReceipt.body.data).toMatchObject({
      allocatedVnd: '6000',
      unallocatedVnd: '1000',
      customerCreditBalanceVnd: '1000',
    });
    const credit = await owner.get(`/api/v1/customer-credit/${customerId}`).expect(200);
    expect(credit.body.data.balanceVnd).toBe('1000');
    const paidOrder = await sales.get(`/api/v1/orders/${payableOrderId}`).expect(200);
    expect(paidOrder.body.data).toMatchObject({
      paidVnd: '10000',
      remainingVnd: '0',
      version: 3,
    });
    const confirmed = await sales
      .post(`/api/v1/orders/${payableOrderId}/confirm`)
      .set('Idempotency-Key', `payment-e2e-${suffix}-confirm`)
      .send({ expectedVersion: 3 })
      .expect(201);
    expect(confirmed.body.data).toMatchObject({ status: 'CONFIRMED', remainingVnd: '0' });
    await sales
      .post(`/api/v1/orders/${payableOrderId}/confirm`)
      .set('Idempotency-Key', `payment-e2e-${suffix}-confirm`)
      .send({ expectedVersion: 3 })
      .expect(201);
    const receivable = await prisma.receivable.findUniqueOrThrow({
      where: { orderId: payableOrderId },
      include: { settlements: true },
    });
    expect(receivable.amountVnd.toString()).toBe('10000');
    expect(receivable.balanceVnd.toString()).toBe('0');
    expect(receivable.settlements).toHaveLength(2);
  });

  it('tính tiền chính xác, bảo vệ giảm/thuế, idempotency, version và revision 72 giờ', async () => {
    const input = {
      customerId,
      lines: [
        { variantId, quantity: '5', discountMode: 'PERCENTAGE', discountValue: '10' },
        { variantId, quantity: '2' },
      ],
      orderDiscountMode: 'FIXED_VND',
      orderDiscountValue: '5000',
      shippingFeeVnd: '2000',
      taxMode: 'PERCENTAGE',
      taxValue: '10',
      depositVnd: '10000',
      paymentNote: 'Chuyển khoản trước khi giao',
    };
    const key = `quote-e2e-${suffix}-create`;
    const created = await owner.post('/api/v1/quotes').set('Idempotency-Key', key).send(input);
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    quoteId = created.body.data.id as string;
    expect(created.body.data).toMatchObject({
      status: 'DRAFT',
      lineSubtotalVnd: '70000',
      lineDiscountVnd: '5000',
      orderDiscountVnd: '5000',
      shippingFeeVnd: '2000',
      taxVnd: '6200',
      grandTotalVnd: '68200',
      depositVnd: '10000',
    });
    const repeated = await owner
      .post('/api/v1/quotes')
      .set('Idempotency-Key', key)
      .send(input)
      .expect(201);
    expect(repeated.body.data.id).toBe(quoteId);
    await owner
      .post('/api/v1/quotes')
      .set('Idempotency-Key', key)
      .send({ ...input, shippingFeeVnd: '3000' })
      .expect(409);

    await sales
      .post('/api/v1/quotes')
      .set('Idempotency-Key', `quote-e2e-${suffix}-sales-discount`)
      .send({
        customerId,
        lines: [{ variantId, quantity: '1', discountMode: 'FIXED_VND', discountValue: '100' }],
      })
      .expect(403);
    await sales
      .post('/api/v1/quotes')
      .set('Idempotency-Key', `quote-e2e-${suffix}-sales-tax`)
      .send({
        customerId,
        lines: [{ variantId, quantity: '1' }],
        taxMode: 'FIXED_VND',
        taxValue: '100',
      })
      .expect(403);
    await owner
      .post('/api/v1/quotes')
      .set('Idempotency-Key', `quote-e2e-${suffix}-missing-tier`)
      .send({
        customerId,
        lines: [{ variantId, quantity: '10' }],
      })
      .expect(422);
    await owner
      .post('/api/v1/quotes')
      .set('Idempotency-Key', `quote-e2e-${suffix}-over-discount`)
      .send({
        customerId,
        lines: [{ variantId, quantity: '1', discountMode: 'FIXED_VND', discountValue: '20000' }],
      })
      .expect(422);

    const updated = await owner
      .patch(`/api/v1/quotes/${quoteId}`)
      .set('Idempotency-Key', `quote-e2e-${suffix}-update`)
      .send({
        expectedVersion: 1,
        shippingFeeVnd: '3000',
      })
      .expect(200);
    expect(updated.body.data).toMatchObject({
      version: 2,
      shippingFeeVnd: '3000',
      grandTotalVnd: '69300',
    });
    await owner
      .patch(`/api/v1/quotes/${quoteId}`)
      .set('Idempotency-Key', `quote-e2e-${suffix}-stale`)
      .send({
        expectedVersion: 1,
        shippingFeeVnd: '4000',
      })
      .expect(409);

    const receivedAt = new Date().toISOString();
    const sendInput = { expectedVersion: 2, receivedAt };
    const sent = await owner
      .post(`/api/v1/quotes/${quoteId}/send`)
      .set('Idempotency-Key', `quote-e2e-${suffix}-send`)
      .send(sendInput);
    expect(sent.status, JSON.stringify(sent.body)).toBe(201);
    expect(sent.body.data.status).toBe('SENT');
    expect(
      new Date(sent.body.data.expiresAt).getTime() - new Date(sent.body.data.receivedAt).getTime(),
    ).toBe(72 * 60 * 60 * 1000);
    const revision = await owner.get(`/api/v1/quotes/${quoteId}/revisions/1`).expect(200);
    expect(revision.body.data.snapshot.grandTotalVnd).toBe('69300');
    await owner
      .put('/api/v1/price-tiers')
      .set('Idempotency-Key', `quote-e2e-${suffix}-price-change`)
      .send({
        variantId,
        quantityFrom: 1,
        expectedVersion: 1,
        priceVnd: '9000',
      })
      .expect(200);
    const unchangedRevision = await owner.get(`/api/v1/quotes/${quoteId}/revisions/1`).expect(200);
    expect(unchangedRevision.body.data.snapshot.grandTotalVnd).toBe('69300');
    const sentAgain = await owner
      .post(`/api/v1/quotes/${quoteId}/send`)
      .set('Idempotency-Key', `quote-e2e-${suffix}-send`)
      .send(sendInput)
      .expect(201);
    expect(sentAgain.body.data.revisionNumber).toBe(1);

    const movementsBeforeConversion = await prisma.stockMovement.count({
      where: { variantId },
    });
    const conversionKey = `quote-e2e-${suffix}-convert`;
    const converted = await sales
      .post(`/api/v1/quotes/${quoteId}/convert`)
      .set('Idempotency-Key', conversionKey)
      .send({ expectedVersion: 3 })
      .expect(201);
    expect(converted.body.data).toMatchObject({
      order: {
        status: 'DRAFT',
        sourceRevision: 1,
        lineSubtotalVnd: '70000',
        shippingFeeVnd: '3000',
        grandTotalVnd: '69300',
        lines: [
          { skuSnapshot: sku, unitPriceVnd: '10000', lineTotalVnd: '45000' },
          { skuSnapshot: sku, unitPriceVnd: '10000', lineTotalVnd: '20000' },
        ],
      },
      quote: { status: 'ACCEPTED', version: 4 },
      alertsCreated: 1,
    });
    expect(await prisma.stockMovement.count({ where: { variantId } })).toBe(
      movementsBeforeConversion,
    );
    const reservedAfterConversion = await prisma.stockBalance.findUniqueOrThrow({
      where: {
        businessId_warehouseId_variantId: {
          businessId: 'business_local_default',
          warehouseId,
          variantId,
        },
      },
    });
    expect(reservedAfterConversion.reservedQuantity.toString()).toBe('8');
    expect(
      await prisma.stockReservationEvent.count({
        where: { orderId: converted.body.data.order.id, type: 'RESERVED' },
      }),
    ).toBe(2);
    const convertedOrderId = converted.body.data.order.id as string;
    const orderList = await sales
      .get(`/api/v1/orders?query=${converted.body.data.order.orderNumber}`)
      .expect(200);
    expect(orderList.body.data.items).toHaveLength(1);
    expect(orderList.body.data.items[0]).toMatchObject({
      id: convertedOrderId,
      status: 'DRAFT',
      customer: { id: customerId, displayName: name },
      sourceQuote: { id: quoteId },
      grandTotalVnd: '69300',
    });
    const orderDetail = await sales.get(`/api/v1/orders/${convertedOrderId}`).expect(200);
    expect(orderDetail.body.data.lines).toHaveLength(2);
    await sales.get('/api/v1/orders/not-an-order').expect(404);
    await warehouse.get('/api/v1/orders').expect(403);
    const quoteAfterConversion = await owner.get(`/api/v1/quotes/${quoteId}`).expect(200);
    expect(quoteAfterConversion.body.data.salesOrder).toMatchObject({
      id: convertedOrderId,
      status: 'DRAFT',
      sourceRevision: 1,
    });
    await sales
      .post(`/api/v1/quotes/${quoteId}/convert`)
      .set('Idempotency-Key', conversionKey)
      .send({ expectedVersion: 3 })
      .expect(201)
      .then((response) => expect(response.body.data.order.id).toBe(convertedOrderId));
    await sales
      .post(`/api/v1/quotes/${quoteId}/convert`)
      .set('Idempotency-Key', `quote-e2e-${suffix}-convert-again`)
      .send({ expectedVersion: 4 })
      .expect(409);
    await sales.get('/api/v1/admin-alerts').expect(403);
    const alerts = await owner.get('/api/v1/admin-alerts').expect(200);
    expect(alerts.body.data.unreadCount).toBe(1);
    expect(alerts.body.data.items).toContainEqual(
      expect.objectContaining({
        type: 'QUOTE_CONVERTED',
        order: { id: convertedOrderId, status: 'DRAFT', orderNumber: expect.any(String) },
      }),
    );
    const alertItems = alerts.body.data.items as Array<{
      id: string;
      type: string;
      order: { id: string; status: string };
    }>;
    const alertId = alertItems.find(
      (alert) => alert.type === 'QUOTE_CONVERTED' && alert.order.id === convertedOrderId,
    )!.id;
    await owner.post(`/api/v1/admin-alerts/${alertId}/read`).expect(201);
    const readAlerts = await owner.get('/api/v1/admin-alerts').expect(200);
    expect(readAlerts.body.data.unreadCount).toBe(0);

    const expiringQuote = await owner
      .post('/api/v1/quotes')
      .set('Idempotency-Key', `quote-e2e-${suffix}-expiring-create`)
      .send({ customerId, lines: [{ variantId, quantity: '1' }] })
      .expect(201);
    const expiringQuoteId = expiringQuote.body.data.id as string;
    await owner
      .post(`/api/v1/quotes/${expiringQuoteId}/send`)
      .set('Idempotency-Key', `quote-e2e-${suffix}-expiring-send`)
      .send({ expectedVersion: 1, receivedAt: new Date().toISOString() })
      .expect(201);
    await prisma.quote.update({
      where: { id: expiringQuoteId },
      data: { expiresAt: new Date(Date.now() - 1) },
    });
    await sales
      .post(`/api/v1/quotes/${expiringQuoteId}/convert`)
      .set('Idempotency-Key', `quote-e2e-${suffix}-expiring-convert`)
      .send({ expectedVersion: 2 })
      .expect(409);

    const concurrentQuote = await owner
      .post('/api/v1/quotes')
      .set('Idempotency-Key', `quote-e2e-${suffix}-concurrent-create`)
      .send({ customerId, lines: [{ variantId, quantity: '1' }] })
      .expect(201);
    const concurrentQuoteId = concurrentQuote.body.data.id as string;
    await owner
      .post(`/api/v1/quotes/${concurrentQuoteId}/send`)
      .set('Idempotency-Key', `quote-e2e-${suffix}-concurrent-send`)
      .send({ expectedVersion: 1, receivedAt: new Date().toISOString() })
      .expect(201);
    const concurrentResults = await Promise.all([
      sales
        .post(`/api/v1/quotes/${concurrentQuoteId}/convert`)
        .set('Idempotency-Key', `quote-e2e-${suffix}-concurrent-convert-a`)
        .send({ expectedVersion: 2 }),
      sales
        .post(`/api/v1/quotes/${concurrentQuoteId}/convert`)
        .set('Idempotency-Key', `quote-e2e-${suffix}-concurrent-convert-b`)
        .send({ expectedVersion: 2 }),
    ]);
    expect(concurrentResults.map(({ status }) => status).sort()).toEqual([201, 409]);
    const concurrentOrder = await prisma.salesOrder.findMany({
      where: { sourceQuoteId: concurrentQuoteId },
      select: { id: true },
    });
    expect(concurrentOrder).toHaveLength(1);
    const concurrentOrderId = concurrentOrder[0]?.id;
    expect(concurrentOrderId).toBeDefined();
    if (!concurrentOrderId) throw new Error('Concurrent conversion did not create an order.');
    expect(await prisma.adminAlert.count({ where: { orderId: concurrentOrderId } })).toBe(1);

    const insufficientQuote = await owner
      .post('/api/v1/quotes')
      .set('Idempotency-Key', `quote-e2e-${suffix}-insufficient-create`)
      .send({
        customerId,
        lines: [
          { variantId, quantity: '1' },
          { variantId, quantity: '1' },
          { variantId, quantity: '1' },
        ],
      })
      .expect(201);
    const insufficientQuoteId = insufficientQuote.body.data.id as string;
    await owner
      .post(`/api/v1/quotes/${insufficientQuoteId}/send`)
      .set('Idempotency-Key', `quote-e2e-${suffix}-insufficient-send`)
      .send({ expectedVersion: 1, receivedAt: new Date().toISOString() })
      .expect(201);
    await sales
      .post(`/api/v1/quotes/${insufficientQuoteId}/convert`)
      .set('Idempotency-Key', `quote-e2e-${suffix}-insufficient-convert`)
      .send({ expectedVersion: 2 })
      .expect(409)
      .then((response) => expect(response.body.error.code).toBe('INSUFFICIENT_AVAILABLE_STOCK'));
    expect(await prisma.salesOrder.count({ where: { sourceQuoteId: insufficientQuoteId } })).toBe(
      0,
    );
    expect(
      (await owner.get(`/api/v1/quotes/${insufficientQuoteId}`).expect(200)).body.data.status,
    ).toBe('SENT');

    await sales
      .post(`/api/v1/orders/${convertedOrderId}/cancel`)
      .set('Idempotency-Key', `quote-e2e-${suffix}-forbidden-cancel`)
      .send({ expectedVersion: 1 })
      .expect(403);
    const canceledOrder = await owner
      .post(`/api/v1/orders/${convertedOrderId}/cancel`)
      .set('Idempotency-Key', `quote-e2e-${suffix}-cancel`)
      .send({ expectedVersion: 1 })
      .expect(201);
    expect(canceledOrder.body.data.status).toBe('CANCELED');
    const balanceAfterCancel = await prisma.stockBalance.findUniqueOrThrow({
      where: {
        businessId_warehouseId_variantId: {
          businessId: 'business_local_default',
          warehouseId,
          variantId,
        },
      },
    });
    expect(balanceAfterCancel.reservedQuantity.toString()).toBe('2');
    await owner
      .post(`/api/v1/orders/${convertedOrderId}/cancel`)
      .set('Idempotency-Key', `quote-e2e-${suffix}-cancel`)
      .send({ expectedVersion: 1 })
      .expect(201);
    expect(
      await prisma.stockReservationEvent.count({
        where: { orderId: convertedOrderId, type: 'RELEASED' },
      }),
    ).toBe(2);

    const fixedTax = await owner
      .post('/api/v1/quotes')
      .set('Idempotency-Key', `quote-e2e-${suffix}-fixed-tax`)
      .send({
        customerId,
        lines: [{ variantId, quantity: '0.000056' }],
        taxMode: 'FIXED_VND',
        taxValue: '25',
      })
      .expect(201);
    expect(fixedTax.body.data).toMatchObject({
      lineSubtotalVnd: '1',
      taxVnd: '25',
      grandTotalVnd: '26',
    });
  });
});
