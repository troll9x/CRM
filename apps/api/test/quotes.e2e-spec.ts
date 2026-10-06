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
  const suffix = randomUUID().slice(0, 8).toUpperCase();
  const sku = `E2E-QUOTE-${suffix}`;
  const name = `E2E Quote ${suffix}`;
  let customerId = '';
  let variantId = '';
  let salesEmail = '';
  let quoteId = '';

  async function cleanup() {
    const quotes = await prisma.quote.findMany({ where: { customerId }, select: { id: true } });
    const quoteIds = quotes.map((quote) => quote.id);
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
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
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
