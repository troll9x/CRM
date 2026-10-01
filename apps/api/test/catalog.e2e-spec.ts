import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApplication } from '../src/bootstrap';
import { PrismaService } from '../src/prisma/prisma.service';

const ownerEmail = process.env.SEED_OWNER_EMAIL ?? 'owner@crm.local';
const ownerPassword = process.env.SEED_OWNER_PASSWORD ?? 'Local-test-password-123!';

describe('catalog API', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let owner: ReturnType<typeof request.agent>;
  let productId = '';
  let variantId = '';
  let variantVersion = 1;

  async function cleanup() {
    const products = await prisma.product.findMany({
      where: { name: { startsWith: 'E2E Catalog' } },
      select: { id: true },
    });
    const ids = products.map(({ id }) => id);
    if (ids.length) {
      await prisma.mediaAsset.deleteMany({ where: { productId: { in: ids } } });
      await prisma.productVariant.deleteMany({ where: { productId: { in: ids } } });
      await prisma.product.deleteMany({ where: { id: { in: ids } } });
    }
    await prisma.staffUser.deleteMany({
      where: { emailNormalized: { startsWith: 'catalog-warehouse-e2e-' } },
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
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  it('tạo sản phẩm, SKU duy nhất và quy đổi cái/hộp/thùng', async () => {
    const response = await owner
      .post('/api/v1/products')
      .send({
        name: 'E2E Catalog Nước giặt',
        category: 'Gia dụng',
        brand: 'Sơn Test',
        variants: [
          {
            sku: 'e2e-ng-1l',
            name: 'Chai 1 lít',
            barcode: '8930000000001',
            baseUnitCode: 'cai',
            baseUnitName: 'Cái',
            attributes: { dungTich: '1L' },
            conversions: [
              { unitCode: 'hop', unitName: 'Hộp', factor: '6' },
              { unitCode: 'thung', unitName: 'Thùng', factor: '24' },
            ],
          },
        ],
      })
      .expect(201);
    productId = response.body.data.id;
    variantId = response.body.data.variants[0].id;
    variantVersion = response.body.data.variants[0].version;
    expect(response.body.data.variants[0].sku).toBe('E2E-NG-1L');
    expect(String(response.body.data.variants[0].conversions[1].factor)).toBe('24');

    const search = await owner.get('/api/v1/products?query=E2E-NG-1L').expect(200);
    expect(search.body.data.items[0].id).toBe(productId);
  });

  it('từ chối SKU trùng trong cùng business', async () => {
    const duplicate = await owner
      .post('/api/v1/products')
      .send({
        name: 'E2E Catalog Sản phẩm trùng',
        variants: [
          {
            sku: 'E2E-NG-1L',
            name: 'Trùng SKU',
            baseUnitCode: 'CAI',
            baseUnitName: 'Cái',
          },
        ],
      })
      .expect(409);
    expect(duplicate.body.error.code).toBe('SKU_ALREADY_EXISTS');
  });

  it('kiểm tra hệ số quy đổi và dùng version khi thay danh sách', async () => {
    const invalid = await owner
      .put(`/api/v1/variants/${variantId}/unit-conversions`)
      .send({
        version: variantVersion,
        conversions: [{ unitCode: 'CAI', unitName: 'Cái', factor: '1' }],
      })
      .expect(422);
    expect(invalid.body.error.code).toBe('BASE_UNIT_CONVERSION_FORBIDDEN');

    const updated = await owner
      .put(`/api/v1/variants/${variantId}/unit-conversions`)
      .send({
        version: variantVersion,
        conversions: [{ unitCode: 'THUNG', unitName: 'Thùng', factor: '30' }],
      })
      .expect(200);
    variantVersion = updated.body.data.variants[0].version;
    expect(String(updated.body.data.variants[0].conversions[0].factor)).toBe('30');
  });

  it('lưu metadata ảnh và ngừng bán SKU thay vì xóa', async () => {
    const media = await owner
      .post(`/api/v1/products/${productId}/media`)
      .send({
        variantId,
        url: 'https://example.com/e2e-product.jpg',
        altText: 'Ảnh kiểm thử sản phẩm',
      })
      .expect(201);
    expect(media.body.data.media[0].url).toContain('https://');

    const stopped = await owner
      .patch(`/api/v1/variants/${variantId}`)
      .send({ version: variantVersion, status: 'INACTIVE' })
      .expect(200);
    expect(stopped.body.data.variants[0].status).toBe('INACTIVE');
  });

  it('role kho chỉ đọc catalog, không tạo sản phẩm', async () => {
    const email = `catalog-warehouse-e2e-${Date.now()}@crm.local`;
    await owner
      .post('/api/v1/staff')
      .send({
        email,
        displayName: 'Kho Catalog E2E',
        password: 'Warehouse-test-password-123!',
        roleCodes: ['warehouse'],
      })
      .expect(201);
    const warehouse = request.agent(app.getHttpServer());
    await warehouse
      .post('/api/v1/auth/sessions')
      .send({ email, password: 'Warehouse-test-password-123!' })
      .expect(201);
    await warehouse.get('/api/v1/products').expect(200);
    const forbidden = await warehouse
      .post('/api/v1/products')
      .send({ name: 'Không được tạo', variants: [] })
      .expect(403);
    expect(forbidden.body.error.code).toBe('PERMISSION_DENIED');
  });
});
