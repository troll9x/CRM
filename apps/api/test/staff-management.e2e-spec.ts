import type { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApplication } from '../src/bootstrap';
import { PrismaService } from '../src/prisma/prisma.service';
import { hashPassword } from '../src/identity/password';
import { ALL_PERMISSION_KEYS } from '../src/identity/permissions';

if (
  !new URL(process.env.DATABASE_URL ?? 'postgresql://x:x@localhost/none').pathname.includes(
    'scratch',
  )
)
  throw new Error('Staff management tests require an isolated scratch database.');

describe('Staff management with tenant and privilege boundaries', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const password = 'Fixture-staff-password-123!';
  const ownerEmail = process.env.SEED_OWNER_EMAIL ?? 'owner@crm.local';
  const ownerPassword = process.env.SEED_OWNER_PASSWORD ?? 'Local-test-password-123!';
  const email = () => `staff-${randomUUID()}@example.invalid`;
  async function login(address = ownerEmail, secret = ownerPassword) {
    const agent = request.agent(app.getHttpServer());
    await agent
      .post('/api/v1/auth/sessions')
      .send({ email: address, password: secret })
      .expect(201);
    return agent;
  }
  beforeAll(async () => {
    app = await createApplication();
    await app.init();
    prisma = app.get(PrismaService);
  });
  afterAll(async () => {
    await app?.close();
  });

  it('creates, edits, assigns roles, resets password, locks and revokes sessions', async () => {
    const owner = await login();
    const address = email();
    const created = await owner
      .post('/api/v1/staff')
      .send({
        email: address,
        displayName: 'Nhân viên kiểm thử',
        password,
        roleCodes: ['sales'],
      })
      .expect(201);
    const id = created.body.data.id as string;
    expect(created.body.data).not.toHaveProperty('passwordHash');
    await owner
      .post('/api/v1/staff')
      .send({ email: address.toUpperCase(), displayName: 'Trùng email', password, roleCodes: [] })
      .expect(409);
    await owner
      .post('/api/v1/staff')
      .send({ email: email(), displayName: '   ', password, roleCodes: [] })
      .expect(400);
    const sales = await login(address, password);
    await sales.get('/api/v1/staff').expect(403);
    await sales.get('/api/v1/roles').expect(403);
    await owner
      .patch(`/api/v1/staff/${id}`)
      .send({ email: address, displayName: 'Tên đã cập nhật' })
      .expect(200);
    await owner
      .put(`/api/v1/staff/${id}/roles`)
      .send({ roleCodes: ['warehouse'] })
      .expect(200);
    await sales.get('/api/v1/me').expect(401);
    const warehouse = await login(address, password);
    expect((await warehouse.get('/api/v1/me').expect(200)).body.data.roles).toEqual(['warehouse']);
    const newPassword = 'Fixture-new-password-456!';
    await owner
      .post(`/api/v1/staff/${id}/reset-password`)
      .send({ password: newPassword })
      .expect(201);
    await warehouse.get('/api/v1/me').expect(401);
    await request(app.getHttpServer())
      .post('/api/v1/auth/sessions')
      .send({ email: address, password })
      .expect(401);
    const fresh = await login(address, newPassword);
    await owner.patch(`/api/v1/staff/${id}/lock`).send({ locked: true }).expect(200);
    await fresh.get('/api/v1/me').expect(401);
    await request(app.getHttpServer())
      .post('/api/v1/auth/sessions')
      .send({ email: address, password: newPassword })
      .expect(401);
    await owner.patch(`/api/v1/staff/${id}/lock`).send({ locked: false }).expect(200);
    await login(address, newPassword);
    const resetAudit = await prisma.auditLog.findFirstOrThrow({
      where: { entityId: id, action: 'staff.password.reset' },
    });
    expect(JSON.stringify(resetAudit)).not.toContain(newPassword);
    const list = await owner.get('/api/v1/staff').expect(200);
    const item = (
      list.body.data as Array<{ id: string; displayName: string; permissions: string[] }>
    ).find((r) => r.id === id);
    expect(item?.displayName).toBe('Tên đã cập nhật');
    expect(item?.permissions).toContain('inventory.read');
    expect(JSON.stringify(list.body.data)).not.toContain('passwordHash');
  });

  it('blocks privilege escalation, self lock and cross-business IDs', async () => {
    const owner = await login();
    const me = (await owner.get('/api/v1/me').expect(200)).body.data as {
      id: string;
      businessId: string;
    };
    await owner.patch(`/api/v1/staff/${me.id}/lock`).send({ locked: true }).expect(422);
    await owner.put(`/api/v1/staff/${me.id}/roles`).send({ roleCodes: [] }).expect(422);
    const role = await prisma.role.create({
      data: {
        businessId: me.businessId,
        code: `delegated-${randomUUID()}`,
        name: 'Fixture limited admin',
        permissions: {
          create: [{ permissionKey: 'staff.manage' }, { permissionKey: 'roles.manage' }],
        },
      },
    });
    const address = email();
    await owner
      .post('/api/v1/staff')
      .send({ email: address, displayName: 'Quản trị giới hạn', password, roleCodes: [role.code] })
      .expect(201);
    const delegated = await login(address, password);
    await delegated
      .post('/api/v1/staff')
      .send({ email: email(), displayName: 'Escalation', password, roleCodes: ['owner'] })
      .expect(403);
    await delegated
      .post('/api/v1/staff')
      .send({ email: email(), displayName: 'Escalation', password, roleCodes: ['sales'] })
      .expect(403);
    await delegated.patch(`/api/v1/staff/${me.id}/lock`).send({ locked: true }).expect(403);
    const restrictedRole = await prisma.role.create({
      data: {
        businessId: me.businessId,
        code: `roles-only-${randomUUID()}`,
        name: 'Fixture roles only',
        permissions: { create: [{ permissionKey: 'roles.manage' }] },
      },
    });
    const restrictedEmail = email();
    await owner
      .post('/api/v1/staff')
      .send({
        email: restrictedEmail,
        displayName: 'Roles only',
        password,
        roleCodes: [restrictedRole.code],
      })
      .expect(201);
    const restricted = await login(restrictedEmail, password);
    await restricted.put(`/api/v1/staff/${me.id}/roles`).send({ roleCodes: [] }).expect(403);
    const foreign = await prisma.business.create({ data: { name: 'Fixture foreign staff' } });
    const outsider = await prisma.staffUser.create({
      data: {
        businessId: foreign.id,
        email: email(),
        emailNormalized: email(),
        displayName: 'Foreign',
        passwordHash: await hashPassword(password),
      },
    });
    await owner
      .patch(`/api/v1/staff/${outsider.id}`)
      .send({ email: email(), displayName: 'Foreign edit' })
      .expect(404);
    await owner.patch(`/api/v1/staff/${outsider.id}/lock`).send({ locked: true }).expect(404);
    await owner.put(`/api/v1/staff/${outsider.id}/roles`).send({ roleCodes: [] }).expect(404);
    await owner.post(`/api/v1/staff/${outsider.id}/reset-password`).send({ password }).expect(404);
  });

  it('keeps one active owner when two owners concurrently lock each other', async () => {
    const business = await prisma.business.create({ data: { name: 'Fixture concurrent owners' } });
    const role = await prisma.role.create({
      data: {
        businessId: business.id,
        code: 'owner',
        name: 'Owner',
        permissions: { create: ALL_PERMISSION_KEYS.map((permissionKey) => ({ permissionKey })) },
      },
    });
    const users = [];
    for (let index = 0; index < 2; index++) {
      const address = email();
      users.push(
        await prisma.staffUser.create({
          data: {
            businessId: business.id,
            email: address,
            emailNormalized: address,
            displayName: `Owner ${index}`,
            passwordHash: await hashPassword(password),
            roles: { create: { roleId: role.id } },
          },
        }),
      );
    }
    const first = users[0]!;
    const second = users[1]!;
    const a = await login(first.email, password);
    const b = await login(second.email, password);
    const results = await Promise.all([
      a.patch(`/api/v1/staff/${second.id}/lock`).send({ locked: true }),
      b.patch(`/api/v1/staff/${first.id}/lock`).send({ locked: true }),
    ]);
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(results.filter((r) => [401, 403].includes(r.status))).toHaveLength(1);
    expect(
      await prisma.staffUser.count({ where: { businessId: business.id, status: 'ACTIVE' } }),
    ).toBe(1);
  });
});
