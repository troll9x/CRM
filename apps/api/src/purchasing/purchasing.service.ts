import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { ProblemException } from '../common/problem.exception';
import type { RequestStaff } from '../common/request-context';
import { Prisma, type Prisma as PrismaTypes } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type {
  CreatePurchaseOrderDto,
  CreateSupplierDto,
  ListPurchaseOrdersQueryDto,
  ListSuppliersQueryDto,
  PurchaseOrderCommandDto,
  PurchaseOrderLineInputDto,
  UpdatePurchaseOrderDto,
  UpdateSupplierDto,
} from './dto/purchasing.dto';

const purchaseOrderSelect = {
  id: true,
  orderNumber: true,
  status: true,
  expectedAt: true,
  notes: true,
  version: true,
  orderedAt: true,
  canceledAt: true,
  createdAt: true,
  updatedAt: true,
  supplier: {
    select: { id: true, supplierCode: true, name: true, status: true },
  },
  createdBy: { select: { id: true, displayName: true } },
  lines: {
    orderBy: { lineNumber: 'asc' as const },
    select: {
      id: true,
      variantId: true,
      lineNumber: true,
      productNameSnapshot: true,
      skuSnapshot: true,
      variantNameSnapshot: true,
      unitCodeSnapshot: true,
      unitNameSnapshot: true,
      conversionFactorSnapshot: true,
      orderedQuantity: true,
      baseQuantity: true,
      expectedUnitCostVnd: true,
    },
  },
} satisfies PrismaTypes.PurchaseOrderSelect;

type ResolvedLine = {
  id: string;
  variantId: string;
  lineNumber: number;
  productNameSnapshot: string;
  skuSnapshot: string;
  variantNameSnapshot: string;
  unitCodeSnapshot: string;
  unitNameSnapshot: string;
  conversionFactorSnapshot: string;
  orderedQuantity: string;
  baseQuantity: string;
  expectedUnitCostVnd: string | null;
};

@Injectable()
export class PurchasingService {
  constructor(private readonly prisma: PrismaService) {}

  private supplierCode() {
    return `SUP-${randomUUID().slice(0, 8).toUpperCase()}`;
  }

  private orderNumber() {
    const day = new Date().toISOString().slice(0, 10).replaceAll('-', '');
    return `PO-${day}-${randomUUID().slice(0, 8).toUpperCase()}`;
  }

  private cleanOptional(value?: string) {
    return value?.trim() || null;
  }

  private async ensureActiveSupplier(supplierId: string, businessId: string) {
    const supplier = await this.prisma.supplier.findFirst({
      where: { id: supplierId, businessId, status: 'ACTIVE' },
      select: { id: true },
    });
    if (!supplier) {
      throw new ProblemException(
        422,
        'ACTIVE_SUPPLIER_REQUIRED',
        'Nhà cung cấp không tồn tại hoặc đã được lưu trữ.',
      );
    }
  }

