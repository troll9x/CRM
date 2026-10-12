import type { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApplication } from '../src/bootstrap';
import { PrismaService } from '../src/prisma/prisma.service';

const ownerEmail = process.env.SEED_OWNER_EMAIL ?? 'owner@crm.local';
const ownerPassword = process.env.SEED_OWNER_PASSWORD ?? 'Local-test-password-123!';

describe('customer credit application API', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let owner: ReturnType<typeof request.agent>;
  const suffix = randomUUID().slice(0, 8).toUpperCase();
  const productName = `E2E Credit ${suffix}`;
  const sku = `E2E-CREDIT-${suffix}`;
  let customerId = '';
  let variantId = '';
  const orderIds: string[] = [];

  async function cleanup() {
    if (orderIds.length) {
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
      const applications = await prisma.customerCreditApplication.findMany({
        where: { orderId: { in: orderIds } },
        select: { id: true },
      });
      const applicationIds = applications.map(({ id }) => id);
      if (applicationIds.length) {
        await prisma.customerCreditEvent.deleteMany({
          where: { applicationId: { in: applicationIds } },
        });
        await prisma.customerCreditApplication.deleteMany({
          where: { id: { in: applicationIds } },
        });
      }
      await prisma.stockReservationEvent.deleteMany({ where: { orderId: { in: orderIds } } });
      await prisma.adminAlert.deleteMany({ where: { orderId: { in: orderIds } } });
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
      await prisma.customerTask.deleteMany({ where: { customerId } });
      await prisma.salesOpportunity.deleteMany({ where: { customerId } });
      await prisma.address.deleteMany({ where: { customerId } });
      await prisma.contactPoint.deleteMany({ where: { customerId } });
      await prisma.customer.delete({ where: { id: customerId } });
    }
    await prisma.orderCommand.deleteMany({ where: { idempotencyKey: { contains: suffix } } });
    if (variantId) {
      await prisma.stockBalance.deleteMany({ where: { variantId } });
      await prisma.priceTier.deleteMany({ where: { variantId } });
    }
    const products = await prisma.product.findMany({
      where: { name: productName },
      select: { id: true },
    });
    const productIds = products.map(({ id }) => id);
    if (productIds.length) {
      await prisma.unitConversion.deleteMany({
        where: { variant: { productId: { in: productIds } } },
      });
      await prisma.productVariant.deleteMany({ where: { productId: { in: productIds } } });
      await prisma.product.deleteMany({ where: { id: { in: productIds } } });
    }
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
      .send({ displayName: productName, groupCode: 'retail', source: 'E2E customer credit' })
      .expect(201);
    customerId = customer.body.data.customer.id as string;
    const product = await owner
      .post('/api/v1/products')
      .send({
        name: productName,
        variants: [{ sku, name: 'Gói thử', baseUnitCode: 'goi', baseUnitName: 'Gói' }],
      })
      .expect(201);
    variantId = product.body.data.variants[0].id as string;
    const warehouse = await prisma.warehouse.findFirstOrThrow({
      where: { businessId: 'business_local_default', status: 'ACTIVE' },
      select: { id: true },
    });
    await prisma.stockBalance.create({
      data: {
        businessId: 'business_local_default',
        warehouseId: warehouse.id,
        variantId,
        onHandQuantity: '10',
        averageCostVnd: '1000',
      },
    });
    await owner
      .put('/api/v1/price-tiers')
      .set('Idempotency-Key', `credit-e2e-${suffix}-price`)
      .send({ variantId, quantityFrom: 1, expectedVersion: 0, priceVnd: '5000' })
      .expect(200);
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  it('applies overpayment credit once, settles the receivable, and restores credit when a draft is canceled', async () => {
    const order = await owner
      .post('/api/v1/orders')
      .set('Idempotency-Key', `credit-e2e-${suffix}-order-main`)
      .send({ customerId, lines: [{ variantId, quantity: '2' }] })
      .expect(201);
    const orderId = order.body.data.id as string;
    orderIds.push(orderId);

    const receipt = await owner
      .post('/api/v1/payments')
      .set('Idempotency-Key', `credit-e2e-${suffix}-overpay`)
      .send({ customerId, amountVnd: '12000', allocations: [] })
      .expect(201);
    expect(receipt.body.data).toMatchObject({
      amountVnd: '12000',
      allocatedVnd: '0',
      unallocatedVnd: '12000',
      customerCreditBalanceVnd: '12000',
    });

    const keys = [`credit-e2e-${suffix}-race-a`, `credit-e2e-${suffix}-race-b`];
    const attempts = await Promise.all(
      keys.map((key) =>
        owner
          .post(`/api/v1/customer-credit/${customerId}/applications`)
          .set('Idempotency-Key', key)
          .send({ orderId, amountVnd: '7000', expectedVersion: 1 }),
      ),
    );
    expect(attempts.map((response) => response.status).sort()).toEqual([201, 409]);
    const winnerIndex = attempts.findIndex((response) => response.status === 201);
    const winnerKey = keys[winnerIndex]!;
    const winner = attempts[winnerIndex]!;
    expect(winner.body.data).toMatchObject({
      order: { id: orderId, version: 2, paidVnd: '7000', remainingVnd: '3000' },
      customerCreditBalanceVnd: '5000',
    });
    const replay = await owner
      .post(`/api/v1/customer-credit/${customerId}/applications`)
      .set('Idempotency-Key', winnerKey)
      .send({ orderId, amountVnd: '7000', expectedVersion: 1 })
      .expect(201);
    expect(replay.body.data).toEqual(winner.body.data);

    const finalApplication = await owner
      .post(`/api/v1/customer-credit/${customerId}/applications`)
      .set('Idempotency-Key', `credit-e2e-${suffix}-final`)
      .send({ orderId, amountVnd: '3000', expectedVersion: 2 })
      .expect(201);
    expect(finalApplication.body.data).toMatchObject({
      order: { version: 3, paidVnd: '10000', remainingVnd: '0' },
      customerCreditBalanceVnd: '2000',
    });

    const confirmed = await owner
      .post(`/api/v1/orders/${orderId}/confirm`)
      .set('Idempotency-Key', `credit-e2e-${suffix}-confirm`)
      .send({ expectedVersion: 3 })
      .expect(201);
    expect(confirmed.body.data).toMatchObject({
      status: 'CONFIRMED',
      paidVnd: '10000',
      cashPaidVnd: '0',
      creditAppliedVnd: '10000',
      remainingVnd: '0',
    });
    const receivable = await prisma.receivable.findUniqueOrThrow({
      where: { orderId },
      include: { settlements: true },
    });
    expect(receivable.balanceVnd.toString()).toBe('0');
    expect(receivable.settlements.reduce((sum, row) => sum + Number(row.amountVnd), 0)).toBe(10000);
    expect(
      receivable.settlements.every((row) => row.creditApplicationId && !row.paymentAllocationId),
    ).toBe(true);
    const receivablesList = await owner.get('/api/v1/receivables').expect(200);
    expect(receivablesList.body.data.items).toContainEqual(
      expect.objectContaining({
        customer: expect.objectContaining({ id: customerId }),
        order: expect.objectContaining({ id: orderId }),
        amountVnd: '10000',
        settledVnd: '10000',
        balanceVnd: '0',
      }),
    );

    const cancelOrder = await owner
      .post('/api/v1/orders')
      .set('Idempotency-Key', `credit-e2e-${suffix}-order-cancel`)
      .send({ customerId, lines: [{ variantId, quantity: '1' }] })
      .expect(201);
    const cancelOrderId = cancelOrder.body.data.id as string;
    orderIds.push(cancelOrderId);
    await owner
      .post(`/api/v1/customer-credit/${customerId}/applications`)
      .set('Idempotency-Key', `credit-e2e-${suffix}-cancel-apply`)
      .send({ orderId: cancelOrderId, amountVnd: '1000', expectedVersion: 1 })
      .expect(201);
    await owner
      .post(`/api/v1/orders/${cancelOrderId}/cancel`)
      .set('Idempotency-Key', `credit-e2e-${suffix}-cancel`)
      .send({ expectedVersion: 2 })
      .expect(201);
    const credit = await owner.get(`/api/v1/customer-credit/${customerId}`).expect(200);
    expect(credit.body.data.balanceVnd).toBe('2000');
    const events = await prisma.customerCreditEvent.findMany({
      where: { businessId: 'business_local_default', customerId },
      orderBy: { occurredAt: 'asc' },
    });
    expect(events.map((event) => event.type)).toContain('REVERSAL');
  });
});
