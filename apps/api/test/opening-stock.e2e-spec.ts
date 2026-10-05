import type { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApplication } from '../src/bootstrap';
import { PrismaService } from '../src/prisma/prisma.service';

const ownerEmail = process.env.SEED_OWNER_EMAIL ?? 'owner@crm.local';
const ownerPassword = process.env.SEED_OWNER_PASSWORD ?? 'Local-test-password-123!';
type BalanceRow = {
  id: string;
  version: number;
  onHandQuantity: string;
  averageCostVnd: string;
  variant: { id: string };
};

describe('stock opening and adjustment API phases 04C-A/B', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let owner: ReturnType<typeof request.agent>;
  let warehouseId = '';
  let variantId = '';
  let concurrentVariantId = '';
  let adjustmentVariantId = '';

  async function cleanup() {
    const variants = await prisma.productVariant.findMany({
      where: { sku: { startsWith: 'E2E-OPEN-' } },
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
          {
            sku: `E2E-OPEN-${stamp}-C`,
            name: 'Điều chỉnh tồn C',
            baseUnitCode: 'CAI',
            baseUnitName: 'Cái',
          },
        ],
      })
      .expect(201);
    variantId = product.body.data.variants[0].id;
    concurrentVariantId = product.body.data.variants[1].id;
    adjustmentVariantId = product.body.data.variants[2].id;
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

  it('kiểm kê 100 xuống 97 rồi lên 102, có snapshot, ledger, idempotency và version conflict', async () => {
    const created = await owner
      .post('/api/v1/stock-openings')
      .set('Idempotency-Key', `adjustment-opening-${randomUUID()}`)
      .send({ warehouseId, variantId: adjustmentVariantId, quantity: '100', unitCostVnd: '50000' })
      .expect(201);
    const balances = await owner.get('/api/v1/stock-balances').expect(200);
    const balance = (
      balances.body.data as Array<{
        id: string;
        version: number;
        onHandQuantity: string;
        variant: { id: string };
      }>
    ).find((row) => row.variant.id === adjustmentVariantId)!;
    expect(String(balance.onHandQuantity)).toBe('100');

    const decreaseBody = {
      warehouseId,
      variantId: adjustmentVariantId,
      expectedVersion: balance.version,
      countedQuantity: '97',
      reason: 'Kiểm kê định kỳ',
    };
    const decreased = await owner
      .post('/api/v1/stock-adjustments')
      .set('Idempotency-Key', 'stock-adjust-decrease-01')
      .send(decreaseBody)
      .expect(201);
    expect(String(decreased.body.data.systemQuantity)).toBe('100');
    expect(String(decreased.body.data.quantityDelta)).toBe('-3');
    expect(String(decreased.body.data.valueDeltaVnd)).toBe('-150000');
    expect(decreased.body.data.createdBy.displayName).toBeTruthy();

    const updatedBalances = await owner.get('/api/v1/stock-balances').expect(200);
    const afterDecrease = (updatedBalances.body.data as BalanceRow[]).find(
      (row) => row.variant.id === adjustmentVariantId,
    )!;
    expect(String(afterDecrease.onHandQuantity)).toBe('97');
    const increaseBody = {
      warehouseId,
      variantId: adjustmentVariantId,
      expectedVersion: afterDecrease.version,
      countedQuantity: '102',
      reason: 'Kiểm kê lại sau đối chiếu',
    };
    const increased = await owner
      .post('/api/v1/stock-adjustments')
      .set('Idempotency-Key', 'stock-adjust-increase-01')
      .send(increaseBody)
      .expect(201);
    expect(String(increased.body.data.quantityDelta)).toBe('5');
    expect(String(increased.body.data.valueDeltaVnd)).toBe('250000');

    const repeated = await owner
      .post('/api/v1/stock-adjustments')
      .set('Idempotency-Key', 'stock-adjust-increase-01')
      .send(increaseBody)
      .expect(201);
    expect(repeated.body.data.id).toBe(increased.body.data.id);
    const reused = await owner
      .post('/api/v1/stock-adjustments')
      .set('Idempotency-Key', 'stock-adjust-increase-01')
      .send({ ...increaseBody, reason: 'Lý do khác' })
      .expect(409);
    expect(reused.body.error.code).toBe('IDEMPOTENCY_KEY_REUSED');
    const stale = await owner
      .post('/api/v1/stock-adjustments')
      .set('Idempotency-Key', `stock-adjust-stale-${randomUUID()}`)
      .send(increaseBody)
      .expect(409);
    expect(stale.body.error.code).toBe('STOCK_VERSION_CONFLICT');

    const finalBalances = await owner.get('/api/v1/stock-balances').expect(200);
    const finalBalance = (finalBalances.body.data as BalanceRow[]).find(
      (row) => row.variant.id === adjustmentVariantId,
    )!;
    expect(String(finalBalance.onHandQuantity)).toBe('102');
    expect(String(finalBalance.averageCostVnd)).toBe('50000');
    expect(await prisma.stockAdjustment.count({ where: { variantId: adjustmentVariantId } })).toBe(
      2,
    );
    expect(
      await prisma.stockMovement.count({
        where: { stockAdjustment: { variantId: adjustmentVariantId } },
      }),
    ).toBe(2);
    expect(await prisma.openingStock.count({ where: { id: created.body.data.id } })).toBe(1);

    const raceBalances = await owner.get('/api/v1/stock-balances').expect(200);
    const raceBalance = (raceBalances.body.data as BalanceRow[]).find(
      (row) => row.variant.id === variantId,
    )!;
    const competingRequests = await Promise.all([
      owner
        .post('/api/v1/stock-adjustments')
        .set('Idempotency-Key', `stock-adjust-race-a-${randomUUID()}`)
        .send({
          warehouseId,
          variantId,
          expectedVersion: raceBalance.version,
          countedQuantity: '9',
          reason: 'Kiểm kê cạnh tranh A',
        }),
      owner
        .post('/api/v1/stock-adjustments')
        .set('Idempotency-Key', `stock-adjust-race-b-${randomUUID()}`)
        .send({
          warehouseId,
          variantId,
          expectedVersion: raceBalance.version,
          countedQuantity: '11',
          reason: 'Kiểm kê cạnh tranh B',
        }),
    ]);
    expect(competingRequests.map(({ status }) => status).sort()).toEqual([201, 409]);
    expect(await prisma.stockAdjustment.count({ where: { variantId } })).toBe(1);
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
    const adjustmentList = await warehouse.get('/api/v1/stock-adjustments').expect(200);
    expect(adjustmentList.body.data[0]).not.toHaveProperty('unitCostVnd');
    expect(adjustmentList.body.data[0]).not.toHaveProperty('valueDeltaVnd');

    const sales = request.agent(app.getHttpServer());
    await sales
      .post('/api/v1/auth/sessions')
      .send({ email: salesEmail, password: 'Opening-test-password-123!' })
      .expect(201);
    const forbidden = await sales.post('/api/v1/stock-openings').send({}).expect(403);
    expect(forbidden.body.error.code).toBe('PERMISSION_DENIED');
    const forbiddenAdjustment = await sales.post('/api/v1/stock-adjustments').send({}).expect(403);
    expect(forbiddenAdjustment.body.error.code).toBe('PERMISSION_DENIED');
  });
});
