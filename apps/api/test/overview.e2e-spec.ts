import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApplication } from '../src/bootstrap';

const ownerEmail = process.env.SEED_OWNER_EMAIL ?? 'owner@crm.local';
const ownerPassword = process.env.SEED_OWNER_PASSWORD ?? 'Local-test-password-123!';

describe('overview API', () => {
  let app: INestApplication;
  let owner: ReturnType<typeof request.agent>;

  beforeAll(async () => {
    app = await createApplication();
    await app.init();
    owner = request.agent(app.getHttpServer());
    await owner
      .post('/api/v1/auth/sessions')
      .send({ email: ownerEmail, password: ownerPassword })
      .expect(201);
  });

  afterAll(async () => {
    await app.close();
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
