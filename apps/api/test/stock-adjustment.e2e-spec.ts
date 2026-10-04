import type { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApplication } from '../src/bootstrap';
import { PrismaService } from '../src/prisma/prisma.service';

const ownerEmail = process.env.SEED_OWNER_EMAIL ?? 'owner@crm.local';
const ownerPassword = process.env.SEED_OWNER_PASSWORD ?? 'Local-test-password-123!';

describe('stock adjustment API phase 04C-B', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let owner: ReturnType<typeof request.agent>;
  let warehouseId = '';
  let variantId = '';

  async function cleanup() {
    const variants = await prisma.productVariant.findMany({
      where: { sku: { startsWith: 'E2E-ADJUST-' } },
      select: { id: true, productId: true },
    });
    const variantIds = variants.map(({ id }) => id);
    if (variantIds.length) {
      await prisma.stockMovement.deleteMany({ where: { variantId: { in: variantIds } } });
      await prisma.stockAdjustment.deleteMany({ where: { variantId: { in: variantIds } } });
      await prisma.openingStock.deleteMany({ where: { variantId: { in: variantIds } } });
      await prisma.stockBalance.deleteMany({ where: { variantId: { in: variantIds } } });
      await prisma.productVariant.deleteMany({ where: { id: { in: variantIds } } });
      await prisma.product.deleteMany({
        where: { id: { in: [...new Set(variants.map(({ productId }) => productId))] } },
      });
    }
    await prisma.staffUser.deleteMany({
      where: { emailNormalized: { startsWith: 'adjustment-' } },
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
    const product = await owner
      .post('/api/v1/products')
      .send({
        name: 'E2E Stock Adjustment Product',
        variants: [
          {
            sku: `E2E-ADJUST-${Date.now()}`,
            name: 'Kiểm kê',
            baseUnitCode: 'CAI',
            baseUnitName: 'Cái',
          },
        ],
      })
      .expect(201);
    variantId = product.body.data.variants[0].id;
    await owner
      .post('/api/v1/stock-openings')
      .set('Idempotency-Key', `adjust-opening-${randomUUID()}`)
      .send({ warehouseId, variantId, quantity: '10', unitCostVnd: '50000' })
      .expect(201);
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  async function version() {
    const result = await owner.get('/api/v1/stock-balances').expect(200);
    const rows = result.body.data as Array<{ version: number; variant: { id: string } }>;
    const balance = rows.find((row: { variant: { id: string } }) => row.variant.id === variantId);
    if (!balance) throw new Error('Test fixture stock balance is missing.');
    return balance.version;
  }

  it('lưu kết quả kiểm kê, ghi chênh lệch và tính tồn/giá vốn phía server', async () => {
    const currentVersion = await version();
    const result = await owner
      .post('/api/v1/stock-adjustments')
      .set('Idempotency-Key', 'adjust-count-down-001')
      .send({
        warehouseId,
        variantId,
        expectedVersion: currentVersion,
        countedQuantity: '8',
        reasonCode: 'COUNT_VARIANCE',
        notes: 'Kiểm đếm cuối ca',
      });
    expect(result.status, JSON.stringify(result.body)).toBe(201);

    expect(result.body.data.documentNumber).toMatch(/^SA-/);
    expect(String(result.body.data.systemQuantity)).toBe('10');
    expect(String(result.body.data.countedQuantity)).toBe('8');
    expect(String(result.body.data.quantityDelta)).toBe('-2');
    expect(String(result.body.data.valueDeltaVnd)).toBe('-100000');
    expect(result.body.data.stockMovement).not.toBeNull();

    const balances = await owner.get('/api/v1/stock-balances').expect(200);
    const rows = balances.body.data as Array<{
      onHandQuantity: string;
      averageCostVnd: string;
      variant: { id: string };
    }>;
    const balance = rows.find((row: { variant: { id: string } }) => row.variant.id === variantId);
    if (!balance) throw new Error('Test fixture stock balance is missing after adjustment.');
    expect(String(balance.onHandQuantity)).toBe('8');
    expect(String(balance.averageCostVnd)).toBe('50000');
  });

  it('cùng key trả cùng chứng từ; payload đổi hoặc phiên bản tồn cũ bị từ chối', async () => {
    const currentVersion = await version();
    const body = {
      warehouseId,
      variantId,
      expectedVersion: currentVersion,
      countedQuantity: '8',
      reasonCode: 'COUNT_VARIANCE',
    };
    const first = await owner
      .post('/api/v1/stock-adjustments')
      .set('Idempotency-Key', 'adjust-count-same-001')
      .send(body)
      .expect(201);
    const repeat = await owner
      .post('/api/v1/stock-adjustments')
      .set('Idempotency-Key', 'adjust-count-same-001')
      .send(body)
      .expect(201);
    expect(repeat.body.data.id).toBe(first.body.data.id);
    expect(repeat.body.data.quantityDelta).toBe('0');
    expect(repeat.body.data.stockMovement).toBeNull();

    const reused = await owner
      .post('/api/v1/stock-adjustments')
      .set('Idempotency-Key', 'adjust-count-same-001')
      .send({ ...body, countedQuantity: '7' })
      .expect(409);
    expect(reused.body.error.code).toBe('IDEMPOTENCY_KEY_REUSED');

    const stale = await owner
      .post('/api/v1/stock-adjustments')
      .set('Idempotency-Key', 'adjust-count-stale-001')
      .send({ ...body, countedQuantity: '7' })
      .expect(409);
    expect(stale.body.error.code).toBe('STOCK_CHANGED_RECOUNT_REQUIRED');
  });

  it('kiểm tra reason, lượng giữ và không đủ điều kiện trước khi điều chỉnh', async () => {
    const currentVersion = await version();
    const mismatch = await owner
      .post('/api/v1/stock-adjustments')
      .set('Idempotency-Key', 'adjust-reason-found-001')
      .send({
        warehouseId,
        variantId,
        expectedVersion: currentVersion,
        countedQuantity: '7',
        reasonCode: 'FOUND',
      })
      .expect(422);
    expect(mismatch.body.error.code).toBe('ADJUSTMENT_REASON_MISMATCH');

    await prisma.stockBalance.update({
      where: {
        businessId_warehouseId_variantId: {
          businessId: (
            await prisma.staffUser.findUniqueOrThrow({
              where: { emailNormalized: ownerEmail.toLowerCase() },
              select: { businessId: true },
            })
          ).businessId,
          warehouseId,
          variantId,
        },
      },
      data: { reservedQuantity: '3' },
    });
    const belowCommitted = await owner
      .post('/api/v1/stock-adjustments')
      .set('Idempotency-Key', 'adjust-below-committed-001')
      .send({
        warehouseId,
        variantId,
        expectedVersion: currentVersion,
        countedQuantity: '2',
        reasonCode: 'COUNT_VARIANCE',
      })
      .expect(422);
    expect(belowCommitted.body.error.code).toBe('COUNT_BELOW_COMMITTED_QUANTITY');
  });

  it('hai lượt kiểm kê cạnh tranh cùng phiên bản chỉ được ghi một lần', async () => {
    const expectedVersion = await version();
    const base = { warehouseId, variantId, expectedVersion, reasonCode: 'COUNT_VARIANCE' };
    const results = await Promise.all([
      owner
        .post('/api/v1/stock-adjustments')
        .set('Idempotency-Key', `adjust-race-a-${randomUUID()}`)
        .send({ ...base, countedQuantity: '7' }),
      owner
        .post('/api/v1/stock-adjustments')
        .set('Idempotency-Key', `adjust-race-b-${randomUUID()}`)
        .send({ ...base, countedQuantity: '6' }),
    ]);
    expect(results.map(({ status }) => status).sort()).toEqual([201, 409]);
    expect(results.find(({ status }) => status === 409)?.body.error.code).toBe(
      'STOCK_CHANGED_RECOUNT_REQUIRED',
    );
  });

  it('ẩn giá trị với nhân viên kho và chặn sales gọi trực tiếp', async () => {
    const timestamp = Date.now();
    const warehouseEmail = `adjustment-warehouse-${timestamp}@crm.local`;
    const salesEmail = `adjustment-sales-${timestamp}@crm.local`;
    for (const [email, roleCodes] of [
      [warehouseEmail, ['warehouse']],
      [salesEmail, ['sales']],
    ] as const) {
      await owner
        .post('/api/v1/staff')
        .send({
          email,
          displayName: `E2E ${roleCodes[0]}`,
          password: 'Adjustment-test-password-123!',
          roleCodes,
        })
        .expect(201);
    }
    const warehouse = request.agent(app.getHttpServer());
    await warehouse
      .post('/api/v1/auth/sessions')
      .send({ email: warehouseEmail, password: 'Adjustment-test-password-123!' })
      .expect(201);
    const list = await warehouse.get('/api/v1/stock-adjustments').expect(200);
    const adjustmentRows = list.body.data as Array<{
      skuSnapshot: string;
      valuationCostVnd?: string;
      valueDeltaVnd?: string;
    }>;
    const row = adjustmentRows.find((item) => item.skuSnapshot.startsWith('E2E-ADJUST-'));
    expect(row).toBeDefined();
    expect(row).not.toHaveProperty('valuationCostVnd');
    expect(row).not.toHaveProperty('valueDeltaVnd');

    const sales = request.agent(app.getHttpServer());
    await sales
      .post('/api/v1/auth/sessions')
      .send({ email: salesEmail, password: 'Adjustment-test-password-123!' })
      .expect(201);
    await sales.post('/api/v1/stock-adjustments').send({}).expect(403);
  });
});
