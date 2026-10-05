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
const RETRIES = 3;

@Injectable()
export class StockAdjustmentService {
  constructor(private readonly prisma: PrismaService) {}

  private canViewCost(actor: RequestStaff) {
    return actor.permissions.includes(PERMISSIONS.COST_VIEW);
  }

  private validateKey(value?: string) {
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

  private hash(dto: CreateStockAdjustmentDto) {
    return createHash('sha256')
      .update(
        JSON.stringify({
          warehouseId: dto.warehouseId,
          variantId: dto.variantId,
          expectedVersion: dto.expectedVersion,
          countedQuantity: dto.countedQuantity,
          reason: dto.reason.trim(),
          unitCostVnd: dto.unitCostVnd ?? null,
          notes: dto.notes?.trim() || null,
        }),
      )
      .digest('hex');
  }

  private ensureSameRequest(existingHash: string, requestHash: string) {
    if (existingHash !== requestHash) {
      throw new ProblemException(
        409,
        'IDEMPOTENCY_KEY_REUSED',
        'Idempotency-Key đã được dùng cho chứng từ điều chỉnh khác.',
      );
    }
  }

  private async get(id: string, actor: RequestStaff) {
    const row = await this.prisma.stockAdjustment.findFirstOrThrow({
      where: { id, businessId: actor.businessId },
      select: {
        id: true,
        documentNumber: true,
        status: true,
        skuSnapshot: true,
        productNameSnapshot: true,
        variantNameSnapshot: true,
        unitCodeSnapshot: true,
        unitNameSnapshot: true,
        systemQuantity: true,
        countedQuantity: true,
        quantityDelta: true,
        unitCostVnd: true,
        valueDeltaVnd: true,
        averageCostAfterVnd: true,
        reason: true,
        notes: true,
        postedAt: true,
        warehouse: { select: { id: true, code: true, name: true } },
        createdBy: { select: { id: true, displayName: true } },
      },
    });
    if (this.canViewCost(actor)) return row;
    const { unitCostVnd, valueDeltaVnd, averageCostAfterVnd, ...safe } = row;
    void unitCostVnd;
    void valueDeltaVnd;
    void averageCostAfterVnd;
    return safe;
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
    rawKey: string | undefined,
    actor: RequestStaff,
    requestId: string,
  ) {
    const key = this.validateKey(rawKey);
    const requestHash = this.hash(dto);
    const existing = await this.prisma.stockAdjustment.findUnique({
      where: { businessId_idempotencyKey: { businessId: actor.businessId, idempotencyKey: key } },
      select: { id: true, requestHash: true },
    });
    if (existing) {
      this.ensureSameRequest(existing.requestHash, requestHash);
      return this.get(existing.id, actor);
    }

    const counted = new Prisma.Decimal(dto.countedQuantity);
    if (counted.greaterThanOrEqualTo(MAX_QUANTITY_OR_COST)) {
      throw new ProblemException(
        422,
        'STOCK_QUANTITY_LIMIT_EXCEEDED',
        'Số lượng kiểm kê vượt giới hạn.',
      );
    }
    const reason = dto.reason.trim();
    if (!reason)
      throw new ProblemException(422, 'ADJUSTMENT_REASON_REQUIRED', 'Cần nhập lý do điều chỉnh.');

    let lastError: unknown;
    for (let attempt = 0; attempt < RETRIES; attempt += 1) {
      try {
        const id = await this.prisma.$transaction(
          async (tx) => {
            const warehouse = await tx.warehouse.findFirst({
              where: { id: dto.warehouseId, businessId: actor.businessId, status: 'ACTIVE' },
              select: { id: true },
            });
            if (!warehouse)
              throw new ProblemException(
                422,
                'ACTIVE_WAREHOUSE_REQUIRED',
                'Kho không tồn tại hoặc đã ngừng hoạt động.',
              );
            const variant = await tx.productVariant.findFirst({
              where: {
                id: dto.variantId,
                businessId: actor.businessId,
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
              },
            });
            if (!variant)
              throw new ProblemException(
                422,
                'ACTIVE_VARIANT_REQUIRED',
                'SKU không tồn tại hoặc đã ngừng bán.',
              );
            const balance = await tx.stockBalance.findUnique({
              where: {
                businessId_warehouseId_variantId: {
                  businessId: actor.businessId,
                  warehouseId: warehouse.id,
                  variantId: variant.id,
                },
              },
            });
            if (!balance)
              throw new ProblemException(
                409,
                'STOCK_BALANCE_REQUIRED',
                'SKU chưa có số dư kho; hãy dùng chứng từ tồn đầu hoặc phiếu nhận hàng.',
              );
            if (balance.version !== dto.expectedVersion)
              throw new ProblemException(
                409,
                'STOCK_VERSION_CONFLICT',
                'Tồn kho đã thay đổi sau khi mở màn kiểm kê. Tải lại số tồn rồi kiểm đếm lại.',
                undefined,
                true,
              );

            const delta = counted.sub(balance.onHandQuantity);
            if (delta.isZero())
              throw new ProblemException(
                422,
                'NO_STOCK_DIFFERENCE',
                'Số đếm bằng số tồn hệ thống; không cần lập chứng từ điều chỉnh.',
              );
            const protectedQuantity = balance.reservedQuantity.add(balance.unavailableQuantity);
            if (counted.lessThan(protectedQuantity))
              throw new ProblemException(
                409,
                'STOCK_BELOW_PROTECTED_QUANTITY',
                'Số đếm thấp hơn lượng đang giữ hoặc không đủ điều kiện bán.',
              );

            let adjustmentCost: Prisma.Decimal | null = null;
            let valueDelta: Prisma.Decimal;
            const currentValue = balance.onHandQuantity
              .mul(balance.averageCostVnd)
              .toDecimalPlaces(0);
            if (delta.greaterThan(0)) {
              if (balance.onHandQuantity.isZero()) {
                if (!dto.unitCostVnd)
                  throw new ProblemException(
                    422,
                    'ADJUSTMENT_COST_REQUIRED',
                    'Khi tăng tồn từ 0, cần nhập giá vốn đơn vị có căn cứ.',
                  );
                adjustmentCost = new Prisma.Decimal(dto.unitCostVnd);
                if (adjustmentCost.greaterThanOrEqualTo(MAX_QUANTITY_OR_COST))
                  throw new ProblemException(
                    422,
                    'AVERAGE_COST_LIMIT_EXCEEDED',
                    'Giá vốn vượt giới hạn.',
                  );
              } else {
                if (dto.unitCostVnd !== undefined)
                  throw new ProblemException(
                    422,
                    'ADJUSTMENT_COST_NOT_ALLOWED',
                    'Khi tồn hiện tại lớn hơn 0, phần tăng dùng giá vốn bình quân hiện tại.',
                  );
                adjustmentCost = balance.averageCostVnd;
              }
              valueDelta = delta.mul(adjustmentCost).toDecimalPlaces(0);
            } else {
              if (dto.unitCostVnd !== undefined)
                throw new ProblemException(
                  422,
                  'ADJUSTMENT_COST_NOT_ALLOWED',
                  'Giảm tồn dùng giá vốn bình quân hiện tại.',
                );
              valueDelta = delta.mul(balance.averageCostVnd).toDecimalPlaces(0);
            }
            const newValue = currentValue.add(valueDelta);
            if (newValue.isNegative() || newValue.greaterThanOrEqualTo(MAX_MONEY))
              throw new ProblemException(
                422,
                'ADJUSTMENT_VALUE_INVALID',
                'Giá trị tồn sau điều chỉnh vượt giới hạn.',
              );
            const averageCost = counted.isZero()
              ? new Prisma.Decimal(0)
              : newValue.div(counted).toDecimalPlaces(6);
            if (averageCost.greaterThanOrEqualTo(MAX_QUANTITY_OR_COST))
              throw new ProblemException(
                422,
                'AVERAGE_COST_LIMIT_EXCEEDED',
                'Giá vốn bình quân vượt giới hạn.',
              );

            const postedAt = new Date();
            const docId = randomUUID();
            const documentNumber = `SA-${postedAt.toISOString().slice(0, 10).replaceAll('-', '')}-${randomUUID().slice(0, 8).toUpperCase()}`;
            const update = await tx.stockBalance.updateMany({
              where: { id: balance.id, version: dto.expectedVersion },
              data: {
                onHandQuantity: counted,
                averageCostVnd: averageCost,
                version: { increment: 1 },
              },
            });
            if (update.count !== 1) throw new Error('SERIALIZABLE_STOCK_CONFLICT');
            await tx.stockAdjustment.create({
              data: {
                id: docId,
                businessId: actor.businessId,
                warehouseId: warehouse.id,
                variantId: variant.id,
                skuSnapshot: variant.sku,
                productNameSnapshot: variant.product.name,
                variantNameSnapshot: variant.name,
                unitCodeSnapshot: variant.baseUnitCode,
                unitNameSnapshot: variant.baseUnitName,
                documentNumber,
                idempotencyKey: key,
                requestHash,
                systemQuantity: balance.onHandQuantity,
                countedQuantity: counted,
                quantityDelta: delta,
                unitCostVnd: adjustmentCost,
                valueDeltaVnd: valueDelta,
                averageCostAfterVnd: averageCost,
                reason,
                notes: dto.notes?.trim() || null,
                postedAt,
                createdById: actor.id,
              },
            });
            await tx.stockMovement.create({
              data: {
                businessId: actor.businessId,
                warehouseId: warehouse.id,
                variantId: variant.id,
                stockAdjustmentId: docId,
                movementKey: `adjustment:${key}`,
                type: 'STOCK_ADJUSTMENT',
                quantityDelta: delta,
                valueDeltaVnd: valueDelta,
                onHandAfter: counted,
                averageCostAfterVnd: averageCost,
                occurredAt: postedAt,
              },
            });
            await tx.auditLog.create({
              data: {
                businessId: actor.businessId,
                actorId: actor.id,
                action: 'inventory.stock_adjustment.post',
                entityType: 'StockAdjustment',
                entityId: docId,
                requestId,
                metadata: {
                  documentNumber,
                  warehouseId: warehouse.id,
                  variantId: variant.id,
                  idempotencyKey: key,
                  systemQuantity: balance.onHandQuantity.toString(),
                  countedQuantity: counted.toString(),
                  quantityDelta: delta.toString(),
                  reason,
                },
              },
            });
            return docId;
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
        return this.get(id, actor);
      } catch (error) {
        lastError = error;
        const code =
          typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
        if (
          attempt < RETRIES - 1 &&
          (code === 'P2034' ||
            code === 'P2002' ||
            (error instanceof Error && error.message.startsWith('SERIALIZABLE_')))
        )
          continue;
        break;
      }
    }
    const duplicate = await this.prisma.stockAdjustment.findUnique({
      where: { businessId_idempotencyKey: { businessId: actor.businessId, idempotencyKey: key } },
      select: { id: true, requestHash: true },
    });
    if (duplicate) {
      this.ensureSameRequest(duplicate.requestHash, requestHash);
      return this.get(duplicate.id, actor);
    }
    if (lastError instanceof ProblemException) throw lastError;
    throw new ProblemException(
      409,
      'INVENTORY_CONFLICT',
      'Tồn kho vừa được cập nhật ở nơi khác. Tải lại số tồn và kiểm kê lại.',
      undefined,
      true,
    );
  }
}