  private async resolveLines(
    lines: PurchaseOrderLineInputDto[],
    businessId: string,
  ): Promise<ResolvedLine[]> {
    const variantIds = [...new Set(lines.map(({ variantId }) => variantId))];
    const variants = await this.prisma.productVariant.findMany({
      where: {
        id: { in: variantIds },
        businessId,
        status: 'ACTIVE',
        product: { status: 'ACTIVE' },
      },
      select: {
        id: true,
        sku: true,
        name: true,
        baseUnitCode: true,
        baseUnitName: true,
        product: { select: { name: true } },
        conversions: { select: { unitCode: true, unitName: true, factor: true } },
      },
    });
    if (variants.length !== variantIds.length) {
      throw new ProblemException(
        422,
        'ACTIVE_VARIANT_REQUIRED',
        'Một hoặc nhiều SKU không tồn tại hoặc đã ngừng bán.',
      );
    }
    const byId = new Map(variants.map((variant) => [variant.id, variant]));
    const seen = new Set<string>();
    return lines.map((line, index) => {
      const variant = byId.get(line.variantId)!;
      const unitCode = line.unitCode.trim().toUpperCase();
      const duplicateKey = `${variant.id}:${unitCode}`;
      if (seen.has(duplicateKey)) {
        throw new ProblemException(
          422,
          'DUPLICATE_PURCHASE_LINE',
          'Một SKU và đơn vị chỉ được xuất hiện một lần trong đơn mua.',
        );
      }
      seen.add(duplicateKey);
      const conversion =
        unitCode === variant.baseUnitCode
          ? {
              unitCode: variant.baseUnitCode,
              unitName: variant.baseUnitName,
              factor: new Prisma.Decimal(1),
            }
          : variant.conversions.find((item) => item.unitCode === unitCode);
      if (!conversion) {
        throw new ProblemException(
          422,
          'UNIT_NOT_AVAILABLE_FOR_VARIANT',
          `Đơn vị ${unitCode} không thuộc SKU ${variant.sku}.`,
        );
      }
      const quantity = new Prisma.Decimal(line.quantity);
      const baseQuantity = quantity.mul(conversion.factor);
      if (baseQuantity.decimalPlaces() > 6) {
        throw new ProblemException(
          422,
          'BASE_QUANTITY_PRECISION_EXCEEDED',
          'Số lượng quy đổi vượt quá 6 chữ số thập phân.',
        );
      }
      return {
        id: randomUUID(),
        variantId: variant.id,
        lineNumber: index + 1,
        productNameSnapshot: variant.product.name,
        skuSnapshot: variant.sku,
        variantNameSnapshot: variant.name,
        unitCodeSnapshot: conversion.unitCode,
        unitNameSnapshot: conversion.unitName,
        conversionFactorSnapshot: conversion.factor.toString(),
        orderedQuantity: quantity.toString(),
        baseQuantity: baseQuantity.toString(),
        expectedUnitCostVnd: line.expectedUnitCostVnd ?? null,
      };
    });
  }

