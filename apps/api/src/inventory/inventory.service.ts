import { Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { ProblemException } from '../common/problem.exception';
import type { RequestStaff } from '../common/request-context';
import { Prisma } from '../generated/prisma/client';
import { PERMISSIONS } from '../identity/permissions';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateGoodsReceiptDto, InventoryListQueryDto } from './dto/inventory.dto';

const MAX_QUANTITY_OR_AVERAGE_COST = new Prisma.Decimal('100000000000000');
const MAX_MONEY = new Prisma.Decimal('100000000000000000000');
const SERIALIZABLE_RETRIES = 3;

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  private receiptNumber() {
    const day = new Date().toISOString().slice(0, 10).replaceAll('-', '');
    return `GR-${day}-${randomUUID().slice(0, 8).toUpperCase()}`;
  }

  private canViewCost(actor: RequestStaff) {
    return actor.permissions.includes(PERMISSIONS.COST_VIEW);
  }

  private validateIdempotencyKey(value?: string) {
    const key = value?.trim();
    if (!key || !/^[A-Za-z0-9._:-]{8,100}$/.test(key)) {
      throw new ProblemException(
        400,
        'IDEMPOTENCY_KEY_REQUIRED',
        'Idempotency-Key phải có 8–100 ký tự an toàn.',
      );
    }
    return key;
  }

  private requestHash(dto: CreateGoodsReceiptDto) {
    const canonical = {
      purchaseOrderId: dto.purchaseOrderId,
      warehouseId: dto.warehouseId,
      notes: dto.notes?.trim() || null,
      lines: dto.lines.map((line) => ({
        purchaseOrderLineId: line.purchaseOrderLineId,
        receivedQuantity: line.receivedQuantity,
        actualUnitCostVnd: line.actualUnitCostVnd,
      })),
    };
    return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
  }

  private ensureSameRequest(existingHash: string, requestHash: string) {
    if (existingHash !== requestHash) {
      throw new ProblemException(
        409,
        'IDEMPOTENCY_KEY_REUSED',
        'Idempotency-Key đã được dùng cho nội dung nhận hàng khác.',
      );
    }
  }

  private withoutReceiptCosts<T extends { lines: Array<Record<string, unknown>> }>(receipt: T) {
    return {
      ...receipt,
      lines: receipt.lines.map(({ actualUnitCostVnd, lineValueVnd, ...line }) => {
        void actualUnitCostVnd;
        void lineValueVnd;
        return line;
      }),
    };
  }

  private async getReceipt(id: string, actor: RequestStaff) {
    const receipt = await this.prisma.goodsReceipt.findFirstOrThrow({
      where: { id, businessId: actor.businessId },
      select: {
        id: true,
        receiptNumber: true,
        status: true,
        receivedAt: true,
        notes: true,
        createdAt: true,
        warehouse: { select: { id: true, code: true, name: true } },
        purchaseOrder: {
          select: {
            id: true,
            orderNumber: true,
            status: true,
            supplier: { select: { id: true, supplierCode: true, name: true } },
          },
        },
        createdBy: { select: { id: true, displayName: true } },
        lines: {
          orderBy: { lineNumber: 'asc' },
          select: {
            id: true,
            purchaseOrderLineId: true,
            lineNumber: true,
            productNameSnapshot: true,
            skuSnapshot: true,
            variantNameSnapshot: true,
            unitCodeSnapshot: true,
            unitNameSnapshot: true,
            conversionFactorSnapshot: true,
            receivedQuantity: true,
            baseQuantity: true,
            actualUnitCostVnd: true,
            lineValueVnd: true,
          },
        },
      },
    });
    return this.canViewCost(actor) ? receipt : this.withoutReceiptCosts(receipt);
  }

  listWarehouses(businessId: string) {
    return this.prisma.warehouse.findMany({
      where: { businessId, status: 'ACTIVE' },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      select: { id: true, code: true, name: true, status: true },
    });
  }

  async listBalances(actor: RequestStaff, query: InventoryListQueryDto) {
    const search = query.query?.trim();
    const balances = await this.prisma.stockBalance.findMany({
      where: {
        businessId: actor.businessId,
        ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}),
        ...(search
          ? {
              variant: {
                OR: [
                  { sku: { contains: search.toUpperCase(), mode: 'insensitive' as const } },
                  { name: { contains: search, mode: 'insensitive' as const } },
                  { product: { name: { contains: search, mode: 'insensitive' as const } } },
                ],
              },
            }
          : {}),
      },
      take: query.limit,
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        onHandQuantity: true,
        reservedQuantity: true,
        unavailableQuantity: true,
        averageCostVnd: true,
        version: true,
        updatedAt: true,
        warehouse: { select: { id: true, code: true, name: true } },
        variant: {
          select: {
            id: true,
            sku: true,
            name: true,
            baseUnitCode: true,
            baseUnitName: true,
            product: { select: { id: true, name: true } },
          },
        },
      },
    });
    return balances.map((balance) => {
      const availableQuantity = balance.onHandQuantity
        .sub(balance.reservedQuantity)
        .sub(balance.unavailableQuantity);
      if (this.canViewCost(actor)) return { ...balance, availableQuantity };
      const { averageCostVnd, ...safe } = balance;
      void averageCostVnd;
      return { ...safe, availableQuantity };
    });
  }

  async listMovements(actor: RequestStaff, query: InventoryListQueryDto) {
    const search = query.query?.trim();
    const rows = await this.prisma.stockMovement.findMany({
      where: {
        businessId: actor.businessId,
        ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}),
        ...(search
          ? {
              OR: [
                { variant: { sku: { contains: search.toUpperCase(), mode: 'insensitive' } } },
                {
                  goodsReceiptLine: {
                    goodsReceipt: {
                      receiptNumber: { contains: search.toUpperCase(), mode: 'insensitive' },
                    },
                  },
                },
                {
                  openingStock: {
                    documentNumber: { contains: search.toUpperCase(), mode: 'insensitive' },
                  },
                },
                {
                  stockAdjustment: {
                    documentNumber: { contains: search.toUpperCase(), mode: 'insensitive' },
                  },
                },
              ],
            }
          : {}),
      },
      take: query.limit,
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        type: true,
        quantityDelta: true,
        valueDeltaVnd: true,
        onHandAfter: true,
        averageCostAfterVnd: true,
        occurredAt: true,
        warehouse: { select: { id: true, code: true, name: true } },
        variant: { select: { id: true, sku: true, name: true, baseUnitName: true } },
        goodsReceiptLine: {
          select: {
            goodsReceipt: {
              select: {
                id: true,
                receiptNumber: true,
                purchaseOrder: { select: { id: true, orderNumber: true } },
              },
            },
          },
        },
        openingStock: { select: { id: true, documentNumber: true } },
        stockAdjustment: { select: { id: true, documentNumber: true } },
      },
    });
    if (this.canViewCost(actor)) return rows;
    return rows.map(({ valueDeltaVnd, averageCostAfterVnd, ...row }) => {
      void valueDeltaVnd;
      void averageCostAfterVnd;
      return row;
    });
  }

  async listReceipts(actor: RequestStaff, query: InventoryListQueryDto) {
    const search = query.query?.trim();
    const rows = await this.prisma.goodsReceipt.findMany({
      where: {
        businessId: actor.businessId,
        ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}),
        ...(search
          ? {
              OR: [
                { receiptNumber: { contains: search.toUpperCase(), mode: 'insensitive' } },
                {
                  purchaseOrder: {
                    orderNumber: { contains: search.toUpperCase(), mode: 'insensitive' },
                  },
                },
              ],
            }
          : {}),
      },
      take: query.limit,
      orderBy: [{ receivedAt: 'desc' }, { id: 'desc' }],
      select: { id: true },
    });
    return Promise.all(rows.map(({ id }) => this.getReceipt(id, actor)));
  }

  async createReceipt(
    dto: CreateGoodsReceiptDto,
    rawIdempotencyKey: string | undefined,
    actor: RequestStaff,
    requestId: string,
  ) {
    const idempotencyKey = this.validateIdempotencyKey(rawIdempotencyKey);
    const requestHash = this.requestHash(dto);
    const existing = await this.prisma.goodsReceipt.findUnique({
      where: {
        businessId_idempotencyKey: { businessId: actor.businessId, idempotencyKey },
      },
      select: { id: true, requestHash: true },
    });
    if (existing) {
      this.ensureSameRequest(existing.requestHash, requestHash);
      return this.getReceipt(existing.id, actor);
    }

    const receivedAt = new Date();

    let lastError: unknown;
    for (let attempt = 0; attempt < SERIALIZABLE_RETRIES; attempt += 1) {
      try {
        const receiptId = await this.prisma.$transaction(
          async (tx) => {
            const warehouse = await tx.warehouse.findFirst({
              where: { id: dto.warehouseId, businessId: actor.businessId, status: 'ACTIVE' },
              select: { id: true },
            });
            if (!warehouse) {
              throw new ProblemException(
                422,
                'ACTIVE_WAREHOUSE_REQUIRED',
                'Kho không tồn tại hoặc đã ngừng hoạt động.',
              );
            }

            const purchaseOrder = await tx.purchaseOrder.findFirst({
              where: { id: dto.purchaseOrderId, businessId: actor.businessId },
              select: {
                id: true,
                version: true,
                status: true,
                lines: {
                  orderBy: { lineNumber: 'asc' },
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
                    receiptLines: { select: { receivedQuantity: true } },
                  },
                },
              },
            });
            if (!purchaseOrder) {
              throw new ProblemException(404, 'RESOURCE_NOT_FOUND', 'Không tìm thấy đơn mua.');
            }
            if (!['ORDERED', 'PARTIALLY_RECEIVED'].includes(purchaseOrder.status)) {
              throw new ProblemException(
                409,
                'PURCHASE_ORDER_NOT_RECEIVABLE',
                'Chỉ đơn mua đã phát hành và còn số lượng chưa nhận mới được nhập kho.',
              );
            }

            const byLineId = new Map(purchaseOrder.lines.map((line) => [line.id, line]));
            const seen = new Set<string>();
            const prepared = dto.lines.map((input, index) => {
              if (seen.has(input.purchaseOrderLineId)) {
                throw new ProblemException(
                  422,
                  'DUPLICATE_RECEIPT_LINE',
                  'Một dòng đơn mua chỉ được xuất hiện một lần trong phiếu nhận.',
                );
              }
              seen.add(input.purchaseOrderLineId);
              const orderLine = byLineId.get(input.purchaseOrderLineId);
              if (!orderLine) {
                throw new ProblemException(
                  422,
                  'PURCHASE_ORDER_LINE_REQUIRED',
                  'Dòng nhận hàng không thuộc đơn mua đã chọn.',
                );
              }
              const quantity = new Prisma.Decimal(input.receivedQuantity);
              const receivedBefore = orderLine.receiptLines.reduce(
                (sum, line) => sum.add(line.receivedQuantity),
                new Prisma.Decimal(0),
              );
              if (receivedBefore.add(quantity).greaterThan(orderLine.orderedQuantity)) {
                throw new ProblemException(
                  422,
                  'PURCHASE_QUANTITY_EXCEEDED',
                  `Số lượng nhận của SKU ${orderLine.skuSnapshot} vượt số lượng còn lại.`,
                );
              }
              const baseQuantity = quantity.mul(orderLine.conversionFactorSnapshot);
              if (
                baseQuantity.decimalPlaces() > 6 ||
                baseQuantity.greaterThanOrEqualTo(MAX_QUANTITY_OR_AVERAGE_COST)
              ) {
                throw new ProblemException(
                  422,
                  'BASE_QUANTITY_PRECISION_EXCEEDED',
                  'Số lượng quy đổi vượt độ chính xác hoặc giới hạn lưu trữ của kho.',
                );
              }
              const unitCost = new Prisma.Decimal(input.actualUnitCostVnd);
              const lineValue = quantity.mul(unitCost);
              if (lineValue.decimalPlaces() !== 0 || lineValue.greaterThanOrEqualTo(MAX_MONEY)) {
                throw new ProblemException(
                  422,
                  'LINE_VALUE_INVALID',
                  'Thành tiền nhận hàng phải là số nguyên VND trong giới hạn lưu trữ.',
                );
              }
              return {
                id: randomUUID(),
                purchaseOrderLineId: orderLine.id,
                variantId: orderLine.variantId,
                lineNumber: index + 1,
                productNameSnapshot: orderLine.productNameSnapshot,
                skuSnapshot: orderLine.skuSnapshot,
                variantNameSnapshot: orderLine.variantNameSnapshot,
                unitCodeSnapshot: orderLine.unitCodeSnapshot,
                unitNameSnapshot: orderLine.unitNameSnapshot,
                conversionFactorSnapshot: orderLine.conversionFactorSnapshot,
                receivedQuantity: quantity,
                baseQuantity,
                actualUnitCostVnd: unitCost,
                lineValueVnd: lineValue,
              };
            });

            const id = randomUUID();
            const receiptNumber = this.receiptNumber();
            await tx.goodsReceipt.create({
              data: {
                id,
                businessId: actor.businessId,
                warehouseId: warehouse.id,
                purchaseOrderId: purchaseOrder.id,
                receiptNumber,
                idempotencyKey,
                requestHash,
                receivedAt,
                notes: dto.notes?.trim() || null,
                createdById: actor.id,
              },
            });

            for (const line of prepared) {
              await tx.goodsReceiptLine.create({
                data: { ...line, goodsReceiptId: id },
              });
              const current = await tx.stockBalance.findUnique({
                where: {
                  businessId_warehouseId_variantId: {
                    businessId: actor.businessId,
                    warehouseId: warehouse.id,
                    variantId: line.variantId,
                  },
                },
              });
              const previousQuantity = current?.onHandQuantity ?? new Prisma.Decimal(0);
              const previousCost = current?.averageCostVnd ?? new Prisma.Decimal(0);
              const newQuantity = previousQuantity.add(line.baseQuantity);
              if (newQuantity.greaterThanOrEqualTo(MAX_QUANTITY_OR_AVERAGE_COST)) {
                throw new ProblemException(
                  422,
                  'STOCK_QUANTITY_LIMIT_EXCEEDED',
                  'Số lượng tồn vượt giới hạn lưu trữ.',
                );
              }
              const newAverageCost = previousQuantity
                .mul(previousCost)
                .add(line.lineValueVnd)
                .div(newQuantity)
                .toDecimalPlaces(6);
              if (newAverageCost.greaterThanOrEqualTo(MAX_QUANTITY_OR_AVERAGE_COST)) {
                throw new ProblemException(
                  422,
                  'AVERAGE_COST_LIMIT_EXCEEDED',
                  'Giá vốn bình quân vượt giới hạn lưu trữ.',
                );
              }

              if (current) {
                const updated = await tx.stockBalance.updateMany({
                  where: { id: current.id, version: current.version },
                  data: {
                    onHandQuantity: newQuantity,
                    averageCostVnd: newAverageCost,
                    version: { increment: 1 },
                  },
                });
                if (updated.count !== 1) throw new Error('SERIALIZABLE_STOCK_CONFLICT');
              } else {
                await tx.stockBalance.create({
                  data: {
                    businessId: actor.businessId,
                    warehouseId: warehouse.id,
                    variantId: line.variantId,
                    onHandQuantity: newQuantity,
                    averageCostVnd: newAverageCost,
                  },
                });
              }
              await tx.stockMovement.create({
                data: {
                  businessId: actor.businessId,
                  warehouseId: warehouse.id,
                  variantId: line.variantId,
                  goodsReceiptLineId: line.id,
                  movementKey: `${idempotencyKey}:${line.purchaseOrderLineId}`,
                  type: 'PURCHASE_RECEIPT',
                  quantityDelta: line.baseQuantity,
                  valueDeltaVnd: line.lineValueVnd,
                  onHandAfter: newQuantity,
                  averageCostAfterVnd: newAverageCost,
                  occurredAt: receivedAt,
                },
              });
            }

            const incomingByLine = new Map(
              prepared.map((line) => [line.purchaseOrderLineId, line.receivedQuantity]),
            );
            const complete = purchaseOrder.lines.every((line) => {
              const before = line.receiptLines.reduce(
                (sum, receiptLine) => sum.add(receiptLine.receivedQuantity),
                new Prisma.Decimal(0),
              );
              return before
                .add(incomingByLine.get(line.id) ?? new Prisma.Decimal(0))
                .equals(line.orderedQuantity);
            });
            const statusUpdate = await tx.purchaseOrder.updateMany({
              where: {
                id: purchaseOrder.id,
                businessId: actor.businessId,
                version: purchaseOrder.version,
                status: { in: ['ORDERED', 'PARTIALLY_RECEIVED'] },
              },
              data: {
                status: complete ? 'RECEIVED' : 'PARTIALLY_RECEIVED',
                version: { increment: 1 },
              },
            });
            if (statusUpdate.count !== 1) throw new Error('SERIALIZABLE_ORDER_CONFLICT');

            await tx.auditLog.create({
              data: {
                businessId: actor.businessId,
                actorId: actor.id,
                action: 'inventory.goods_receipt.post',
                entityType: 'GoodsReceipt',
                entityId: id,
                requestId,
                metadata: {
                  receiptNumber,
                  purchaseOrderId: purchaseOrder.id,
                  warehouseId: warehouse.id,
                  idempotencyKey,
                  lineCount: prepared.length,
                },
              },
            });
            return id;
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
        return this.getReceipt(receiptId, actor);
      } catch (error) {
        lastError = error;
        const code =
          typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
        const retryable =
          code === 'P2034' ||
          (code === 'P2002' && attempt < SERIALIZABLE_RETRIES - 1) ||
          (error instanceof Error && error.message.startsWith('SERIALIZABLE_'));
        if (!retryable || attempt === SERIALIZABLE_RETRIES - 1) break;
      }
    }

    const duplicate = await this.prisma.goodsReceipt.findUnique({
      where: {
        businessId_idempotencyKey: { businessId: actor.businessId, idempotencyKey },
      },
      select: { id: true, requestHash: true },
    });
    if (duplicate) {
      this.ensureSameRequest(duplicate.requestHash, requestHash);
      return this.getReceipt(duplicate.id, actor);
    }
    if (lastError instanceof ProblemException) throw lastError;
    throw new ProblemException(
      409,
      'INVENTORY_CONFLICT',
      'Tồn kho vừa được cập nhật ở nơi khác. Vui lòng tải lại và thử lại.',
      undefined,
      true,
    );
  }
}
