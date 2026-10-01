import type { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApplication } from '../src/bootstrap';
import { PrismaService } from '../src/prisma/prisma.service';

const ownerEmail = process.env.SEED_OWNER_EMAIL ?? 'owner@crm.local';
const ownerPassword = process.env.SEED_OWNER_PASSWORD ?? 'Local-test-password-123!';

describe('inventory API phase 04B', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let owner: ReturnType<typeof request.agent>;
  let warehouseId = '';
  let supplierId = '';
  let variantId = '';
  let purchaseOrderId = '';
  let purchaseOrderLineId = '';

  function firstLine(order: { lines: Array<{ id: string }> }) {
    const line = order.lines[0];
    if (!line) throw new Error('Đơn mua E2E phải có một dòng.');
    return line;
  }

  async function cleanup() {
    const variants = await prisma.productVariant.findMany({
      where: { sku: { startsWith: 'E2E-INV-' } },
      select: { id: true, productId: true },
    });
    const variantIds = variants.map(({ id }) => id);
    const orders = await prisma.purchaseOrder.findMany({
      where: { lines: { some: { variantId: { in: variantIds } } } },
      select: { id: true },
    });
    const orderIds = orders.map(({ id }) => id);
    if (variantIds.length) {
      await prisma.stockMovement.deleteMany({ where: { variantId: { in: variantIds } } });
      await prisma.goodsReceiptLine.deleteMany({ where: { variantId: { in: variantIds } } });
      await prisma.stockBalance.deleteMany({ where: { variantId: { in: variantIds } } });
    }
    if (orderIds.length) {
      await prisma.goodsReceipt.deleteMany({ where: { purchaseOrderId: { in: orderIds } } });
      await prisma.purchaseOrderLine.deleteMany({ where: { purchaseOrderId: { in: orderIds } } });
      await prisma.purchaseOrder.deleteMany({ where: { id: { in: orderIds } } });
    }
    if (variantIds.length) {
      await prisma.unitConversion.deleteMany({ where: { variantId: { in: variantIds } } });
      await prisma.productVariant.deleteMany({ where: { id: { in: variantIds } } });
      await prisma.product.deleteMany({
        where: { id: { in: [...new Set(variants.map(({ productId }) => productId))] } },
      });
    }
    await prisma.supplier.deleteMany({ where: { name: { startsWith: 'E2E Inventory Supplier' } } });
    await prisma.staffUser.deleteMany({ where: { emailNormalized: { startsWith: 'inventory-' } } });
  }

  async function createOrderedPurchase(quantity: string) {
    const created = await owner
      .post('/api/v1/purchase-orders')
      .send({
        supplierId,
        lines: [
          {
            variantId,
            unitCode: 'THUNG',
            quantity,
            expectedUnitCostVnd: '120000',
          },
        ],
      })
      .expect(201);
    const ordered = await owner
      .post(`/api/v1/purchase-orders/${created.body.data.id}/order`)
      .send({ version: created.body.data.version })
      .expect(201);
    return ordered.body.data as { id: string; lines: Array<{ id: string }> };
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
        name: 'E2E Inventory Product',
        variants: [
          {
            sku: `E2E-INV-${Date.now()}`,
            name: 'SKU tồn kho E2E',
            baseUnitCode: 'CAI',
            baseUnitName: 'Cái',
            conversions: [{ unitCode: 'THUNG', unitName: 'Thùng', factor: '10' }],
          },
        ],
      })
      .expect(201);
    variantId = product.body.data.variants[0].id;
    const supplier = await owner
      .post('/api/v1/suppliers')
      .send({ name: 'E2E Inventory Supplier chính' })
      .expect(201);
    supplierId = supplier.body.data.id;
    const order = await createOrderedPurchase('3');
    purchaseOrderId = order.id;
    purchaseOrderLineId = firstLine(order).id;
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  it('nhận một phần, quy đổi đơn vị và tính giá vốn bình quân từ dữ liệu thật', async () => {
    const created = await owner
      .post('/api/v1/goods-receipts')
      .set('Idempotency-Key', 'inventory-partial-001')
      .send({
        purchaseOrderId,
        warehouseId,
        lines: [
          {
            purchaseOrderLineId,
            receivedQuantity: '1',
            actualUnitCostVnd: '100000',
          },
        ],
      })
      .expect(201);
    expect(created.body.data.receiptNumber).toMatch(/^GR-/);
    expect(String(created.body.data.lines[0].baseQuantity)).toBe('10');
    expect(String(created.body.data.lines[0].lineValueVnd)).toBe('100000');

    const order = await owner.get(`/api/v1/purchase-orders/${purchaseOrderId}`).expect(200);
    expect(order.body.data.status).toBe('PARTIALLY_RECEIVED');
    expect(String(order.body.data.lines[0].remainingQuantity)).toBe('2');

    const balances = await owner.get('/api/v1/stock-balances').expect(200);
    const balanceRows = balances.body.data as Array<{
      onHandQuantity: string;
      availableQuantity: string;
      averageCostVnd: string;
      variant: { id: string };
    }>;
    const balance = balanceRows.find(
      (item: { variant: { id: string } }) => item.variant.id === variantId,
    );
    expect(String(balance?.onHandQuantity)).toBe('10');
    expect(String(balance?.availableQuantity)).toBe('10');
    expect(String(balance?.averageCostVnd)).toBe('10000');
  });

  it('gửi lại cùng Idempotency-Key trả cùng phiếu và không ghi kho lần hai', async () => {
    const body = {
      purchaseOrderId,
      warehouseId,
      lines: [{ purchaseOrderLineId, receivedQuantity: '1', actualUnitCostVnd: '100000' }],
    };
    const first = await owner
      .post('/api/v1/goods-receipts')
      .set('Idempotency-Key', 'inventory-partial-001')
      .send(body)
      .expect(201);
    const second = await owner
      .post('/api/v1/goods-receipts')
      .set('Idempotency-Key', 'inventory-partial-001')
      .send(body)
      .expect(201);
    expect(second.body.data.id).toBe(first.body.data.id);
    expect(await prisma.stockMovement.count({ where: { variantId } })).toBe(1);

    const reused = await owner
      .post('/api/v1/goods-receipts')
      .set('Idempotency-Key', 'inventory-partial-001')
      .send({
        ...body,
        lines: [{ purchaseOrderLineId, receivedQuantity: '2', actualUnitCostVnd: '100000' }],
      })
      .expect(409);
    expect(reused.body.error.code).toBe('IDEMPOTENCY_KEY_REUSED');
  });

  it('nhận phần còn lại và cập nhật bình quân gia quyền chính xác', async () => {
    await owner
      .post('/api/v1/goods-receipts')
      .set('Idempotency-Key', 'inventory-complete-001')
      .send({
        purchaseOrderId,
        warehouseId,
        lines: [
          {
            purchaseOrderLineId,
            receivedQuantity: '2',
            actualUnitCostVnd: '150000',
          },
        ],
      })
      .expect(201);
    const order = await owner.get(`/api/v1/purchase-orders/${purchaseOrderId}`).expect(200);
    expect(order.body.data.status).toBe('RECEIVED');
    expect(String(order.body.data.lines[0].remainingQuantity)).toBe('0');
    const balances = await owner.get('/api/v1/stock-balances').expect(200);
    const balanceRows = balances.body.data as Array<{
      onHandQuantity: string;
      averageCostVnd: string;
      variant: { id: string };
    }>;
    const balance = balanceRows.find(
      (item: { variant: { id: string } }) => item.variant.id === variantId,
    );
    expect(String(balance?.onHandQuantity)).toBe('30');
    expect(String(balance?.averageCostVnd)).toBe('13333.333333');
  });

  it('chặn nhận vượt và cạnh tranh không thể tạo hai lần tồn', async () => {
    const overOrder = await createOrderedPurchase('1');
    const exceeded = await owner
      .post('/api/v1/goods-receipts')
      .set('Idempotency-Key', 'inventory-over-001')
      .send({
        purchaseOrderId: overOrder.id,
        warehouseId,
        lines: [
          {
            purchaseOrderLineId: firstLine(overOrder).id,
            receivedQuantity: '2',
            actualUnitCostVnd: '100000',
          },
        ],
      })
      .expect(422);
    expect(exceeded.body.error.code).toBe('PURCHASE_QUANTITY_EXCEEDED');

    const concurrentOrder = await createOrderedPurchase('1');
    const payload = {
      purchaseOrderId: concurrentOrder.id,
      warehouseId,
      lines: [
        {
          purchaseOrderLineId: firstLine(concurrentOrder).id,
          receivedQuantity: '1',
          actualUnitCostVnd: '100000',
        },
      ],
    };
    const responses = await Promise.all([
      owner
        .post('/api/v1/goods-receipts')
        .set('Idempotency-Key', `inventory-race-a-${randomUUID()}`)
        .send(payload),
      owner
        .post('/api/v1/goods-receipts')
        .set('Idempotency-Key', `inventory-race-b-${randomUUID()}`)
        .send(payload),
    ]);
    expect(responses.map(({ status }) => status).sort()).toEqual([201, 409]);
    expect(
      await prisma.goodsReceipt.count({ where: { purchaseOrderId: concurrentOrder.id } }),
    ).toBe(1);
  });

  it('nhân viên kho nhận được hàng nhưng không thấy giá vốn; sales bị từ chối', async () => {
    const timestamp = Date.now();
    const warehouseEmail = `inventory-warehouse-${timestamp}@crm.local`;
    const salesEmail = `inventory-sales-${timestamp}@crm.local`;
    for (const [email, roleCodes] of [
      [warehouseEmail, ['warehouse']],
      [salesEmail, ['sales']],
    ] as const) {
      await owner
        .post('/api/v1/staff')
        .send({
          email,
          displayName: `E2E ${roleCodes[0]}`,
          password: 'Inventory-test-password-123!',
          roleCodes,
        })
        .expect(201);
    }
    const warehouse = request.agent(app.getHttpServer());
    await warehouse
      .post('/api/v1/auth/sessions')
      .send({ email: warehouseEmail, password: 'Inventory-test-password-123!' })
      .expect(201);
    const balances = await warehouse.get('/api/v1/stock-balances').expect(200);
    expect(balances.body.data[0]).not.toHaveProperty('averageCostVnd');
    const receipts = await warehouse.get('/api/v1/goods-receipts').expect(200);
    expect(receipts.body.data[0].lines[0]).not.toHaveProperty('actualUnitCostVnd');
    expect(receipts.body.data[0].lines[0]).not.toHaveProperty('lineValueVnd');
    const orders = await warehouse.get('/api/v1/purchase-orders').expect(200);
    expect(orders.body.data[0].lines[0]).not.toHaveProperty('expectedUnitCostVnd');

    const sales = request.agent(app.getHttpServer());
    await sales
      .post('/api/v1/auth/sessions')
      .send({ email: salesEmail, password: 'Inventory-test-password-123!' })
      .expect(201);
    const forbidden = await sales.get('/api/v1/stock-balances').expect(403);
    expect(forbidden.body.error.code).toBe('PERMISSION_DENIED');
  });
});
