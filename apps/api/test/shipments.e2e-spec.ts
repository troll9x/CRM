import type { INestApplication } from '@nestjs/common';
import { execFileSync } from 'node:child_process';
import { existsSync, unlinkSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApplication } from '../src/bootstrap';
import { PrismaService } from '../src/prisma/prisma.service';

const ownerEmail = process.env.SEED_OWNER_EMAIL ?? 'owner@crm.local';
const ownerPassword = process.env.SEED_OWNER_PASSWORD ?? 'Local-test-password-123!';

function verifyBackupOfShipmentFixture() {
  const sourceContainer = process.env.BACKUP_VERIFY_SOURCE_CONTAINER;
  if (!sourceContainer) return;
  if (process.platform !== 'win32') {
    throw new Error('Optional backup fixture verification currently requires Windows PowerShell.');
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('Set DATABASE_URL explicitly to the isolated E2E database.');
  const parsedDatabaseUrl = new URL(databaseUrl);
  const databaseName = process.env.BACKUP_VERIFY_DATABASE ?? 'crm_test';
  const databaseUser = process.env.BACKUP_VERIFY_DATABASE_USER ?? 'crm_test';
  if (!['localhost', '127.0.0.1', '[::1]', '::1'].includes(parsedDatabaseUrl.hostname)) {
    throw new Error('Optional backup verification requires a local-only E2E database host.');
  }
  if (decodeURIComponent(parsedDatabaseUrl.pathname.slice(1)) !== databaseName) {
    throw new Error(
      'Backup source database must match the isolated E2E DATABASE_URL database name.',
    );
  }
  if (decodeURIComponent(parsedDatabaseUrl.username) !== databaseUser) {
    throw new Error('Backup source user must match the isolated E2E DATABASE_URL user.');
  }
  const dockerPorts = execFileSync('docker', ['port', sourceContainer, '5432/tcp'], {
    encoding: 'utf8',
    stdio: 'pipe',
  });
  const mappedPorts = [...dockerPorts.matchAll(/:(\d+)\s*$/gm)].map((match) => match[1]);
  if (!parsedDatabaseUrl.port || !mappedPorts.includes(parsedDatabaseUrl.port)) {
    throw new Error(
      'BACKUP_VERIFY_SOURCE_CONTAINER port must match the explicit E2E DATABASE_URL.',
    );
  }

  const backupPath = join(tmpdir(), `crm-backup-fixture-${randomUUID()}.dump`);
  const scriptPath = resolve(process.cwd(), '../../scripts/backup-and-verify.ps1');
  try {
    const output = execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-File',
        scriptPath,
        '-SourceContainer',
        sourceContainer,
        '-DatabaseName',
        databaseName,
        '-DatabaseUser',
        databaseUser,
        '-BackupPath',
        backupPath,
      ],
      { encoding: 'utf8', stdio: 'pipe' },
    );
    expect(output).toContain('Backup created and restored in a fresh scratch container.');
    expect(output).toContain('sales_orders:1');
    expect(output).toContain('shipments:1');
    expect(output).toContain('receivables:1');
    expect(output).toContain('receivable_settlements:1');
    expect(output).toContain('payment_receipts:1');
    expect(output).toContain('stock_balances:1');
    expect(output).toContain('stock_movements:2');
    expect(output).toContain('return_requests:1');
    expect(output).toContain('return_inspections:1');
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error);
    throw new Error(`Backup fixture verification failed: ${details}`);
  } finally {
    if (existsSync(backupPath)) unlinkSync(backupPath);
  }
}

