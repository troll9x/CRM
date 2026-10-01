import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApplication } from '../src/bootstrap';
import { PrismaService } from '../src/prisma/prisma.service';

const ownerEmail = process.env.SEED_OWNER_EMAIL ?? 'owner@crm.local';
const ownerPassword = process.env.SEED_OWNER_PASSWORD ?? 'Local-test-password-123!';

describe('overview API', () => {
  let app: INestApplication;
  let owner: ReturnType<typeof request.agent>;
  let prisma: PrismaService;
  let salesEmail = '';

  beforeAll(async () => {
    app = await createApplication();
    await app.init();
    prisma = app.get(PrismaService);
    owner = request.agent(app.getHttpServer());
    await owner
      .post('/api/v1/auth/sessions')
      .send({ email: ownerEmail, password: ownerPassword })
      .expect(201);
  });

  afterAll(async () => {
    if (salesEmail) {
      await prisma.staffUser.deleteMany({ where: { emailNormalized: salesEmail } });
    }
    await app.close();
  });

  it('chỉ trả nhóm chỉ số phù hợp quyền của sales', async () => {
    salesEmail = `overview-sales-${Date.now()}@crm.local`;
    await owner
      .post('/api/v1/staff')
      .send({
        email: salesEmail,
        displayName: 'E2E overview sales',
        password: 'Overview-test-password-123!',
        roleCodes: ['sales'],
      })
      .expect(201);
    const sales = request.agent(app.getHttpServer());
    await sales
      .post('/api/v1/auth/sessions')
      .send({ email: salesEmail, password: 'Overview-test-password-123!' })
      .expect(201);
    const response = await sales.get('/api/v1/overview').expect(200);
    expect(response.body.data.kpis).not.toHaveProperty('activeSuppliers');
    expect(response.body.data.comparisons).not.toHaveProperty('purchasing');
    expect(response.body.data).not.toHaveProperty('recentPurchaseOrders');
    expect(response.body.data.comparisons).toHaveProperty('customersByGroup');
  });

  it('trả bảng so sánh nghiệp vụ thật cho owner, không trả thông tin kỹ thuật vô bổ', async () => {
    const response = await owner.get('/api/v1/overview').expect(200);
    expect(response.body.data.kpis.activeCustomers).toBeTypeOf('number');
    expect(response.body.data.comparisons.customersByGroup).toBeInstanceOf(Array);
    expect(response.body.data.comparisons.catalog).toBeInstanceOf(Array);
    expect(response.body.data.comparisons.purchasing).toBeInstanceOf(Array);
    expect(response.body.data.recentPurchaseOrders).toBeInstanceOf(Array);
    expect(response.body.data).not.toHaveProperty('permissions');
    expect(response.body.data).not.toHaveProperty('sessions');
  });
});
