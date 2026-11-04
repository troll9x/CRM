import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RequestStaff } from '../common/request-context';
import type { PrismaService } from '../prisma/prisma.service';
import { CustomerInsightsService } from './customer-insights.service';

const actor: RequestStaff = {
  id: 'staff-1',
  businessId: 'business-1',
  email: 'test@example.invalid',
  displayName: 'Tester',
  roles: [],
  permissions: ['customers.read', 'orders.read'],
};

function setup(shipments: unknown[] = []) {
  const prisma = {
    $transaction: vi.fn((queries: Promise<unknown>[]) => Promise.all(queries)),
    customer: { findFirst: vi.fn().mockResolvedValue({ id: 'customer-1' }) },
    shipment: {
      findMany: vi.fn().mockResolvedValue(shipments),
      aggregate: vi.fn().mockResolvedValue({
        _count: { id: shipments.length },
        _sum: { recognizedRevenueVnd: { toFixed: () => '100000' } },
        _max: { deliveredAt: new Date('2026-10-30T12:00:00Z') },
      }),
    },
    auditLog: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: 'run-1' }),
    },
    staffUser: {
      findFirst: vi.fn().mockResolvedValue({
        roles: [
          {
            role: {
              permissions: [{ permissionKey: 'customers.read' }, { permissionKey: 'orders.read' }],
            },
          },
        ],
      }),
    },
  };
  return { prisma, service: new CustomerInsightsService(prisma as unknown as PrismaService) };
}

afterEach(() => vi.unstubAllGlobals());

describe('CustomerInsightsService', () => {
  it('does not invoke a model when there is no delivered order', async () => {
    const { service, prisma } = setup();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(service.analyze('customer-1', actor, 'req-1')).resolves.toMatchObject({
      status: 'INSUFFICIENT_DATA',
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(prisma.shipment.findMany.mock.calls[0]?.[0]).toMatchObject({
      where: {
        businessId: 'business-1',
        order: { customerId: 'customer-1', status: 'CONFIRMED' },
      },
    });
  });

  it('rejects a customer outside the business before querying orders', async () => {
    const { service, prisma } = setup();
    prisma.customer.findFirst.mockResolvedValue(null);
    await expect(service.analyze('other-customer', actor, 'req-1')).rejects.toMatchObject({
      code: 'RESOURCE_NOT_FOUND',
    });
    expect(prisma.shipment.findMany).not.toHaveBeenCalled();
  });

  it('rejects fabricated evidence IDs from the local model', async () => {
    const { service, prisma } = setup([
      {
        orderId: 'order-1',
        deliveredAt: new Date('2026-10-30T12:00:00Z'),
        recognizedRevenueVnd: { toFixed: () => '100000' },
      },
    ]);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            response: JSON.stringify({
              summary: 'Đã mua.',
              suggestion: 'Liên hệ.',
              evidenceIds: ['order-fake'],
            }),
          }),
      }),
    );
    await expect(service.analyze('customer-1', actor, 'req-1')).rejects.toMatchObject({
      code: 'AI_INVALID_OUTPUT',
    });
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('keeps personal fields out of the model request and stores a valid run', async () => {
    const { service, prisma } = setup([
      {
        orderId: 'order-1',
        deliveredAt: new Date('2026-10-30T12:00:00Z'),
        recognizedRevenueVnd: { toFixed: () => '100000' },
      },
    ]);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          response: JSON.stringify({
            summary: 'Một đơn đã giao.',
            suggestion: 'Kiểm tra nhu cầu.',
            evidenceIds: ['order-1'],
          }),
        }),
    });
    vi.stubGlobal('fetch', fetchMock);
    await expect(service.analyze('customer-1', actor, 'req-1')).resolves.toMatchObject({
      status: 'READY',
      facts: { recognizedRevenueVnd: '100000' },
      runId: 'run-1',
    });
    const request = fetchMock.mock.calls[0]?.[1] as unknown as RequestInit | undefined;
    if (typeof request?.body !== 'string') throw new Error('Missing model request body');
    const body = JSON.parse(request.body) as { prompt?: unknown };
    expect(String(body.prompt)).not.toContain(actor.email);
    expect(String(body.prompt)).toContain('order-1');
    expect(prisma.auditLog.create).toHaveBeenCalledOnce();
  });
});
