import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApplication } from '../src/bootstrap';
import { PrismaService } from '../src/prisma/prisma.service';

const ownerEmail = process.env.SEED_OWNER_EMAIL ?? 'owner@crm.local';
const ownerPassword = process.env.SEED_OWNER_PASSWORD ?? 'Local-test-password-123!';

describe('purchasing API phase 04A', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let owner: ReturnType<typeof request.agent>;
  let supplierId = '';
  let variantId = '';
  let purchaseOrderId = '';
  let purchaseOrderVersion = 1;

  async function cleanup() {
    const orders = await prisma.purchaseOrder.findMany({
      where: { orderNumber: { startsWith: 'PO-' }, lines: { some: { skuSnapshot: 'E2E-PO-SKU' } } },
      select: { id: true },
    });
    if (orders.length) {
      await prisma.purchaseOrderLine.deleteMany({
        where: { purchaseOrderId: { in: orders.map(({ id }) => id) } },
      });
      await prisma.purchaseOrder.deleteMany({ where: { id: { in: orders.map(({ id }) => id) } } });
    }
    await prisma.supplier.deleteMany({ where: { name: { startsWith: 'E2E Supplier' } } });
    const products = await prisma.product.findMany({
      where: { name: 'E2E Purchasing Product' },
      select: { id: true },
    });
    if (products.length) {
      await prisma.productVariant.deleteMany({
        where: { productId: { in: products.map(({ id }) => id) } },
      });
      await prisma.product.deleteMany({ where: { id: { in: products.map(({ id }) => id) } } });
    }
    await prisma.staffUser.deleteMany({
      where: { emailNormalized: { startsWith: 'purchasing-' } },
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

    const product = await owner
      .post('/api/v1/products')
      .send({
        name: 'E2E Purchasing Product',
        variants: [
          {
            sku: 'E2E-PO-SKU',
            name: 'SKU mua hàng E2E',
            baseUnitCode: 'CAI',
            baseUnitName: 'Cái',
            conversions: [{ unitCode: 'THUNG', unitName: 'Thùng', factor: '12' }],
          },
        ],
      })
      .expect(201);
    variantId = product.body.data.variants[0].id;
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  it('tạo nhà cung cấp và tìm theo mã', async () => {
    const created = await owner
      .post('/api/v1/suppliers')
      .send({
        name: 'E2E Supplier Chính',
        contactName: 'Người liên hệ',
        phone: '0900000001',
        email: 'SUPPLIER-E2E@EXAMPLE.COM',
      })
      .expect(201);
    supplierId = created.body.data.id;
    expect(created.body.data.supplierCode).toMatch(/^SUP-/);
    expect(created.body.data.email).toBe('supplier-e2e@example.com');

    const list = await owner
      .get(`/api/v1/suppliers?query=${created.body.data.supplierCode}`)
      .expect(200);
    expect(list.body.data[0].id).toBe(supplierId);
  });

  it('tạo đơn mua và snapshot 2 thùng thành 24 cái mà không tăng tồn', async () => {
    const before = await prisma.productVariant.findUniqueOrThrow({
      where: { id: variantId },
      select: { version: true, updatedAt: true },
    });
    const created = await owner
      .post('/api/v1/purchase-orders')
      .send({
        supplierId,
        notes: 'Đơn mua E2E không nhập kho',
        lines: [
          {
            variantId,
            unitCode: 'THUNG',
            quantity: '2',
            expectedUnitCostVnd: '600000',
          },
        ],
      })
      .expect(201);
    purchaseOrderId = created.body.data.id;
    purchaseOrderVersion = created.body.data.version;
    expect(created.body.data.status).toBe('DRAFT');
    expect(String(created.body.data.lines[0].conversionFactorSnapshot)).toBe('12');
    expect(String(created.body.data.lines[0].baseQuantity)).toBe('24');

    const after = await prisma.productVariant.findUniqueOrThrow({
      where: { id: variantId },
      select: { version: true, updatedAt: true },
    });
    expect(after).toEqual(before);

    const lockedConversion = await owner
      .put(`/api/v1/variants/${variantId}/unit-conversions`)
      .send({
        version: before.version,
        conversions: [{ unitCode: 'THUNG', unitName: 'Thùng', factor: '20' }],
      })
      .expect(409);
    expect(lockedConversion.body.error.code).toBe('UNIT_CONVERSION_IN_USE');
  });

  it('phát hành đơn mua vẫn không tăng tồn và khóa sửa dòng', async () => {
    const ordered = await owner
      .post(`/api/v1/purchase-orders/${purchaseOrderId}/order`)
      .send({ version: purchaseOrderVersion })
      .expect(201);
    purchaseOrderVersion = ordered.body.data.version;
    expect(ordered.body.data.status).toBe('ORDERED');

    const blocked = await owner
      .patch(`/api/v1/purchase-orders/${purchaseOrderId}`)
      .send({ version: purchaseOrderVersion, notes: 'Không được sửa' })
      .expect(409);
    expect(blocked.body.error.code).toBe('PURCHASE_ORDER_NOT_EDITABLE');

    const movements = await prisma.auditLog.count({
      where: {
        entityId: purchaseOrderId,
        action: { startsWith: 'inventory.' },
      },
    });
    expect(movements).toBe(0);
  });

  it('từ chối đơn vị không thuộc SKU', async () => {
    const invalid = await owner
      .post('/api/v1/purchase-orders')
      .send({
        supplierId,
        lines: [{ variantId, unitCode: 'PALLET', quantity: '1' }],
      })
      .expect(422);
    expect(invalid.body.error.code).toBe('UNIT_NOT_AVAILABLE_FOR_VARIANT');
  });

  it('role kho thao tác mua hàng, role sales bị backend từ chối', async () => {
    const timestamp = Date.now();
    const warehouseEmail = `purchasing-warehouse-${timestamp}@crm.local`;
    const salesEmail = `purchasing-sales-${timestamp}@crm.local`;
    for (const [email, roleCodes] of [
      [warehouseEmail, ['warehouse']],
      [salesEmail, ['sales']],
    ] as const) {
      await owner
        .post('/api/v1/staff')
        .send({
          email,
          displayName: `E2E ${roleCodes[0]}`,
          password: 'Purchasing-test-password-123!',
          roleCodes,
        })
        .expect(201);
    }

    const warehouse = request.agent(app.getHttpServer());
    await warehouse
      .post('/api/v1/auth/sessions')
      .send({ email: warehouseEmail, password: 'Purchasing-test-password-123!' })
      .expect(201);
    await warehouse.get('/api/v1/purchase-orders').expect(200);
    await warehouse.post('/api/v1/suppliers').send({ name: 'E2E Supplier Warehouse' }).expect(201);

    const sales = request.agent(app.getHttpServer());
    await sales
      .post('/api/v1/auth/sessions')
      .send({ email: salesEmail, password: 'Purchasing-test-password-123!' })
      .expect(201);
    const forbidden = await sales.get('/api/v1/suppliers').expect(403);
    expect(forbidden.body.error.code).toBe('PERMISSION_DENIED');
  });
});
