import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApplication } from '../src/bootstrap';
import { PrismaService } from '../src/prisma/prisma.service';

const ownerEmail = process.env.SEED_OWNER_EMAIL ?? 'owner@crm.local';
const ownerPassword = process.env.SEED_OWNER_PASSWORD ?? 'Local-test-password-123!';

describe('identity API', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await createApplication();
    await app.init();
    prisma = app.get(PrismaService);
    await prisma.staffUser.deleteMany({
      where: { emailNormalized: { startsWith: 'sales-e2e-' } },
    });
  });

  afterAll(async () => {
    await prisma.staffUser.deleteMany({
      where: { emailNormalized: { startsWith: 'sales-e2e-' } },
    });
    await app.close();
  });

  it('bảo vệ /me khi chưa đăng nhập', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/me').expect(401);
    expect(response.body.error.code).toBe('AUTHENTICATION_REQUIRED');
    expect(response.body.meta.requestId).toBeTypeOf('string');
  });

  it('đăng nhập, đọc quyền, từ chối nhân viên thiếu quyền và thu hồi phiên khi đăng xuất', async () => {
    const owner = request.agent(app.getHttpServer());
    const login = await owner
      .post('/api/v1/auth/sessions')
      .send({ email: ownerEmail, password: ownerPassword })
      .expect(201);
    expect(login.headers['set-cookie']?.[0]).toContain('HttpOnly');
    expect(login.body.data.staff.roles).toContain('owner');

    const me = await owner.get('/api/v1/me').expect(200);
    expect(me.body.data.email).toBe(ownerEmail);
    expect(me.body.data.permissions).toContain('staff.manage');

    const uniqueEmail = `sales-e2e-${Date.now()}@crm.local`;
    await owner
      .post('/api/v1/staff')
      .send({
        email: uniqueEmail,
        displayName: 'Nhân viên kiểm thử',
        password: 'Sales-test-password-123!',
        roleCodes: ['sales'],
      })
      .expect(201);

    const sales = request.agent(app.getHttpServer());
    await sales
      .post('/api/v1/auth/sessions')
      .send({ email: uniqueEmail, password: 'Sales-test-password-123!' })
      .expect(201);
    const forbidden = await sales.get('/api/v1/staff').expect(403);
    expect(forbidden.body.error.code).toBe('PERMISSION_DENIED');

    await owner.delete('/api/v1/auth/session').expect(200);
    await owner.get('/api/v1/me').expect(401);
  });

  it('không chấp nhận field ngoài schema DTO', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/sessions')
      .send({ email: ownerEmail, password: ownerPassword, isAdmin: true })
      .expect(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });
});
