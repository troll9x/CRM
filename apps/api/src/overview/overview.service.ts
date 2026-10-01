import { Injectable } from '@nestjs/common';
import type { RequestStaff } from '../common/request-context';
import { PERMISSIONS } from '../identity/permissions';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class OverviewService {
  constructor(private readonly prisma: PrismaService) {}

  async get(actor: RequestStaff) {
    const businessId = actor.businessId;
    const canReadCustomers = actor.permissions.includes(PERMISSIONS.CUSTOMERS_READ);
    const canReadTasks = actor.permissions.includes(PERMISSIONS.TASKS_MANAGE);
    const canReadCatalog = actor.permissions.includes(PERMISSIONS.CATALOG_READ);
    const canReadPurchasing = actor.permissions.includes(PERMISSIONS.PURCHASING_READ);
    const now = new Date();
    const [
      activeCustomers,
      customerGroups,
      customerCounts,
      openTasks,
      overdueTasks,
      opportunityCounts,
      productCounts,
      variantCounts,
      supplierCounts,
      purchaseOrderCounts,
      recentPurchaseOrders,
    ] = await Promise.all([
      this.prisma.customer.count({ where: { businessId, status: 'ACTIVE' } }),
      this.prisma.customerGroup.findMany({
        where: { businessId },
        select: { id: true, code: true, name: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.customer.groupBy({
        by: ['groupId'],
        where: { businessId, status: 'ACTIVE' },
        _count: { _all: true },
      }),
      this.prisma.customerTask.count({ where: { businessId, status: 'OPEN' } }),
      this.prisma.customerTask.count({
        where: { businessId, status: 'OPEN', dueAt: { lt: now } },
      }),
      this.prisma.salesOpportunity.groupBy({
        by: ['stage'],
        where: { businessId },
        _count: { _all: true },
      }),
      this.prisma.product.groupBy({
        by: ['status'],
        where: { businessId },
        _count: { _all: true },
      }),
      this.prisma.productVariant.groupBy({
        by: ['status'],
        where: { businessId },
        _count: { _all: true },
      }),
      this.prisma.supplier.groupBy({
        by: ['status'],
        where: { businessId },
        _count: { _all: true },
      }),
      this.prisma.purchaseOrder.groupBy({
        by: ['status'],
        where: { businessId },
        _count: { _all: true },
      }),
      this.prisma.purchaseOrder.findMany({
        where: { businessId },
        take: 5,
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true,
          orderNumber: true,
          status: true,
          updatedAt: true,
          supplier: { select: { name: true } },
          _count: { select: { lines: true } },
        },
      }),
    ]);

    const countMap = <T extends string>(rows: Array<{ status: T; _count: { _all: number } }>) =>
      Object.fromEntries(rows.map((row) => [row.status, row._count._all])) as Partial<
        Record<T, number>
      >;
    const productMap = countMap(productCounts);
    const variantMap = countMap(variantCounts);
    const supplierMap = countMap(supplierCounts);
    const purchaseMap = countMap(purchaseOrderCounts);
    const opportunityMap = Object.fromEntries(
      opportunityCounts.map((row) => [row.stage, row._count._all]),
    );
    const customersByGroup = new Map(customerCounts.map((row) => [row.groupId, row._count._all]));

    return {
      generatedAt: now.toISOString(),
      kpis: {
        ...(canReadCustomers ? { activeCustomers } : {}),
        ...(canReadTasks ? { openTasks, overdueTasks } : {}),
        ...(canReadCatalog
          ? { activeProducts: productMap.ACTIVE ?? 0, activeVariants: variantMap.ACTIVE ?? 0 }
          : {}),
        ...(canReadPurchasing
          ? {
              activeSuppliers: supplierMap.ACTIVE ?? 0,
              draftPurchaseOrders: purchaseMap.DRAFT ?? 0,
              orderedPurchaseOrders:
                (purchaseMap.ORDERED ?? 0) + (purchaseMap.PARTIALLY_RECEIVED ?? 0),
            }
          : {}),
      },
      comparisons: {
        ...(canReadCustomers
          ? {
              customersByGroup: customerGroups.map((group) => ({
                key: group.code,
                label: group.name,
                value: customersByGroup.get(group.id) ?? 0,
              })),
            }
          : {}),
        ...(canReadCustomers
          ? {
              opportunitiesByStage: ['NEW', 'QUALIFIED', 'WON', 'LOST'].map((stage) => ({
                key: stage,
                value: opportunityMap[stage] ?? 0,
              })),
            }
          : {}),
        ...(canReadCatalog
          ? {
              catalog: [
                {
                  key: 'PRODUCT_ACTIVE',
                  label: 'Sản phẩm đang bán',
                  value: productMap.ACTIVE ?? 0,
                },
                {
                  key: 'PRODUCT_INACTIVE',
                  label: 'Sản phẩm ngừng bán',
                  value: productMap.INACTIVE ?? 0,
                },
                { key: 'SKU_ACTIVE', label: 'SKU đang bán', value: variantMap.ACTIVE ?? 0 },
                { key: 'SKU_INACTIVE', label: 'SKU ngừng bán', value: variantMap.INACTIVE ?? 0 },
              ],
            }
          : {}),
        ...(canReadPurchasing
          ? {
              purchasing: [
                {
                  key: 'SUPPLIER_ACTIVE',
                  label: 'Nhà cung cấp hoạt động',
                  value: supplierMap.ACTIVE ?? 0,
                },
                {
                  key: 'SUPPLIER_ARCHIVED',
                  label: 'Nhà cung cấp lưu trữ',
                  value: supplierMap.ARCHIVED ?? 0,
                },
                { key: 'PO_DRAFT', label: 'Đơn mua nháp', value: purchaseMap.DRAFT ?? 0 },
                {
                  key: 'PO_ORDERED',
                  label: 'Đơn mua đã phát hành',
                  value: purchaseMap.ORDERED ?? 0,
                },
                {
                  key: 'PO_PARTIAL',
                  label: 'Đơn mua đã nhận một phần',
                  value: purchaseMap.PARTIALLY_RECEIVED ?? 0,
                },
                {
                  key: 'PO_RECEIVED',
                  label: 'Đơn mua đã nhận đủ',
                  value: purchaseMap.RECEIVED ?? 0,
                },
                { key: 'PO_CANCELED', label: 'Đơn mua đã hủy', value: purchaseMap.CANCELED ?? 0 },
              ],
            }
          : {}),
      },
      ...(canReadPurchasing ? { recentPurchaseOrders } : {}),
    };
  }
}