  async listSuppliers(businessId: string, query: ListSuppliersQueryDto) {
    const search = query.query?.trim();
    return this.prisma.supplier.findMany({
      where: {
        businessId,
        ...(query.status ? { status: query.status } : {}),
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: 'insensitive' as const } },
                { supplierCode: { contains: search.toUpperCase(), mode: 'insensitive' as const } },
                { phone: { contains: search } },
                { taxCode: { contains: search } },
              ],
            }
          : {}),
      },
      take: query.limit,
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        supplierCode: true,
        name: true,
        contactName: true,
        phone: true,
        email: true,
        taxCode: true,
        address: true,
        notes: true,
        status: true,
        version: true,
        updatedAt: true,
        _count: { select: { purchaseOrders: true } },
      },
    });
  }

  async createSupplier(dto: CreateSupplierDto, actor: RequestStaff, requestId: string) {
    const id = randomUUID();
    const supplierCode = this.supplierCode();
    await this.prisma.$transaction([
      this.prisma.supplier.create({
        data: {
          id,
          businessId: actor.businessId,
          supplierCode,
          name: dto.name.trim(),
          contactName: this.cleanOptional(dto.contactName),
          phone: this.cleanOptional(dto.phone),
          email: this.cleanOptional(dto.email)?.toLowerCase() ?? null,
          taxCode: this.cleanOptional(dto.taxCode),
          address: this.cleanOptional(dto.address),
          notes: this.cleanOptional(dto.notes),
        },
      }),
      this.prisma.auditLog.create({
        data: {
          businessId: actor.businessId,
          actorId: actor.id,
          action: 'purchasing.supplier.create',
          entityType: 'Supplier',
          entityId: id,
          requestId,
          metadata: { supplierCode },
        },
      }),
    ]);
    return this.prisma.supplier.findUniqueOrThrow({ where: { id } });
  }

  async updateSupplier(id: string, dto: UpdateSupplierDto, actor: RequestStaff, requestId: string) {
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.supplier.updateMany({
        where: { id, businessId: actor.businessId, version: dto.version },
        data: {
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.contactName !== undefined
            ? { contactName: this.cleanOptional(dto.contactName) }
            : {}),
          ...(dto.phone !== undefined ? { phone: this.cleanOptional(dto.phone) } : {}),
          ...(dto.email !== undefined
            ? { email: this.cleanOptional(dto.email)?.toLowerCase() ?? null }
            : {}),
          ...(dto.taxCode !== undefined ? { taxCode: this.cleanOptional(dto.taxCode) } : {}),
          ...(dto.address !== undefined ? { address: this.cleanOptional(dto.address) } : {}),
          ...(dto.notes !== undefined ? { notes: this.cleanOptional(dto.notes) } : {}),
          ...(dto.status ? { status: dto.status } : {}),
          version: { increment: 1 },
        },
      });
      if (updated.count !== 1) {
        const exists = await tx.supplier.findFirst({ where: { id, businessId: actor.businessId } });
        throw new ProblemException(
          exists ? 409 : 404,
          exists ? 'VERSION_CONFLICT' : 'RESOURCE_NOT_FOUND',
          exists ? 'Nhà cung cấp đã được cập nhật ở nơi khác.' : 'Không tìm thấy nhà cung cấp.',
        );
      }
      await tx.auditLog.create({
        data: {
          businessId: actor.businessId,
          actorId: actor.id,
          action:
            dto.status === 'ARCHIVED'
              ? 'purchasing.supplier.archive'
              : 'purchasing.supplier.update',
          entityType: 'Supplier',
          entityId: id,
          requestId,
          metadata: { previousVersion: dto.version, status: dto.status },
        },
      });
    });
    return this.prisma.supplier.findFirstOrThrow({ where: { id, businessId: actor.businessId } });
  }

  async listPurchaseOrders(businessId: string, query: ListPurchaseOrdersQueryDto) {
    const search = query.query?.trim();
    return this.prisma.purchaseOrder.findMany({
      where: {
        businessId,
        ...(query.status ? { status: query.status } : {}),
        ...(search
          ? {
              OR: [
                { orderNumber: { contains: search.toUpperCase(), mode: 'insensitive' as const } },
                { supplier: { name: { contains: search, mode: 'insensitive' as const } } },
                { lines: { some: { skuSnapshot: { contains: search.toUpperCase() } } } },
              ],
            }
          : {}),
      },
      take: query.limit,
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      select: purchaseOrderSelect,
    });
  }

  async getPurchaseOrder(id: string, businessId: string) {
    const order = await this.prisma.purchaseOrder.findFirst({
      where: { id, businessId },
      select: purchaseOrderSelect,
    });
    if (!order) {
      throw new ProblemException(404, 'RESOURCE_NOT_FOUND', 'Không tìm thấy đơn mua.');
    }
    return order;
  }

  async createPurchaseOrder(dto: CreatePurchaseOrderDto, actor: RequestStaff, requestId: string) {
    await this.ensureActiveSupplier(dto.supplierId, actor.businessId);
    const lines = await this.resolveLines(dto.lines, actor.businessId);
    const id = randomUUID();
    const orderNumber = this.orderNumber();
    await this.prisma.$transaction(async (tx) => {
      await tx.purchaseOrder.create({
        data: {
          id,
          businessId: actor.businessId,
          supplierId: dto.supplierId,
          orderNumber,
          expectedAt: dto.expectedAt ? new Date(dto.expectedAt) : null,
          notes: this.cleanOptional(dto.notes),
          createdById: actor.id,
          lines: { create: lines },
        },
      });
      await tx.auditLog.create({
        data: {
          businessId: actor.businessId,
          actorId: actor.id,
          action: 'purchasing.purchase_order.create',
          entityType: 'PurchaseOrder',
          entityId: id,
          requestId,
          metadata: { orderNumber, supplierId: dto.supplierId, lineCount: lines.length },
        },
      });
    });
    return this.getPurchaseOrder(id, actor.businessId);
  }

  async updatePurchaseOrder(
    id: string,
    dto: UpdatePurchaseOrderDto,
    actor: RequestStaff,
    requestId: string,
  ) {
    if (dto.supplierId) await this.ensureActiveSupplier(dto.supplierId, actor.businessId);
    const lines = dto.lines ? await this.resolveLines(dto.lines, actor.businessId) : undefined;
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.purchaseOrder.updateMany({
        where: {
          id,
          businessId: actor.businessId,
          version: dto.version,
          status: 'DRAFT',
        },
        data: {
          ...(dto.supplierId ? { supplierId: dto.supplierId } : {}),
          ...(dto.expectedAt !== undefined
            ? { expectedAt: dto.expectedAt ? new Date(dto.expectedAt) : null }
            : {}),
          ...(dto.notes !== undefined ? { notes: this.cleanOptional(dto.notes) } : {}),
          version: { increment: 1 },
        },
      });
      if (updated.count !== 1) {
        const current = await tx.purchaseOrder.findFirst({
          where: { id, businessId: actor.businessId },
          select: { status: true, version: true },
        });
        if (!current) {
          throw new ProblemException(404, 'RESOURCE_NOT_FOUND', 'Không tìm thấy đơn mua.');
        }
        throw new ProblemException(
          409,
          current.status === 'DRAFT' ? 'VERSION_CONFLICT' : 'PURCHASE_ORDER_NOT_EDITABLE',
          current.status === 'DRAFT'
            ? 'Đơn mua đã được cập nhật ở nơi khác.'
            : 'Chỉ đơn mua nháp mới được sửa.',
        );
      }
      if (lines) {
        await tx.purchaseOrderLine.deleteMany({ where: { purchaseOrderId: id } });
        await tx.purchaseOrderLine.createMany({
          data: lines.map((line) => ({ ...line, purchaseOrderId: id })),
        });
      }
      await tx.auditLog.create({
        data: {
          businessId: actor.businessId,
          actorId: actor.id,
          action: 'purchasing.purchase_order.update',
          entityType: 'PurchaseOrder',
          entityId: id,
          requestId,
          metadata: { previousVersion: dto.version, lineCount: lines?.length },
        },
      });
    });
    return this.getPurchaseOrder(id, actor.businessId);
  }

  async orderPurchaseOrder(
    id: string,
    dto: PurchaseOrderCommandDto,
    actor: RequestStaff,
    requestId: string,
  ) {
    await this.changeOrderStatus(id, dto, actor, requestId, 'DRAFT', 'ORDERED');
    return this.getPurchaseOrder(id, actor.businessId);
  }

  async cancelPurchaseOrder(
    id: string,
    dto: PurchaseOrderCommandDto,
    actor: RequestStaff,
    requestId: string,
  ) {
    await this.changeOrderStatus(id, dto, actor, requestId, ['DRAFT', 'ORDERED'], 'CANCELED');
    return this.getPurchaseOrder(id, actor.businessId);
  }

  private async changeOrderStatus(
    id: string,
    dto: PurchaseOrderCommandDto,
    actor: RequestStaff,
    requestId: string,
    from: 'DRAFT' | Array<'DRAFT' | 'ORDERED'>,
    to: 'ORDERED' | 'CANCELED',
  ) {
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.purchaseOrder.updateMany({
        where: {
          id,
          businessId: actor.businessId,
          version: dto.version,
          status: Array.isArray(from) ? { in: from } : from,
        },
        data: {
          status: to,
          version: { increment: 1 },
          ...(to === 'ORDERED' ? { orderedAt: new Date() } : { canceledAt: new Date() }),
        },
      });
      if (updated.count !== 1) {
        const current = await tx.purchaseOrder.findFirst({
          where: { id, businessId: actor.businessId },
          select: { status: true, version: true },
        });
        if (!current) {
          throw new ProblemException(404, 'RESOURCE_NOT_FOUND', 'Không tìm thấy đơn mua.');
        }
        throw new ProblemException(
          409,
          current.version !== dto.version ? 'VERSION_CONFLICT' : 'INVALID_STATUS_TRANSITION',
          current.version !== dto.version
            ? 'Đơn mua đã được cập nhật ở nơi khác.'
            : 'Trạng thái đơn mua không cho phép thao tác này.',
        );
      }
      await tx.auditLog.create({
        data: {
          businessId: actor.businessId,
          actorId: actor.id,
          action:
            to === 'ORDERED'
              ? 'purchasing.purchase_order.order'
              : 'purchasing.purchase_order.cancel',
          entityType: 'PurchaseOrder',
          entityId: id,
          requestId,
          metadata: { previousVersion: dto.version, status: to },
        },
      });
    });
  }
}
