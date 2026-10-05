import type { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApplication } from '../src/bootstrap';
import { PrismaService } from '../src/prisma/prisma.service';

const ownerEmail = process.env.SEED_OWNER_EMAIL ?? 'owner@crm.local';
const ownerPassword = process.env.SEED_OWNER_PASSWORD ?? 'Local-test-password-123!';

describe('pricing tier API', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let owner: ReturnType<typeof request.agent>;
  let sales: ReturnType<typeof request.agent>;
  const suffix = randomUUID().slice(0, 8).toUpperCase();
  const productName = `E2E Pricing ${suffix}`;
  const sku = `E2E-PRICE-${suffix}`;
  const idempotencyKey = `pricing-e2e-${suffix}-tier5`;
  let variantId = '';
  let foreignVariantId = '';
  let foreignProductId = '';
  let foreignBusinessId = '';
  let salesEmail = '';

  async function cleanup() {
    await prisma.priceTierCommand.deleteMany({
      where: { idempotencyKey: { startsWith: `pricing-e2e-${suffix}` } },
    });
    await prisma.priceTier.deleteMany({ where: { variant: { sku } } });
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
    if (foreignProductId) {
      await prisma.unitConversion.deleteMany({
        where: { variant: { productId: foreignProductId } },
      });
      await prisma.productVariant.deleteMany({ where: { productId: foreignProductId } });
      await prisma.product.deleteMany({ where: { id: foreignProductId } });
    }
    if (foreignBusinessId) await prisma.business.deleteMany({ where: { id: foreignBusinessId } });
    if (salesEmail)
      await prisma.staffUser.deleteMany({ where: { emailNormalized: salesEmail.toLowerCase() } });
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
    const created = await owner
      .post('/api/v1/products')
      .send({
        name: productName,
        variants: [
          { sku, name: 'Sản phẩm kiểm thử giá', baseUnitCode: 'cai', baseUnitName: 'Cái' },
        ],
      })
      .expect(201);
    variantId = created.body.data.variants[0].id as string;

    const foreignBusiness = await prisma.business.create({
      data: { name: `E2E Other Pricing ${suffix}` },
    });
    foreignBusinessId = foreignBusiness.id;
    const foreignProduct = await prisma.product.create({
      data: {
        businessId: foreignBusinessId,
        name: `E2E Other Pricing Product ${suffix}`,
        variants: {
          create: {
            businessId: foreignBusinessId,
            sku: 'E2E-FOREIGN-PRICE',
            name: 'SKU thuộc business khác',
            baseUnitCode: 'cai',
            baseUnitName: 'Cái',
          },
        },
      },
      select: { id: true, variants: { select: { id: true } } },
    });
    foreignProductId = foreignProduct.id;
    const foreignVariant = foreignProduct.variants[0];
    if (!foreignVariant) {
      throw new Error('Không tạo được SKU kiểm thử cho business khác.');
    }
    foreignVariantId = foreignVariant.id;

    salesEmail = `pricing-sales-${suffix}@crm.local`;
    await owner
      .post('/api/v1/staff')
      .send({
        email: salesEmail,
        displayName: 'Nhân viên không có quyền giá',
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

  it('lưu giá admin, chọn đúng các bậc và chặn giá cũ/ghi trùng', async () => {
    const missing = await owner
      .get(`/api/v1/price-tiers/resolve?variantId=${variantId}&quantity=6`)
      .expect(200);
    expect(missing.body.data).toMatchObject({
      quantityFrom: 5,
      priceVnd: null,
      status: 'AUTO_PRICE_RULE_REQUIRED',
    });

    const input = { variantId, quantityFrom: 5, expectedVersion: 0, priceVnd: '80000' };
    const first = await owner
      .put('/api/v1/price-tiers')
      .set('Idempotency-Key', idempotencyKey)
      .send(input)
      .expect(200);
    expect(first.body.data).toMatchObject({ sku, quantityFrom: 5, priceVnd: '80000', version: 1 });

    const replay = await owner
      .put('/api/v1/price-tiers')
      .set('Idempotency-Key', idempotencyKey)
      .send(input)
      .expect(200);
    expect(replay.body.data.id).toBe(first.body.data.id);
    await owner
      .put('/api/v1/price-tiers')
      .set('Idempotency-Key', idempotencyKey)
      .send({ ...input, priceVnd: '79000' })
      .expect(409);

    for (const [tier, price] of [
      [10, '70000'],
      [15, '60000'],
    ] as const) {
      await owner
        .put('/api/v1/price-tiers')
        .set('Idempotency-Key', `pricing-e2e-${suffix}-tier${tier}`)
        .send({ variantId, quantityFrom: tier, expectedVersion: 0, priceVnd: price })
        .expect(200);
    }
    for (const [quantity, tier, price] of [
      [5, 5, '80000'],
      [9, 5, '80000'],
      [10, 10, '70000'],
      [14, 10, '70000'],
      [15, 15, '60000'],
      [19, 15, '60000'],
    ]) {
      const response = await owner
        .get(`/api/v1/price-tiers/resolve?variantId=${variantId}&quantity=${quantity}`)
        .expect(200);
      expect(response.body.data).toMatchObject({
        quantityFrom: tier,
        priceVnd: price,
        source: 'ADMIN',
        status: 'RESOLVED',
      });
    }
    await owner
      .put('/api/v1/price-tiers')
      .set('Idempotency-Key', `pricing-e2e-${suffix}-invalid`)
      .send({ variantId, quantityFrom: 6, expectedVersion: 0, priceVnd: '80000' })
      .expect(422);
    await owner
      .put('/api/v1/price-tiers')
      .set('Idempotency-Key', `pricing-e2e-${suffix}-stale`)
      .send({ variantId, quantityFrom: 5, expectedVersion: 0, priceVnd: '70000' })
      .expect(409);

    await owner
      .put('/api/v1/price-tiers')
      .set('Idempotency-Key', `pricing-e2e-${suffix}-delete`)
      .send({ variantId, quantityFrom: 5, expectedVersion: 1, priceVnd: null })
      .expect(200);
    const cleared = await owner
      .get(`/api/v1/price-tiers/resolve?variantId=${variantId}&quantity=8`)
      .expect(200);
    expect(cleared.body.data).toMatchObject({
      quantityFrom: 5,
      priceVnd: null,
      status: 'AUTO_PRICE_RULE_REQUIRED',
    });
  });

  it('từ chối role sales gọi trực tiếp API quản trị giá', async () => {
    await sales.get('/api/v1/price-tiers').expect(403);
    await sales
      .put('/api/v1/price-tiers')
      .set('Idempotency-Key', `pricing-e2e-${suffix}-sales`)
      .send({ variantId, quantityFrom: 5, expectedVersion: 0, priceVnd: '50000' })
      .expect(403);
  });

  it('không đọc hoặc sửa giá của SKU thuộc business khác', async () => {
    const list = await owner.get(`/api/v1/price-tiers?variantId=${foreignVariantId}`).expect(200);
    expect(list.body.data.items).toEqual([]);
    await owner
      .get(`/api/v1/price-tiers/resolve?variantId=${foreignVariantId}&quantity=6`)
      .expect(404);
    await owner
      .put('/api/v1/price-tiers')
      .set('Idempotency-Key', `pricing-e2e-${suffix}-foreign`)
      .send({ variantId: foreignVariantId, quantityFrom: 5, expectedVersion: 0, priceVnd: '60000' })
      .expect(404);
  });
});
