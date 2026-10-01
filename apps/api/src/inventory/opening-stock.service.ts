import { Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { ProblemException } from '../common/problem.exception';
import type { RequestStaff } from '../common/request-context';
import { Prisma } from '../generated/prisma/client';
import { PERMISSIONS } from '../identity/permissions';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateOpeningStockDto } from './dto/opening-stock.dto';
import type { InventoryListQueryDto } from './dto/inventory.dto';

const MAX_QUANTITY_OR_COST = new Prisma.Decimal('100000000000000');
const MAX_MONEY = new Prisma.Decimal('100000000000000000000');

@Injectable()
export class OpeningStockService {
  constructor(private readonly prisma: PrismaService) {}

  private canViewCost(actor: RequestStaff) {
    return actor.permissions.includes(PERMISSIONS.COST_VIEW);
  }

  private documentNumber() {
    const day = new Date().toISOString().slice(0, 10).replaceAll('-', '');
    return `OS-${day}-${randomUUID().slice(0, 8).toUpperCase()}`;
  }

  private async get(id: string, actor: RequestStaff) {
    const opening = await this.prisma.openingStock.findFirstOrThrow({
      where: { id, businessId: actor.businessId },
      select: {
        id: true,
        documentNumber: true,
        skuSnapshot: true,
        productNameSnapshot: true,
        variantNameSnapshot: true,
        unitCodeSnapshot: true,
        unitNameSnapshot: true,
        quantity: true,
        unitCostVnd: true,
        valueVnd: true,
        notes: true,
        postedAt: true,
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
        createdBy: { select: { id: true, displayName: true } },
      },
    });
    if (this.canViewCost(actor)) return opening;
    const { unitCostVnd, valueVnd, ...visible } = opening;
    void unitCostVnd;
    void valueVnd;
    return visible;
  }

  async list(actor: RequestStaff, query: InventoryListQueryDto) {
    const search = query.query?.trim();
    const rows = await this.prisma.openingStock.findMany({
      where: {
        businessId: actor.businessId,
        ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}),
        ...(search
          ? {
              OR: [
                { documentNumber: { contains: search.toUpperCase(), mode: 'insensitive' } },
                { variant: { sku: { contains: search.toUpperCase(), mode: 'insensitive' } } },
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
    dto: CreateOpeningStockDto,
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
    const requestHash = createHash('sha256')
      .update(
        JSON.stringify({
          warehouseId: dto.warehouseId,
          variantId: dto.variantId,
          quantity: dto.quantity,
          unitCostVnd: dto.unitCostVnd,
          notes: dto.notes?.trim() || null,
        }),
      )
      .digest('hex');
    const current = await this.prisma.openingStock.findUnique({
      where: { businessId_idempotencyKey: { businessId: actor.businessId, idempotencyKey } },
      select: { id: true, requestHash: true },
    });
    if (current) {
      if (current.requestHash !== requestHash) {
        throw new ProblemException(
          409,
          'IDEMPOTENCY_KEY_REUSED',
          'Idempotency-Key đã được dùng cho chứng từ tồn đầu khác.',
        );
      }
      return this.get(current.id, actor);
    }

    const quantity = new Prisma.Decimal(dto.quantity);
    const unitCost = new Prisma.Decimal(dto.unitCostVnd);
    const value = quantity.mul(unitCost);
    if (quantity.greaterThanOrEqualTo(MAX_QUANTITY_OR_COST)) {
      throw new ProblemException(422, 'STOCK_QUANTITY_LIMIT_EXCEEDED', 'Số lượng tồn quá lớn.');
    }
    if (unitCost.greaterThanOrEqualTo(MAX_QUANTITY_OR_COST)) {
      throw new ProblemException(422, 'AVERAGE_COST_LIMIT_EXCEEDED', 'Giá vốn quá lớn.');
    }
    if (value.decimalPlaces() !== 0 || value.greaterThanOrEqualTo(MAX_MONEY)) {
      throw new ProblemException(
        422,
        'OPENING_VALUE_INVALID',
        'Giá trị tồn đầu phải là số nguyên VND trong giới hạn lưu trữ.',
      );
    }

    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt += 1) {
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
            if (!variant) {
              throw new ProblemException(
                422,
                'ACTIVE_VARIANT_REQUIRED',
                'SKU không tồn tại hoặc đã ngừng bán.',
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
              select: { id: true },
            });
            const previousMovement = await tx.stockMovement.findFirst({
              where: {
                businessId: actor.businessId,
                warehouseId: warehouse.id,
                variantId: variant.id,
              },
              select: { id: true },
            });
            if (balance || previousMovement) {
              throw new ProblemException(
                409,
                'OPENING_STOCK_ALREADY_EXISTS',
                'SKU đã có lịch sử tồn tại kho này; không được nhập tồn đầu lần nữa.',
              );
            }

            const id = randomUUID();
            const documentNumber = this.documentNumber();
            const postedAt = new Date();
            await tx.openingStock.create({
              data: {
                id,
                businessId: actor.businessId,
                warehouseId: warehouse.id,
                variantId: variant.id,
                skuSnapshot: variant.sku,
                productNameSnapshot: variant.product.name,
                variantNameSnapshot: variant.name,
                unitCodeSnapshot: variant.baseUnitCode,
                unitNameSnapshot: variant.baseUnitName,
                documentNumber,
                idempotencyKey,
                requestHash,
                quantity,
                unitCostVnd: unitCost,
                valueVnd: value,
                notes: dto.notes?.trim() || null,
                postedAt,
                createdById: actor.id,
              },
            });
            await tx.stockBalance.create({
              data: {
                businessId: actor.businessId,
                warehouseId: warehouse.id,
                variantId: variant.id,
                onHandQuantity: quantity,
                averageCostVnd: unitCost,
              },
            });
            await tx.stockMovement.create({
              data: {
                businessId: actor.businessId,
                warehouseId: warehouse.id,
                variantId: variant.id,
                openingStockId: id,
                movementKey: `opening:${idempotencyKey}`,
                type: 'OPENING_STOCK',
                quantityDelta: quantity,
                valueDeltaVnd: value,
                onHandAfter: quantity,
                averageCostAfterVnd: unitCost,
                occurredAt: postedAt,
              },
            });
            await tx.auditLog.create({
              data: {
                businessId: actor.businessId,
                actorId: actor.id,
                action: 'inventory.opening_stock.post',
                entityType: 'OpeningStock',
                entityId: id,
                requestId,
                metadata: {
                  documentNumber,
                  warehouseId: warehouse.id,
                  variantId: variant.id,
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
          attempt < 2 &&
          (code === 'P2034' ||
            code === 'P2002' ||
            (error instanceof Error && error.message.startsWith('SERIALIZABLE_')))
        ) {
          continue;
        }
        break;
      }
    }
    const duplicate = await this.prisma.openingStock.findUnique({
      where: { businessId_idempotencyKey: { businessId: actor.businessId, idempotencyKey } },
      select: { id: true, requestHash: true },
    });
    if (duplicate) {
      if (duplicate.requestHash !== requestHash) {
        throw new ProblemException(
          409,
          'IDEMPOTENCY_KEY_REUSED',
          'Idempotency-Key đã được dùng cho chứng từ tồn đầu khác.',
        );
      }
      return this.get(duplicate.id, actor);
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
