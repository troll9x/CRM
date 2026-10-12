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
      where: {
        OR: [{ source: 'E2E' }, { displayName: { startsWith: 'Khách E2E' } }],
      },
      select: { id: true },
    });
    const ids = customers.map(({ id }) => id);
    if (ids.length) {
      await prisma.customerDuplicateSuggestion.deleteMany({
        where: { OR: [{ customerAId: { in: ids } }, { customerBId: { in: ids } }] },
      });
      await prisma.salesOpportunity.deleteMany({ where: { customerId: { in: ids } } });
      await prisma.customerTask.deleteMany({ where: { customerId: { in: ids } } });
      await prisma.customerNote.deleteMany({ where: { customerId: { in: ids } } });
      await prisma.paymentReceipt.deleteMany({ where: { customerId: { in: ids } } });
      await prisma.salesOrder.deleteMany({ where: { customerId: { in: ids } } });
      await prisma.quote.deleteMany({ where: { customerId: { in: ids } } });
      await prisma.address.deleteMany({ where: { customerId: { in: ids } } });
      await prisma.contactPoint.deleteMany({ where: { customerId: { in: ids } } });
      await prisma.customer.deleteMany({ where: { id: { in: ids } } });
    }
    const foreignBusinesses = await prisma.business.findMany({
      where: { name: { startsWith: 'Business E2E customer scope' } },
      select: { id: true },
    });
    if (foreignBusinesses.length) {
      const businessIds = foreignBusinesses.map(({ id }) => id);
      await prisma.customer.deleteMany({ where: { businessId: { in: businessIds } } });
      await prisma.customerGroup.deleteMany({ where: { businessId: { in: businessIds } } });
      await prisma.business.deleteMany({ where: { id: { in: businessIds } } });
    }
    await prisma.staffUser.deleteMany({
      where: {
        OR: [
          { emailNormalized: { startsWith: 'warehouse-e2e-' } },
          { emailNormalized: { startsWith: 'customer-read-e2e-' } },
        ],
      },
    });
    await prisma.role.deleteMany({ where: { code: { startsWith: 'customer-read-' } } });
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

  it('tự xếp nhóm theo kênh nguồn và giữ quy tắc khi cập nhật khách', async () => {
    const channelCases = [
      { source: 'Facebook', expectedGroup: 'wholesale', submittedGroup: 'retail' },
      { source: 'Zalo', expectedGroup: 'wholesale', submittedGroup: 'retail' },
      { source: 'Shopee', expectedGroup: 'retail', submittedGroup: 'wholesale' },
      { source: 'TikTok', expectedGroup: 'retail', submittedGroup: 'wholesale' },
    ];

    for (const [index, channelCase] of channelCases.entries()) {
      const response = await owner
        .post('/api/v1/customers')
        .send({
          displayName: `Khách E2E phân nhóm kênh ${index}`,
          source: channelCase.source,
          groupCode: channelCase.submittedGroup,
        })
        .expect(201);
      expect(response.body.data.customer.group.code).toBe(channelCase.expectedGroup);
      const emptyTimeline = await owner
        .get(`/api/v1/customers/${response.body.data.customer.id}/timeline`)
        .expect(200);
      expect(emptyTimeline.body.data.items).toEqual([]);

      const updated = await owner
        .patch(`/api/v1/customers/${response.body.data.customer.id}`)
        .send({
          version: response.body.data.customer.version,
          groupCode: channelCase.submittedGroup,
        })
        .expect(200);
      expect(updated.body.data.group.code).toBe(channelCase.expectedGroup);
    }
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
    firstCustomerVersion = address.body.data.version;

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

  it('lưu ghi chú thật, phân trang timeline ổn định và lọc từng module theo quyền', async () => {
    const ownerStaff = await prisma.staffUser.findUniqueOrThrow({
      where: { emailNormalized: ownerEmail.toLowerCase() },
      select: { id: true, businessId: true },
    });
    const quote = await prisma.quote.create({
      data: {
        businessId: ownerStaff.businessId,
        customerId: firstCustomerId,
        createdById: ownerStaff.id,
        quoteNumber: `QT-C360-${Date.now()}`,
        lineSubtotalVnd: '88000',
        lineDiscountVnd: '0',
        orderDiscountVnd: '0',
        taxVnd: '0',
        depositVnd: '0',
        grandTotalVnd: '88000',
      },
    });
    const order = await prisma.salesOrder.create({
      data: {
        businessId: ownerStaff.businessId,
        customerId: firstCustomerId,
        createdById: ownerStaff.id,
        orderNumber: `DH-C360-${Date.now()}`,
        lineSubtotalVnd: '99000',
        lineDiscountVnd: '0',
        orderDiscountVnd: '0',
        shippingFeeVnd: '0',
        taxVnd: '0',
        depositVnd: '0',
        grandTotalVnd: '99000',
      },
    });
    const receipt = await prisma.paymentReceipt.create({
      data: {
        businessId: ownerStaff.businessId,
        customerId: firstCustomerId,
        createdById: ownerStaff.id,
        amountVnd: '35000',
        receivedAt: new Date('2026-10-08T11:30:00.000Z'),
        reference: `PT-C360-${Date.now()}`,
        idempotencyKey: `c360-test-${Date.now()}`,
        requestHash: 'fixture-only',
      },
    });

    await owner
      .post(`/api/v1/customers/${firstCustomerId}/notes`)
      .send({ content: 'Đã xác nhận khách muốn nhận báo giá qua Zalo.' })
      .expect(201);
    const tiedAt = new Date('2026-10-08T12:00:00.000Z');
    await prisma.customerNote.createMany({
      data: ['a', 'b', 'c'].map((suffix) => ({
        id: `note-c360-${suffix}-${Date.now()}`,
        businessId: ownerStaff.businessId,
        customerId: firstCustomerId,
        createdById: ownerStaff.id,
        content: `Fixture cùng timestamp ${suffix}`,
        createdAt: tiedAt,
      })),
    });

    const collected: Array<{ id: string; type: string; detail: string }> = [];
    let cursor: string | null = null;
    do {
      const url: string = `/api/v1/customers/${firstCustomerId}/timeline?limit=2${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
      const page: {
        body: {
          data: {
            items: Array<{ id: string; type: string; detail: string }>;
            nextCursor: string | null;
          };
        };
      } = await owner.get(url).expect(200);
      collected.push(...page.body.data.items);
      cursor = page.body.data.nextCursor;
    } while (cursor);
    expect(new Set(collected.map((item) => item.id)).size).toBe(collected.length);
    expect(collected.map((item) => item.type)).toEqual(
      expect.arrayContaining(['NOTE', 'TASK', 'OPPORTUNITY', 'QUOTE', 'ORDER', 'PAYMENT']),
    );
    expect(collected.find((item) => item.id === order.id)?.detail).toBe('Đơn nháp');
    expect(collected.find((item) => item.id === quote.id)).toMatchObject({
      sourceId: quote.quoteNumber,
    });
    expect(collected.find((item) => item.id === receipt.id)).toMatchObject({
      type: 'PAYMENT',
      amountVnd: '35000',
      receivedAt: '2026-10-08T11:30:00.000Z',
    });
    await owner
      .get(`/api/v1/customers/${firstCustomerId}/timeline?cursor=not-a-cursor`)
      .expect(400);

    const foreignBusiness = await prisma.business.create({
      data: {
        name: `Business E2E customer scope ${Date.now()}`,
        customerGroups: { create: { code: 'retail', name: 'Khách lẻ' } },
      },
      select: { id: true },
    });
    const foreignGroup = await prisma.customerGroup.findUniqueOrThrow({
      where: { businessId_code: { businessId: foreignBusiness.id, code: 'retail' } },
      select: { id: true },
    });
    const foreignCustomer = await prisma.customer.create({
      data: {
        businessId: foreignBusiness.id,
        customerCode: `KH-FOREIGN-${Date.now()}`,
        displayName: 'Khách E2E tenant isolation',
        nameNormalized: 'khach e2e tenant isolation',
        groupId: foreignGroup.id,
      },
      select: { id: true },
    });
    await owner.get(`/api/v1/customers/${foreignCustomer.id}`).expect(404);
    await owner.get(`/api/v1/customers/${foreignCustomer.id}/timeline`).expect(404);

    const roleCode = `customer-read-${Date.now()}`;
    const role = await prisma.role.create({
      data: {
        businessId: ownerStaff.businessId,
        code: roleCode,
        name: 'Customer profile reader E2E',
        permissions: { create: { permissionKey: 'customers.read' } },
      },
    });
    const email = `customer-read-e2e-${Date.now()}@crm.local`;
    await owner
      .post('/api/v1/staff')
      .send({
        email,
        displayName: 'Customer reader E2E',
        password: 'Customer-test-password-123!',
        roleCodes: [roleCode],
      })
      .expect(201);
    const reader = request.agent(app.getHttpServer());
    await reader
      .post('/api/v1/auth/sessions')
      .send({ email, password: 'Customer-test-password-123!' })
      .expect(201);

    const detail = await reader.get(`/api/v1/customers/${firstCustomerId}`).expect(200);
    expect(detail.body.data.tasks).toBeUndefined();
    expect(detail.body.data.opportunities).toBeUndefined();
    expect(detail.body.data._count.tasks).toBeUndefined();
    const customerList = await reader
      .get(`/api/v1/customers?query=${encodeURIComponent(detail.body.data.customerCode)}`)
      .expect(200);
    expect(customerList.body.data.items[0]._count.tasks).toBeUndefined();
    expect(customerList.body.data.items[0]._count.opportunities).toBeUndefined();
    const restrictedTimeline = await reader
      .get(`/api/v1/customers/${firstCustomerId}/timeline`)
      .expect(200);
    const restrictedItems = restrictedTimeline.body.data.items as Array<{ type: string }>;
    expect(restrictedItems.length).toBeGreaterThan(0);
    expect(restrictedItems.every((item) => item.type === 'NOTE')).toBe(true);
    expect(JSON.stringify(restrictedTimeline.body)).not.toContain('hasPurchased');
    expect(JSON.stringify(restrictedTimeline.body)).not.toContain('revenueVnd');
    expect(JSON.stringify(restrictedTimeline.body)).not.toContain(quote.quoteNumber);
    expect(JSON.stringify(restrictedTimeline.body)).not.toContain('88000');
    expect(JSON.stringify(restrictedTimeline.body)).not.toContain(order.orderNumber);
    expect(JSON.stringify(restrictedTimeline.body)).not.toContain(receipt.id);
    expect(JSON.stringify(restrictedTimeline.body)).not.toContain('35000');
    await reader
      .post(`/api/v1/customers/${firstCustomerId}/notes`)
      .send({ content: 'Should not be allowed' })
      .expect(403);

    await prisma.staffUser.deleteMany({ where: { emailNormalized: email.toLowerCase() } });
    await prisma.role.delete({ where: { id: role.id } });
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
