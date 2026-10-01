import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApplication } from '../src/bootstrap';
import { PrismaService } from '../src/prisma/prisma.service';

const ownerEmail = process.env.SEED_OWNER_EMAIL ?? 'owner@crm.local';
const ownerPassword = process.env.SEED_OWNER_PASSWORD ?? 'Local-test-password-123!';

describe('customer CRM API', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let owner: ReturnType<typeof request.agent>;
  let firstCustomerId = '';
  let firstCustomerVersion = 1;

  async function cleanup() {
    const customers = await prisma.customer.findMany({
      where: { source: 'E2E' },
      select: { id: true },
    });
    const ids = customers.map(({ id }) => id);
    if (ids.length) {
      await prisma.salesOpportunity.deleteMany({ where: { customerId: { in: ids } } });
      await prisma.customerTask.deleteMany({ where: { customerId: { in: ids } } });
      await prisma.address.deleteMany({ where: { customerId: { in: ids } } });
      await prisma.contactPoint.deleteMany({ where: { customerId: { in: ids } } });
      await prisma.customer.deleteMany({ where: { id: { in: ids } } });
    }
    await prisma.staffUser.deleteMany({
      where: { emailNormalized: { startsWith: 'warehouse-e2e-' } },
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

  it('tạo hai hồ sơ có cùng liên hệ nhưng chỉ gợi ý trùng, không tự gộp', async () => {
    const first = await owner
      .post('/api/v1/customers')
      .send({
        displayName: 'Khách E2E Nguyễn An',
        groupCode: 'retail',
        source: 'E2E',
        contacts: [
          { type: 'PHONE', value: '090 123 4567', isPrimary: true },
          { type: 'EMAIL', value: 'e2e.customer@example.com' },
        ],
        address: {
          label: 'Nhà',
          line1: '12 Đường Kiểm Thử',
          district: 'Quận 1',
          province: 'TP Hồ Chí Minh',
          isDefault: true,
        },
      })
      .expect(201);
    firstCustomerId = first.body.data.customer.id;
    firstCustomerVersion = first.body.data.customer.version;
    expect(first.body.data.duplicateCandidates).toHaveLength(0);
    expect(first.body.data.customer.contacts).toHaveLength(2);
    expect(first.body.data.customer.addresses).toHaveLength(1);

    const second = await owner
      .post('/api/v1/customers')
      .send({
        displayName: 'Khách E2E Nguyễn An',
        groupCode: 'wholesale',
        source: 'E2E',
        contacts: [{ type: 'PHONE', value: '+84 90 123 4567', isPrimary: true }],
      })
      .expect(201);
    expect(second.body.data.customer.id).not.toBe(firstCustomerId);
    expect(second.body.data.duplicateCandidates[0].matchReasons).toContain('SAME_PHONE');

    const search = await owner.get('/api/v1/customers?query=0901234567').expect(200);
    expect(search.body.data.items).toHaveLength(2);
  });

  it('thêm địa chỉ, việc nhắc và cơ hội mua lại vào đúng khách', async () => {
    const address = await owner
      .post(`/api/v1/customers/${firstCustomerId}/addresses`)
      .send({
        label: 'Kho nhận hàng',
        recipientName: 'Nguyễn An',
        line1: '25 Đường Giao Hàng',
        district: 'Quận 3',
        province: 'TP Hồ Chí Minh',
      })
      .expect(201);
    expect(address.body.data.addresses).toHaveLength(2);

    await owner
      .post('/api/v1/tasks')
      .send({ customerId: firstCustomerId, title: 'Gọi lại xác nhận nhu cầu' })
      .expect(201);
    await owner
      .post('/api/v1/opportunities')
      .send({
        customerId: firstCustomerId,
        title: 'Đơn mua lại tháng sau',
        kind: 'REPEAT_PURCHASE',
      })
      .expect(201);

    const detail = await owner.get(`/api/v1/customers/${firstCustomerId}`).expect(200);
    expect(detail.body.data.tasks).toHaveLength(1);
    expect(detail.body.data.opportunities[0].kind).toBe('REPEAT_PURCHASE');
  });

  it('chống ghi đè hồ sơ bằng version', async () => {
    const updated = await owner
      .patch(`/api/v1/customers/${firstCustomerId}`)
      .send({ version: firstCustomerVersion, notes: 'Đã xác minh trong E2E' })
      .expect(200);
    expect(updated.body.data.version).toBe(firstCustomerVersion + 1);

    const conflict = await owner
      .patch(`/api/v1/customers/${firstCustomerId}`)
      .send({ version: firstCustomerVersion, notes: 'Dữ liệu cũ' })
      .expect(409);
    expect(conflict.body.error.code).toBe('VERSION_CONFLICT');
  });

  it('từ chối role kho gọi API khách hàng trực tiếp', async () => {
    const email = `warehouse-e2e-${Date.now()}@crm.local`;
    await owner
      .post('/api/v1/staff')
      .send({
        email,
        displayName: 'Kho E2E',
        password: 'Warehouse-test-password-123!',
        roleCodes: ['warehouse'],
      })
      .expect(201);
    const warehouse = request.agent(app.getHttpServer());
    await warehouse
      .post('/api/v1/auth/sessions')
      .send({ email, password: 'Warehouse-test-password-123!' })
      .expect(201);
    const response = await warehouse.get('/api/v1/customers').expect(403);
    expect(response.body.error.code).toBe('PERMISSION_DENIED');
  });
});
