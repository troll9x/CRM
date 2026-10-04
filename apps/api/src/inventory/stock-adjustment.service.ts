import { Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { ProblemException } from '../common/problem.exception';
import type { RequestStaff } from '../common/request-context';
import { Prisma } from '../generated/prisma/client';
import { PERMISSIONS } from '../identity/permissions';
import { PrismaService } from '../prisma/prisma.service';
import type { InventoryListQueryDto } from './dto/inventory.dto';
import type { CreateStockAdjustmentDto } from './dto/stock-adjustment.dto';

const MAX_QUANTITY_OR_COST = new Prisma.Decimal('100000000000000');
const MAX_MONEY = new Prisma.Decimal('100000000000000000000');
const SERIALIZABLE_RETRIES = 3;

@Injectable()
export class StockAdjustmentService {
  constructor(private readonly prisma: PrismaService) {}

  private canViewCost(actor: RequestStaff) {
    return actor.permissions.includes(PERMISSIONS.COST_VIEW);
  }

  private documentNumber() {
    const day = new Date().toISOString().slice(0, 10).replaceAll('-', '');
    return `SA-${day}-${randomUUID().slice(0, 8).toUpperCase()}`;
  }

  private async get(id: string, actor: RequestStaff) {
    const adjustment = await this.prisma.stockAdjustment.findFirstOrThrow({
      where: { id, businessId: actor.businessId },
      select: {
        id: true,
        documentNumber: true,
        warehouseId: true,
        skuSnapshot: true,
        productNameSnapshot: true,
        variantNameSnapshot: true,
        unitCodeSnapshot: true,
        unitNameSnapshot: true,
        systemQuantity: true,
        countedQuantity: true,
        quantityDelta: true,
        valuationCostVnd: true,
        valueDeltaVnd: true,
        reasonCode: true,
        notes: true,
        postedAt: true,
        warehouse: { select: { id: true, code: true, name: true } },
        createdBy: { select: { id: true, displayName: true } },
        stockMovement: { select: { id: true } },
      },
    });
    if (this.canViewCost(actor)) return adjustment;
    const { valuationCostVnd, valueDeltaVnd, ...visible } = adjustment;
    void valuationCostVnd;
    void valueDeltaVnd;
    return visible;
  }

  async list(actor: RequestStaff, query: InventoryListQueryDto) {
    const search = query.query?.trim();
    const rows = await this.prisma.stockAdjustment.findMany({
      where: {
        businessId: actor.businessId,
        ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}),
        ...(search
          ? {
              OR: [
                { documentNumber: { contains: search.toUpperCase(), mode: 'insensitive' } },
                { skuSnapshot: { contains: search.toUpperCase(), mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      take: query.limit,
      orderBy: [{ postedAt: 'desc' }, { id: 'desc' }],
      select: { id: true },
    });
    return Promise.all(rows.map(({ id }) => this.get(id, actor)));
  }

  async create(
    dto: CreateStockAdjustmentDto,
    rawIdempotencyKey: string | undefined,
    actor: RequestStaff,
    requestId: string,
  ) {
    const idempotencyKey = rawIdempotencyKey?.trim();
    if (!idempotencyKey || !/^[A-Za-z0-9._:-]{8,100}$/.test(idempotencyKey)) {
      throw new ProblemException(
        400,
        'IDEMPOTENCY_KEY_REQUIRED',
        'Idempotency-Key phải có 8–100 ký tự an toàn.',
      );
    }
    const canonical = {
      warehouseId: dto.warehouseId,
      variantId: dto.variantId,
      expectedVersion: dto.expectedVersion,
      countedQuantity: dto.countedQuantity,
      reasonCode: dto.reasonCode,
      notes: dto.notes?.trim() || null,
    };
    const requestHash = createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
    const existing = await this.prisma.stockAdjustment.findUnique({
      where: { businessId_idempotencyKey: { businessId: actor.businessId, idempotencyKey } },
      select: { id: true, requestHash: true },
    });
    if (existing) {
      if (existing.requestHash !== requestHash) {
        throw new ProblemException(
          409,
          'IDEMPOTENCY_KEY_REUSED',
          'Idempotency-Key đã được dùng cho nội dung kiểm kê khác.',
        );
      }
      return this.get(existing.id, actor);
    }

    const countedQuantity = new Prisma.Decimal(dto.countedQuantity);
    if (countedQuantity.greaterThanOrEqualTo(MAX_QUANTITY_OR_COST)) {
      throw new ProblemException(422, 'STOCK_QUANTITY_LIMIT_EXCEEDED', 'Số lượng kiểm kê quá lớn.');
    }

    let lastError: unknown;
    for (let attempt = 0; attempt < SERIALIZABLE_RETRIES; attempt += 1) {
      try {
        const id = await this.prisma.$transaction(
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
            const variant = await tx.productVariant.findFirst({
              where: { id: dto.variantId, businessId: actor.businessId },
              select: {
                id: true,
                sku: true,
                name: true,
                baseUnitCode: true,
                baseUnitName: true,
                product: { select: { name: true } },
              },
            });
            if (!variant) {
              throw new ProblemException(
                404,
                'RESOURCE_NOT_FOUND',
                'Không tìm thấy SKU trong đơn vị này.',
              );
            }
            const balance = await tx.stockBalance.findUnique({
              where: {
                businessId_warehouseId_variantId: {
                  businessId: actor.businessId,
                  warehouseId: warehouse.id,
                  variantId: variant.id,
                },
              },
            });
            if (!balance) {
              throw new ProblemException(
                409,
                'STOCK_BALANCE_NOT_FOUND',
                'SKU chưa có tồn hệ thống; hãy ghi tồn đầu kỳ trước khi kiểm kê.',
              );
            }
            if (balance.version !== dto.expectedVersion) {
              throw new ProblemException(
                409,
                'STOCK_CHANGED_RECOUNT_REQUIRED',
                'Tồn kho đã đổi sau khi mở màn hình. Hãy tải lại và kiểm đếm lại SKU này.',
                undefined,
                true,
              );
            }

            const systemQuantity = balance.onHandQuantity;
            const quantityDelta = countedQuantity.sub(systemQuantity);
            const committedQuantity = balance.reservedQuantity.add(balance.unavailableQuantity);
            if (countedQuantity.lessThan(committedQuantity)) {
              throw new ProblemException(
                422,
                'COUNT_BELOW_COMMITTED_QUANTITY',
                'Số đếm thấp hơn lượng đang giữ hoặc không đủ điều kiện bán. Hãy xử lý phần đã cam kết trước.',
              );
            }
            if (
              (dto.reasonCode === 'DAMAGE' || dto.reasonCode === 'LOSS') &&
              !quantityDelta.isNegative()
            ) {
              throw new ProblemException(
                422,
                'ADJUSTMENT_REASON_MISMATCH',
                'Lý do hư hỏng hoặc thất thoát yêu cầu số đếm thấp hơn tồn hệ thống.',
              );
            }
            if (dto.reasonCode === 'FOUND' && !quantityDelta.isPositive()) {
              throw new ProblemException(
                422,
                'ADJUSTMENT_REASON_MISMATCH',
                'Lý do tìm thấy hàng yêu cầu số đếm cao hơn tồn hệ thống.',
              );
            }

            const valuationCostVnd = balance.averageCostVnd;
            const valueDeltaVnd = quantityDelta
              .mul(valuationCostVnd)
              .toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP);
            if (valueDeltaVnd.abs().greaterThanOrEqualTo(MAX_MONEY)) {
              throw new ProblemException(
                422,
                'ADJUSTMENT_VALUE_LIMIT_EXCEEDED',
                'Giá trị chênh lệch vượt giới hạn lưu trữ.',
              );
            }
            const resultingValue = systemQuantity.mul(valuationCostVnd).add(valueDeltaVnd);
            const averageCostAfter = countedQuantity.isZero()
              ? new Prisma.Decimal(0)
              : quantityDelta.isPositive()
                ? resultingValue.div(countedQuantity).toDecimalPlaces(6)
                : valuationCostVnd;
            if (averageCostAfter.greaterThanOrEqualTo(MAX_QUANTITY_OR_COST)) {
              throw new ProblemException(
                422,
                'AVERAGE_COST_LIMIT_EXCEEDED',
                'Giá vốn bình quân vượt giới hạn lưu trữ.',
              );
            }

            const id = randomUUID();
            const documentNumber = this.documentNumber();
            const postedAt = new Date();
            await tx.stockAdjustment.create({
              data: {
                id,
                businessId: actor.businessId,
                warehouseId: warehouse.id,
                variantId: variant.id,
                documentNumber,
                idempotencyKey,
                requestHash,
                skuSnapshot: variant.sku,
                productNameSnapshot: variant.product.name,
                variantNameSnapshot: variant.name,
                unitCodeSnapshot: variant.baseUnitCode,
                unitNameSnapshot: variant.baseUnitName,
                systemQuantity,
                countedQuantity,
                quantityDelta,
                valuationCostVnd,
                valueDeltaVnd,
                reasonCode: dto.reasonCode,
                notes: dto.notes?.trim() || null,
                postedAt,
                createdById: actor.id,
              },
            });

            const updated = await tx.stockBalance.updateMany({
              where: { id: balance.id, version: dto.expectedVersion },
              data: {
                onHandQuantity: countedQuantity,
                averageCostVnd: averageCostAfter,
                version: { increment: 1 },
              },
            });
            if (updated.count !== 1) {
              throw new ProblemException(
                409,
                'STOCK_CHANGED_RECOUNT_REQUIRED',
                'Tồn kho vừa thay đổi. Hãy tải lại và kiểm đếm lại SKU này.',
                undefined,
                true,
              );
            }

            if (!quantityDelta.isZero()) {
              await tx.stockMovement.create({
                data: {
                  businessId: actor.businessId,
                  warehouseId: warehouse.id,
                  variantId: variant.id,
                  stockAdjustmentId: id,
                  movementKey: `adjustment:${idempotencyKey}`,
                  type: 'STOCK_ADJUSTMENT',
                  quantityDelta,
                  valueDeltaVnd,
                  onHandAfter: countedQuantity,
                  averageCostAfterVnd: averageCostAfter,
                  occurredAt: postedAt,
                },
              });
            }

            await tx.auditLog.create({
              data: {
                businessId: actor.businessId,
                actorId: actor.id,
                action: 'inventory.stock_adjustment.post',
                entityType: 'StockAdjustment',
                entityId: id,
                requestId,
                metadata: {
                  documentNumber,
                  warehouseId: warehouse.id,
                  variantId: variant.id,
                  expectedVersion: dto.expectedVersion,
                  reasonCode: dto.reasonCode,
                  idempotencyKey,
                },
              },
            });
            return id;
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
        return this.get(id, actor);
      } catch (error) {
        lastError = error;
        const code =
          typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
        if (
          attempt < SERIALIZABLE_RETRIES - 1 &&
          (code === 'P2034' ||
            code === 'P2002' ||
            (error instanceof Error && error.message.startsWith('SERIALIZABLE_')))
        ) {
          continue;
        }
        break;
      }
    }

    const duplicate = await this.prisma.stockAdjustment.findUnique({
      where: { businessId_idempotencyKey: { businessId: actor.businessId, idempotencyKey } },
      select: { id: true, requestHash: true },
    });
    if (duplicate) {
      if (duplicate.requestHash !== requestHash) {
        throw new ProblemException(
          409,
          'IDEMPOTENCY_KEY_REUSED',
          'Idempotency-Key đã được dùng cho nội dung kiểm kê khác.',
        );
      }
      return this.get(duplicate.id, actor);
    }
    if (lastError instanceof ProblemException) throw lastError;
    throw new ProblemException(
      409,
      'INVENTORY_CONFLICT',
      'Tồn kho vừa được cập nhật ở nơi khác. Hãy tải lại và thử lại.',
      undefined,
      true,
    );
  }
}
