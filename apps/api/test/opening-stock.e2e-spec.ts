import type { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApplication } from '../src/bootstrap';
import { PrismaService } from '../src/prisma/prisma.service';

const ownerEmail = process.env.SEED_OWNER_EMAIL ?? 'owner@crm.local';
const ownerPassword = process.env.SEED_OWNER_PASSWORD ?? 'Local-test-password-123!';

describe('opening stock API phase 04C-A', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let owner: ReturnType<typeof request.agent>;
  let warehouseId = '';
  let variantId = '';
  let concurrentVariantId = '';

  async function cleanup() {
    const variants = await prisma.productVariant.findMany({
      where: { sku: { startsWith: 'E2E-OPEN-' } },
      select: { id: true, productId: true },
    });
    const variantIds = variants.map(({ id }) => id);
    if (variantIds.length) {
      await prisma.stockMovement.deleteMany({ where: { variantId: { in: variantIds } } });
      await prisma.openingStock.deleteMany({ where: { variantId: { in: variantIds } } });
      await prisma.stockBalance.deleteMany({ where: { variantId: { in: variantIds } } });
      await prisma.productVariant.deleteMany({ where: { id: { in: variantIds } } });
      await prisma.product.deleteMany({
        where: { id: { in: [...new Set(variants.map(({ productId }) => productId))] } },
      });
    }
    await prisma.staffUser.deleteMany({
      where: { emailNormalized: { startsWith: 'opening-' } },
    });
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
    const warehouses = await owner.get('/api/v1/warehouses').expect(200);
    warehouseId = warehouses.body.data[0].id;
    const stamp = Date.now();
    const product = await owner
      .post('/api/v1/products')
      .send({
        name: 'E2E Opening Product',
        variants: [
          {
            sku: `E2E-OPEN-${stamp}-A`,
            name: 'Tồn đầu A',
            baseUnitCode: 'CAI',
            baseUnitName: 'Cái',
          },
          {
            sku: `E2E-OPEN-${stamp}-B`,
            name: 'Tồn đầu B',
            baseUnitCode: 'CAI',
            baseUnitName: 'Cái',
          },
        ],
      })
      .expect(201);
    variantId = product.body.data.variants[0].id;
    concurrentVariantId = product.body.data.variants[1].id;
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  it('chặn giá trị lẻ VND, rồi ghi tồn đầu và một dòng sổ tương ứng', async () => {
    const fractional = await owner
      .post('/api/v1/stock-openings')
      .set('Idempotency-Key', 'opening-fractional-001')
      .send({ warehouseId, variantId, quantity: '0.5', unitCostVnd: '1' })
      .expect(422);
    expect(fractional.body.error.code).toBe('OPENING_VALUE_INVALID');

    const created = await owner
      .post('/api/v1/stock-openings')
      .set('Idempotency-Key', 'opening-first-001')
      .send({ warehouseId, variantId, quantity: '10', unitCostVnd: '50000' })
      .expect(201);
    expect(created.body.data.documentNumber).toMatch(/^OS-/);
    expect(String(created.body.data.valueVnd)).toBe('500000');
    expect(created.body.data.skuSnapshot).toMatch(/^E2E-OPEN-\d+-A$/);
    expect(created.body.data.unitCodeSnapshot).toBe('CAI');

    const balances = await owner.get('/api/v1/stock-balances').expect(200);
    const balanceRows = balances.body.data as Array<{
      onHandQuantity: string;
      availableQuantity: string;
      averageCostVnd: string;
      variant: { id: string };
    }>;
    const balance = balanceRows.find((row) => row.variant.id === variantId);
    expect(String(balance?.onHandQuantity)).toBe('10');
    expect(String(balance?.availableQuantity)).toBe('10');
    expect(String(balance?.averageCostVnd)).toBe('50000');

    const movements = await owner.get('/api/v1/stock-movements').expect(200);
    const movementRows = movements.body.data as Array<{
      type: string;
      openingStock?: { id: string };
    }>;
    const movement = movementRows.find((row) => row.openingStock?.id === created.body.data.id);
    expect(movement?.type).toBe('OPENING_STOCK');
    expect(
      await prisma.stockMovement.count({ where: { openingStockId: created.body.data.id } }),
    ).toBe(1);
  });

  it('gửi lặp trả cùng chứng từ, đổi payload trả 409, SKU có tồn không được mở lại', async () => {
    const body = { warehouseId, variantId, quantity: '10', unitCostVnd: '50000' };
    const first = await owner
      .post('/api/v1/stock-openings')
      .set('Idempotency-Key', 'opening-first-001')
      .send(body)
      .expect(201);
    const repeated = await owner
      .post('/api/v1/stock-openings')
      .set('Idempotency-Key', 'opening-first-001')
      .send(body)
      .expect(201);
    expect(repeated.body.data.id).toBe(first.body.data.id);
    const reused = await owner
      .post('/api/v1/stock-openings')
      .set('Idempotency-Key', 'opening-first-001')
      .send({ ...body, quantity: '11' })
      .expect(409);
    expect(reused.body.error.code).toBe('IDEMPOTENCY_KEY_REUSED');
    const duplicate = await owner
      .post('/api/v1/stock-openings')
      .set('Idempotency-Key', 'opening-second-001')
      .send(body)
      .expect(409);
    expect(duplicate.body.error.code).toBe('OPENING_STOCK_ALREADY_EXISTS');
  });

  it('hai request đồng thời cho cùng SKU chỉ ghi một chứng từ tồn đầu', async () => {
    const body = {
      warehouseId,
      variantId: concurrentVariantId,
      quantity: '3',
      unitCostVnd: '10000',
    };
    const responses = await Promise.all([
      owner
        .post('/api/v1/stock-openings')
        .set('Idempotency-Key', `opening-race-a-${randomUUID()}`)
        .send(body),
      owner
        .post('/api/v1/stock-openings')
        .set('Idempotency-Key', `opening-race-b-${randomUUID()}`)
        .send(body),
    ]);
    expect(responses.map(({ status }) => status).sort()).toEqual([201, 409]);
    expect(await prisma.openingStock.count({ where: { variantId: concurrentVariantId } })).toBe(1);
  });

  it('nhân viên kho xem số lượng nhưng không xem giá vốn; sales bị từ chối', async () => {
    const timestamp = Date.now();
    const warehouseEmail = `opening-warehouse-${timestamp}@crm.local`;
    const salesEmail = `opening-sales-${timestamp}@crm.local`;
    for (const [email, roleCodes] of [
      [warehouseEmail, ['warehouse']],
      [salesEmail, ['sales']],
    ] as const) {
      await owner
        .post('/api/v1/staff')
        .send({
          email,
          displayName: `E2E ${roleCodes[0]}`,
          password: 'Opening-test-password-123!',
          roleCodes,
        })
        .expect(201);
    }
    const warehouse = request.agent(app.getHttpServer());
    await warehouse
      .post('/api/v1/auth/sessions')
      .send({ email: warehouseEmail, password: 'Opening-test-password-123!' })
      .expect(201);
    const list = await warehouse.get('/api/v1/stock-openings').expect(200);
    expect(list.body.data[0]).not.toHaveProperty('unitCostVnd');
    expect(list.body.data[0]).not.toHaveProperty('valueVnd');

    const sales = request.agent(app.getHttpServer());
    await sales
      .post('/api/v1/auth/sessions')
      .send({ email: salesEmail, password: 'Opening-test-password-123!' })
      .expect(201);
    const forbidden = await sales.post('/api/v1/stock-openings').send({}).expect(403);
    expect(forbidden.body.error.code).toBe('PERMISSION_DENIED');
  });
});