describe('shipments API', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let owner: ReturnType<typeof request.agent>;
  let sales: ReturnType<typeof request.agent>;
  let warehouseStaff: ReturnType<typeof request.agent>;
  const suffix = randomUUID().slice(0, 8).toUpperCase();
  const productName = `E2E Shipment ${suffix}`;
  const sku = `E2E-SHIP-${suffix}`;
  let customerId = '';
  let variantId = '';
  let orderId = '';
  let returnRequestId = '';
  let originalReturnPolicy: { returnWindowDays: number | null; policyVersion: number } | undefined;

  async function cleanup() {
    if (returnRequestId) {
      const returnLines = await prisma.returnLine.findMany({
        where: { requestId: returnRequestId },
        select: { id: true },
      });
      const returnLineIds = returnLines.map(({ id }) => id);
      await prisma.stockMovement.deleteMany({ where: { returnLineId: { in: returnLineIds } } });
      await prisma.returnInspection.deleteMany({ where: { requestId: returnRequestId } });
      await prisma.returnLine.deleteMany({ where: { requestId: returnRequestId } });
      await prisma.returnRequest.delete({ where: { id: returnRequestId } });
    }
    if (orderId) {
      const shipment = await prisma.shipment.findUnique({
        where: { orderId },
        select: { id: true, lines: { select: { id: true } } },
      });
      if (shipment) {
        const lineIds = shipment.lines.map((line) => line.id);
        await prisma.stockMovement.deleteMany({ where: { shipmentLineId: { in: lineIds } } });
        await prisma.shipmentLine.deleteMany({ where: { shipmentId: shipment.id } });
        await prisma.shipment.delete({ where: { id: shipment.id } });
      }
    }
    if (orderId) {
      const receivable = await prisma.receivable.findUnique({
        where: { orderId },
        select: { id: true },
      });
      if (receivable) {
        await prisma.receivableSettlement.deleteMany({ where: { receivableId: receivable.id } });
        await prisma.receivable.delete({ where: { id: receivable.id } });
      }
      await prisma.stockReservationEvent.deleteMany({ where: { orderId } });
      await prisma.adminAlert.deleteMany({ where: { orderId } });
      await prisma.paymentAllocation.deleteMany({ where: { orderId } });
      await prisma.salesOrderLine.deleteMany({ where: { orderId } });
      await prisma.salesOrder.delete({ where: { id: orderId } });
    }
    if (customerId) {
      const payments = await prisma.paymentReceipt.findMany({
        where: { customerId },
        select: { id: true },
      });
      const paymentIds = payments.map(({ id }) => id);
      if (paymentIds.length) {
        await prisma.customerCreditEvent.deleteMany({ where: { paymentId: { in: paymentIds } } });
        await prisma.paymentReceipt.deleteMany({ where: { id: { in: paymentIds } } });
      }
      await prisma.customerCreditBalance.deleteMany({ where: { customerId } });
      await prisma.customerTask.deleteMany({ where: { customerId } });
      await prisma.salesOpportunity.deleteMany({ where: { customerId } });
      await prisma.address.deleteMany({ where: { customerId } });
      await prisma.contactPoint.deleteMany({ where: { customerId } });
      await prisma.customer.delete({ where: { id: customerId } });
    }
    await prisma.orderCommand.deleteMany({ where: { idempotencyKey: { contains: suffix } } });
    await prisma.returnCommand.deleteMany({ where: { idempotencyKey: { contains: suffix } } });
    if (originalReturnPolicy) {
      await prisma.business.update({
        where: { id: 'business_local_default' },
        data: originalReturnPolicy,
      });
    }
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
    originalReturnPolicy = await prisma.business.findUniqueOrThrow({
      where: { id: 'business_local_default' },
      select: { returnWindowDays: true, policyVersion: true },
    });
    owner = request.agent(app.getHttpServer());
    await owner
      .post('/api/v1/auth/sessions')
      .send({ email: ownerEmail, password: ownerPassword })
      .expect(201);
    const customer = await owner
      .post('/api/v1/customers')
      .send({ displayName: productName, groupCode: 'retail', source: 'E2E shipment' })
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
      .set('Idempotency-Key', `ship-e2e-${suffix}-price`)
      .send({ variantId, quantityFrom: 1, expectedVersion: 0, priceVnd: '5000' })
      .expect(200);
    const salesEmail = `shipment-sales-${suffix}@crm.local`;
    await owner
      .post('/api/v1/staff')
      .send({
        email: salesEmail,
        displayName: 'E2E Sales',
        password: 'Sales-test-password-123!',
        roleCodes: ['sales'],
      })
      .expect(201);
    sales = request.agent(app.getHttpServer());
    await sales
      .post('/api/v1/auth/sessions')
      .send({ email: salesEmail, password: 'Sales-test-password-123!' })
      .expect(201);
    const warehouseEmail = `shipment-warehouse-${suffix}@crm.local`;
    await owner
      .post('/api/v1/staff')
      .send({
        email: warehouseEmail,
        displayName: 'E2E Warehouse',
        password: 'Warehouse-test-password-123!',
        roleCodes: ['warehouse'],
      })
      .expect(201);
    warehouseStaff = request.agent(app.getHttpServer());
    await warehouseStaff
      .post('/api/v1/auth/sessions')
      .send({ email: warehouseEmail, password: 'Warehouse-test-password-123!' })
      .expect(201);
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  it('exports all held stock once and recognizes revenue only when fully delivered', async () => {
    const order = await owner
      .post('/api/v1/orders')
      .set('Idempotency-Key', `ship-e2e-${suffix}-order`)
      .send({ customerId, lines: [{ variantId, quantity: '2' }] })
      .expect(201);
    orderId = order.body.data.id as string;

    await owner
      .post('/api/v1/payments')
      .set('Idempotency-Key', `ship-e2e-${suffix}-payment`)
      .send({
        customerId,
        amountVnd: '10000',
        allocations: [{ orderId, amountVnd: '10000' }],
      })
      .expect(201);
    const confirmed = await owner
      .post(`/api/v1/orders/${orderId}/confirm`)
      .set('Idempotency-Key', `ship-e2e-${suffix}-confirm`)
      .send({ expectedVersion: 2 })
      .expect(201);
    expect(confirmed.body.data).toMatchObject({ status: 'CONFIRMED', version: 3 });
    await sales.get('/api/v1/shipments/ready-orders').expect(403);
    const readyOrders = await warehouseStaff.get('/api/v1/shipments/ready-orders').expect(200);
    expect(readyOrders.body.data.items).toContainEqual(
      expect.objectContaining({ id: orderId, orderNumber: confirmed.body.data.orderNumber }),
    );

    await sales
      .post('/api/v1/shipments')
      .set('Idempotency-Key', `ship-e2e-${suffix}-denied`)
      .send({ orderId, expectedVersion: 3 })
      .expect(403);

    await warehouseStaff
      .post('/api/v1/shipments')
      .set('Idempotency-Key', `ship-e2e-${suffix}-partial`)
      .send({ orderId, expectedVersion: 3, quantity: '1' })
      .expect(400);

    const keys = [`ship-e2e-${suffix}-create-a`, `ship-e2e-${suffix}-create-b`];
    const attempts = await Promise.all(
      keys.map((key) =>
        warehouseStaff
          .post('/api/v1/shipments')
          .set('Idempotency-Key', key)
          .send({ orderId, expectedVersion: 3 }),
      ),
    );
    expect(attempts.map((response) => response.status).sort()).toEqual([201, 409]);
    const acceptedIndex = attempts.findIndex((response) => response.status === 201);
    const key = keys[acceptedIndex]!;
    const shipment = attempts[acceptedIndex]!;
    expect(shipment.status, JSON.stringify(shipment.body)).toBe(201);
    expect(shipment.body.data).toMatchObject({ status: 'IN_TRANSIT', recognizedRevenueVnd: '0' });
    expect(shipment.body.data.lines).toHaveLength(1);
    expect(shipment.body.data.lines[0]).toMatchObject({
      skuSnapshot: sku,
      quantity: '2',
      baseQuantity: '2',
    });
    const inTransit = await warehouseStaff.get('/api/v1/shipments?status=IN_TRANSIT').expect(200);
    expect(inTransit.body.data.items).toContainEqual(
      expect.objectContaining({
        id: shipment.body.data.id,
        orderNumber: confirmed.body.data.orderNumber,
      }),
    );
    await sales.get('/api/v1/shipments?status=IN_TRANSIT').expect(403);
    const readyAfterExport = await warehouseStaff.get('/api/v1/shipments/ready-orders').expect(200);
    expect(readyAfterExport.body.data.items).not.toContainEqual(
      expect.objectContaining({ id: orderId }),
    );
    const replay = await warehouseStaff
      .post('/api/v1/shipments')
      .set('Idempotency-Key', key)
      .send({ orderId, expectedVersion: 3 })
      .expect(201);
    expect(replay.body.data.id).toBe(shipment.body.data.id);
    await warehouseStaff
      .post('/api/v1/shipments')
      .set('Idempotency-Key', `ship-e2e-${suffix}-second`)
      .send({ orderId, expectedVersion: 3 })
      .expect(409)
      .then((response) => expect(response.body.error.code).toBe('ORDER_ALREADY_SHIPPED'));

    const balanceAfterShipment = await prisma.stockBalance.findUniqueOrThrow({
      where: {
        businessId_warehouseId_variantId: {
          businessId: 'business_local_default',
          warehouseId: shipment.body.data.warehouseId,
          variantId,
        },
      },
    });
    expect(balanceAfterShipment.onHandQuantity.toString()).toBe('8');
    expect(balanceAfterShipment.reservedQuantity.toString()).toBe('0');
    const movement = await prisma.stockMovement.findFirstOrThrow({
      where: { shipmentLine: { shipmentId: shipment.body.data.id } },
    });
    expect(movement.type).toBe('SALE_SHIPMENT');
    expect(movement.quantityDelta.toString()).toBe('-2');
    expect(movement.valueDeltaVnd.toString()).toBe('-2000');

    const delivered = await warehouseStaff
      .post(`/api/v1/shipments/${shipment.body.data.id}/deliver`)
      .set('Idempotency-Key', `ship-e2e-${suffix}-deliver`)
      .send({ expectedVersion: 1 })
      .expect(201);
    expect(delivered.body.data).toMatchObject({
      status: 'DELIVERED',
      version: 2,
      recognizedRevenueVnd: '10000',
    });
    const deliveryReplay = await warehouseStaff
      .post(`/api/v1/shipments/${shipment.body.data.id}/deliver`)
      .set('Idempotency-Key', `ship-e2e-${suffix}-deliver`)
      .send({ expectedVersion: 1 })
      .expect(201);
    expect(deliveryReplay.body.data).toMatchObject({
      status: 'DELIVERED',
      recognizedRevenueVnd: '10000',
    });
    const stored = await prisma.shipment.findUniqueOrThrow({
      where: { id: shipment.body.data.id },
    });
    expect(stored.deliveredAt).toBeInstanceOf(Date);
    const salesReport = await owner.get('/api/v1/reports/sales').expect(200);
    expect(salesReport.body.data).toMatchObject({
      revenueBasis: 'DELIVERED_GOODS_GROSS_BEFORE_RETURNS',
      quantityBasis: 'DELIVERED_BASE_UNIT_QUANTITY',
    });
    expect(salesReport.body.data.monthlyRevenue).toContainEqual(
      expect.objectContaining({ revenueVnd: '10000' }),
    );
    expect(salesReport.body.data.topProducts).toContainEqual(
      expect.objectContaining({ sku, deliveredBaseQuantity: '2' }),
    );
    await sales.get('/api/v1/reports/sales').expect(403);
    await owner.get('/api/v1/reports/sales?from=2026-13-40').expect(422);

    const policy = await owner.get('/api/v1/business-policy/return-window').expect(200);
    const missingPolicy = await owner
      .post('/api/v1/returns')
      .set('Idempotency-Key', `ship-e2e-${suffix}-return-no-policy`)
      .send({
        shipmentId: shipment.body.data.id,
        lines: [{ shipmentLineId: shipment.body.data.lines[0].id, quantity: '1' }],
      })
      .expect(409);
    expect(missingPolicy.body.error.code).toBe('RETURN_POLICY_NOT_CONFIGURED');
    await owner
      .patch('/api/v1/business-policy/return-window')
      .send({ days: 7, expectedVersion: policy.body.data.version })
      .expect(200);
    const overReturn = await owner
      .post('/api/v1/returns')
      .set('Idempotency-Key', `ship-e2e-${suffix}-return-too-many`)
      .send({
        shipmentId: shipment.body.data.id,
        lines: [{ shipmentLineId: shipment.body.data.lines[0].id, quantity: '3' }],
      })
      .expect(409);
    expect(overReturn.body.error.code).toBe('RETURN_QUANTITY_EXCEEDED');
    const received = await owner
      .post('/api/v1/returns')
      .set('Idempotency-Key', `ship-e2e-${suffix}-return`)
      .send({
        shipmentId: shipment.body.data.id,
        lines: [{ shipmentLineId: shipment.body.data.lines[0].id, quantity: '1' }],
      })
      .expect(201);
    returnRequestId = received.body.data.id as string;
    expect(received.body.data).toMatchObject({
      status: 'RECEIVED',
      policyDays: 7,
      lines: [{ quantity: '1', baseQuantity: '1' }],
    });
    const repeatedReturn = await owner
      .post('/api/v1/returns')
      .set('Idempotency-Key', `ship-e2e-${suffix}-return`)
      .send({
        shipmentId: shipment.body.data.id,
        lines: [{ shipmentLineId: shipment.body.data.lines[0].id, quantity: '1' }],
      })
      .expect(201);
    expect(repeatedReturn.body.data.id).toBe(returnRequestId);
    await sales
      .post(`/api/v1/returns/${returnRequestId}/inspect`)
      .set('Idempotency-Key', `ship-e2e-${suffix}-inspect-denied`)
      .send({
        expectedVersion: 1,
        lines: [
          {
            returnLineId: received.body.data.lines[0].id,
            saleableQuantity: '1',
            quarantineQuantity: '0',
          },
        ],
      })
      .expect(403);
    const inspected = await owner
      .post(`/api/v1/returns/${returnRequestId}/inspect`)
      .set('Idempotency-Key', `ship-e2e-${suffix}-inspect`)
      .send({
        expectedVersion: 1,
        lines: [
          {
            returnLineId: received.body.data.lines[0].id,
            saleableQuantity: '0.5',
            quarantineQuantity: '0.5',
          },
        ],
      })
      .expect(201);
    expect(inspected.body.data).toMatchObject({
      status: 'INSPECTED',
      version: 2,
      lines: [{ saleableQuantity: '0.5', quarantineQuantity: '0.5' }],
    });
    const returnedBalance = await prisma.stockBalance.findUniqueOrThrow({
      where: {
        businessId_warehouseId_variantId: {
          businessId: 'business_local_default',
          warehouseId: shipment.body.data.warehouseId,
          variantId,
        },
      },
    });
    expect(returnedBalance.onHandQuantity.toString()).toBe('9');
    expect(returnedBalance.unavailableQuantity.toString()).toBe('0.5');
    const returnMovement = await prisma.stockMovement.findUniqueOrThrow({
      where: { returnLineId: received.body.data.lines[0].id },
    });
    expect(returnMovement.type).toBe('CUSTOMER_RETURN');
    expect(returnMovement.quantityDelta.toString()).toBe('1');
    verifyBackupOfShipmentFixture();
  });
});
