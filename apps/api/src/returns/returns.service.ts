import { Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { ProblemException } from '../common/problem.exception';
import type { RequestStaff } from '../common/request-context';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateReturnDto, InspectReturnDto, SetReturnWindowDto } from './dto/returns.dto';

const retries = 3;

@Injectable()
export class ReturnsService {
  constructor(private readonly prisma: PrismaService) {}

  private key(raw?: string) {
    const value = raw?.trim();
    if (!value || !/^[A-Za-z0-9._:-]{8,100}$/.test(value))
      throw new ProblemException(
        400,
        'IDEMPOTENCY_KEY_REQUIRED',
        'Cần Idempotency-Key dài 8–100 ký tự an toàn.',
      );
    return value;
  }

  private hash(value: unknown) {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex');
  }

  private replayCheck(existing: { requestHash: string; response: Prisma.JsonValue }, hash: string) {
    if (existing.requestHash !== hash)
      throw new ProblemException(
        409,
        'IDEMPOTENCY_KEY_REUSED',
        'Idempotency-Key đã được dùng cho nội dung khác.',
      );
    return existing.response;
  }

  async policy(actor: RequestStaff) {
    const business = await this.prisma.business.findUniqueOrThrow({
      where: { id: actor.businessId },
      select: { returnWindowDays: true, policyVersion: true, updatedAt: true },
    });
    return {
      days: business.returnWindowDays,
      version: business.policyVersion,
      updatedAt: business.updatedAt,
    };
  }

  async setPolicy(dto: SetReturnWindowDto, actor: RequestStaff, requestId: string) {
    const result = await this.prisma.$transaction(
      async (tx) => {
        const updated = await tx.business.updateMany({
          where: { id: actor.businessId, policyVersion: dto.expectedVersion },
          data: { returnWindowDays: dto.days, policyVersion: { increment: 1 } },
        });
        if (updated.count !== 1)
          throw new ProblemException(
            409,
            'POLICY_VERSION_CONFLICT',
            'Cấu hình đã thay đổi; tải lại trước khi lưu.',
          );
        const business = await tx.business.findUniqueOrThrow({
          where: { id: actor.businessId },
          select: { returnWindowDays: true, policyVersion: true, updatedAt: true },
        });
        await tx.auditLog.create({
          data: {
            businessId: actor.businessId,
            actorId: actor.id,
            action: 'returns.policy.update',
            entityType: 'Business',
            entityId: actor.businessId,
            requestId,
            metadata: { days: dto.days, policyVersion: business.policyVersion },
          },
        });
        return business;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    return {
      days: result.returnWindowDays,
      version: result.policyVersion,
      updatedAt: result.updatedAt,
    };
  }

  private async view(
    id: string,
    businessId: string,
    tx: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    return tx.returnRequest.findFirstOrThrow({
      where: { id, businessId },
      include: {
        customer: { select: { id: true, customerCode: true, displayName: true } },
        order: { select: { id: true, orderNumber: true } },
        shipment: { select: { id: true, shipmentCode: true } },
        warehouse: { select: { id: true, code: true, name: true } },
        receivedBy: { select: { id: true, displayName: true } },
        inspectedBy: { select: { id: true, displayName: true } },
        lines: { orderBy: { id: 'asc' }, include: { inspection: true } },
      },
    });
  }

  async list(actor: RequestStaff) {
    const rows = await this.prisma.returnRequest.findMany({
      where: { businessId: actor.businessId },
      orderBy: [{ receivedAt: 'desc' }, { id: 'desc' }],
      take: 100,
      select: { id: true },
    });
    return Promise.all(rows.map(({ id }) => this.view(id, actor.businessId)));
  }

  async eligibleShipments(actor: RequestStaff) {
    const business = await this.prisma.business.findUniqueOrThrow({
      where: { id: actor.businessId },
      select: { returnWindowDays: true },
    });
    if (!business.returnWindowDays) return [];
    const cutoff = new Date(Date.now() - business.returnWindowDays * 86_400_000);
    const shipments = await this.prisma.shipment.findMany({
      where: { businessId: actor.businessId, status: 'DELIVERED', deliveredAt: { gte: cutoff } },
      include: {
        order: {
          select: {
            orderNumber: true,
            customer: { select: { id: true, customerCode: true, displayName: true } },
          },
        },
        lines: { include: { returnLines: { select: { quantity: true } } } },
      },
      orderBy: [{ deliveredAt: 'desc' }, { id: 'desc' }],
      take: 100,
    });
    return shipments
      .map((shipment) => ({
        id: shipment.id,
        shipmentCode: shipment.shipmentCode,
        deliveredAt: shipment.deliveredAt,
        order: shipment.order,
        lines: shipment.lines
          .map((line) => {
            const returned = line.returnLines.reduce(
              (sum, current) => sum.add(current.quantity),
              new Prisma.Decimal(0),
            );
            return {
              id: line.id,
              skuSnapshot: line.skuSnapshot,
              productNameSnapshot: line.productNameSnapshot,
              variantNameSnapshot: line.variantNameSnapshot,
              unitNameSnapshot: line.unitNameSnapshot,
              deliveredQuantity: line.quantity.toString(),
              remainingQuantity: line.quantity.sub(returned).toString(),
            };
          })
          .filter((line) => new Prisma.Decimal(line.remainingQuantity).greaterThan(0)),
      }))
      .filter((shipment) => shipment.lines.length > 0);
  }

  async create(
    dto: CreateReturnDto,
    rawKey: string | undefined,
    actor: RequestStaff,
    requestId: string,
  ) {
    const key = this.key(rawKey);
    const normalized = {
      shipmentId: dto.shipmentId,
      lines: [...dto.lines].sort((a, b) => a.shipmentLineId.localeCompare(b.shipmentLineId)),
      notes: dto.notes?.trim() || null,
    };
    if (
      new Set(normalized.lines.map((line) => line.shipmentLineId)).size !== normalized.lines.length
    )
      throw new ProblemException(
        422,
        'DUPLICATE_RETURN_LINE',
        'Không nhập trùng một dòng hàng trong yêu cầu.',
      );
    const requestHash = this.hash(normalized);
    const commandKey = `create:${key}`;
    const prior = await this.prisma.returnCommand.findUnique({
      where: {
        businessId_idempotencyKey: { businessId: actor.businessId, idempotencyKey: commandKey },
      },
      select: { requestHash: true, response: true },
    });
    if (prior) return this.replayCheck(prior, requestHash);
    let lastError: unknown;
    for (let attempt = 0; attempt < retries; attempt += 1) {
      try {
        return await this.prisma.$transaction(
          async (tx) => {
            const duplicate = await tx.returnCommand.findUnique({
              where: {
                businessId_idempotencyKey: {
                  businessId: actor.businessId,
                  idempotencyKey: commandKey,
                },
              },
              select: { requestHash: true, response: true },
            });
            if (duplicate) return this.replayCheck(duplicate, requestHash);
            const shipment = await tx.shipment.findFirst({
              where: { id: dto.shipmentId, businessId: actor.businessId },
              include: { order: { select: { id: true, customerId: true } }, lines: true },
            });
            if (!shipment)
              throw new ProblemException(
                404,
                'SHIPMENT_NOT_FOUND',
                'Không tìm thấy phiếu giao trong đơn vị kinh doanh này.',
              );
            if (shipment.status !== 'DELIVERED' || !shipment.deliveredAt)
              throw new ProblemException(
                409,
                'SHIPMENT_NOT_DELIVERED',
                'Chỉ nhận trả hàng cho phiếu đã giao.',
              );
            const business = await tx.business.findUniqueOrThrow({
              where: { id: actor.businessId },
              select: { returnWindowDays: true },
            });
            if (!business.returnWindowDays)
              throw new ProblemException(
                409,
                'RETURN_POLICY_NOT_CONFIGURED',
                'Quản lý cần cấu hình thời hạn nhận trả hàng trước.',
              );
            const deadlineAt = new Date(
              shipment.deliveredAt.getTime() + business.returnWindowDays * 86_400_000,
            );
            const receivedAt = new Date();
            if (receivedAt.getTime() > deadlineAt.getTime())
              throw new ProblemException(
                409,
                'RETURN_WINDOW_EXPIRED',
                'Đã quá thời hạn nhận trả hàng của phiếu giao.',
              );
            const lock = await tx.shipment.updateMany({
              where: { id: shipment.id, businessId: actor.businessId, version: shipment.version },
              data: { version: { increment: 1 } },
            });
            if (lock.count !== 1)
              throw new ProblemException(
                409,
                'SHIPMENT_VERSION_CONFLICT',
                'Phiếu giao vừa thay đổi; thử lại.',
              );
            const previous = await tx.returnLine.findMany({
              where: {
                shipmentLineId: { in: normalized.lines.map((line) => line.shipmentLineId) },
              },
              select: { shipmentLineId: true, baseQuantity: true },
            });
            const returned = new Map<string, Prisma.Decimal>();
            for (const row of previous)
              returned.set(
                row.shipmentLineId,
                (returned.get(row.shipmentLineId) ?? new Prisma.Decimal(0)).add(row.baseQuantity),
              );
            const returnId = randomUUID();
            const lines = normalized.lines.map((input) => {
              const source = shipment.lines.find((line) => line.id === input.shipmentLineId);
              if (!source)
                throw new ProblemException(
                  422,
                  'SHIPMENT_LINE_INVALID',
                  'Dòng hàng không thuộc phiếu giao đã chọn.',
                );
              const quantity = new Prisma.Decimal(input.quantity);
              if (!quantity.greaterThan(0))
                throw new ProblemException(
                  422,
                  'RETURN_QUANTITY_INVALID',
                  'Số lượng trả phải lớn hơn 0.',
                );
              const baseQuantity = quantity.mul(source.baseQuantity).div(source.quantity);
              if (
                (returned.get(source.id) ?? new Prisma.Decimal(0))
                  .add(baseQuantity)
                  .greaterThan(source.baseQuantity)
              )
                throw new ProblemException(
                  409,
                  'RETURN_QUANTITY_EXCEEDED',
                  `Số lượng yêu cầu vượt lượng đã giao còn có thể trả (${source.skuSnapshot}).`,
                );
              return { source, quantity, baseQuantity };
            });
            const created = await tx.returnRequest.create({
              data: {
                id: returnId,
                businessId: actor.businessId,
                shipmentId: shipment.id,
                orderId: shipment.orderId,
                customerId: shipment.order.customerId,
                warehouseId: shipment.warehouseId,
                receivedById: actor.id,
                deliveredAt: shipment.deliveredAt,
                deadlineAt,
                policyDays: business.returnWindowDays,
                idempotencyKey: key,
                requestHash,
                notes: normalized.notes,
                receivedAt,
                lines: {
                  create: lines.map(({ source, quantity, baseQuantity }) => ({
                    shipmentLineId: source.id,
                    variantId: source.variantId,
                    productNameSnapshot: source.productNameSnapshot,
                    skuSnapshot: source.skuSnapshot,
                    variantNameSnapshot: source.variantNameSnapshot,
                    unitCodeSnapshot: source.unitCodeSnapshot,
                    unitNameSnapshot: source.unitNameSnapshot,
                    quantity,
                    baseQuantity,
                    unitCostVnd: source.unitCostVnd,
                  })),
                },
              },
            });
            const response = await this.view(created.id, actor.businessId, tx);
            await tx.returnCommand.create({
              data: {
                businessId: actor.businessId,
                idempotencyKey: commandKey,
                requestHash,
                response,
                createdById: actor.id,
              },
            });
            await tx.auditLog.create({
              data: {
                businessId: actor.businessId,
                actorId: actor.id,
                action: 'returns.receive',
                entityType: 'ReturnRequest',
                entityId: created.id,
                requestId,
                metadata: {
                  shipmentCode: shipment.shipmentCode,
                  policyDays: business.returnWindowDays,
                  lineCount: lines.length,
                  idempotencyKey: key,
                },
              },
            });
            return response;
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
      } catch (error) {
        lastError = error;
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          const repeated = await this.prisma.returnCommand.findUnique({
            where: {
              businessId_idempotencyKey: {
                businessId: actor.businessId,
                idempotencyKey: commandKey,
              },
            },
            select: { requestHash: true, response: true },
          });
          if (repeated) return this.replayCheck(repeated, requestHash);
          throw new ProblemException(
            409,
            'RETURN_ALREADY_RECORDED',
            'Yêu cầu trả hàng này vừa được ghi nhận.',
          );
        }
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code !== 'P2034')
          throw error;
      }
    }
    if (lastError instanceof ProblemException) throw lastError;
    throw new ProblemException(
      409,
      'RETURN_CONCURRENT_UPDATE',
      'Dữ liệu vừa thay đổi; tải lại rồi thử lại.',
    );
  }

  async inspect(
    id: string,
    dto: InspectReturnDto,
    rawKey: string | undefined,
    actor: RequestStaff,
    requestId: string,
  ) {
    const key = this.key(rawKey);
    const normalized = {
      id,
      expectedVersion: dto.expectedVersion,
      lines: [...dto.lines].sort((a, b) => a.returnLineId.localeCompare(b.returnLineId)),
    };
    if (new Set(normalized.lines.map((line) => line.returnLineId)).size !== normalized.lines.length)
      throw new ProblemException(
        422,
        'DUPLICATE_RETURN_LINE',
        'Không nhập trùng một dòng hàng khi kiểm tra.',
      );
    const requestHash = this.hash(normalized);
    const commandKey = `inspect:${key}`;
    const existing = await this.prisma.returnCommand.findUnique({
      where: {
        businessId_idempotencyKey: { businessId: actor.businessId, idempotencyKey: commandKey },
      },
      select: { requestHash: true, response: true },
    });
    if (existing) return this.replayCheck(existing, requestHash);
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const duplicate = await tx.returnCommand.findUnique({
            where: {
              businessId_idempotencyKey: {
                businessId: actor.businessId,
                idempotencyKey: commandKey,
              },
            },
            select: { requestHash: true, response: true },
          });
          if (duplicate) return this.replayCheck(duplicate, requestHash);
          const request = await tx.returnRequest.findFirst({
            where: { id, businessId: actor.businessId },
            include: { lines: true },
          });
          if (!request)
            throw new ProblemException(404, 'RETURN_NOT_FOUND', 'Không tìm thấy yêu cầu đổi trả.');
          if (request.version !== dto.expectedVersion)
            throw new ProblemException(
              409,
              'RETURN_VERSION_CONFLICT',
              'Yêu cầu đổi trả vừa thay đổi; tải lại trước khi kiểm tra.',
            );
          if (request.status !== 'RECEIVED')
            throw new ProblemException(
              409,
              'RETURN_ALREADY_INSPECTED',
              'Yêu cầu này đã được kiểm tra.',
            );
          if (
            request.lines.length !== normalized.lines.length ||
            request.lines.some(
              (line) => !normalized.lines.some((input) => input.returnLineId === line.id),
            )
          )
            throw new ProblemException(
              422,
              'RETURN_INSPECTION_LINES_MISMATCH',
              'Cần kiểm tra đầy đủ từng dòng hàng đã nhận.',
            );
          const inspectedAt = new Date();
          for (const input of normalized.lines) {
            const line = request.lines.find(({ id: lineId }) => lineId === input.returnLineId);
            if (!line)
              throw new ProblemException(
                422,
                'RETURN_LINE_INVALID',
                'Dòng kiểm tra không thuộc yêu cầu đổi trả này.',
              );
            const saleable = new Prisma.Decimal(input.saleableQuantity);
            const quarantine = new Prisma.Decimal(input.quarantineQuantity);
            if (
              saleable.isNegative() ||
              quarantine.isNegative() ||
              !saleable.add(quarantine).eq(line.quantity)
            )
              throw new ProblemException(
                422,
                'RETURN_INSPECTION_QUANTITY_MISMATCH',
                'Hàng đạt và hàng cách ly phải cộng đúng số lượng đã nhận.',
              );
            const quarantineBase = quarantine.mul(line.baseQuantity).div(line.quantity);
            const stock = await tx.stockBalance.findUnique({
              where: {
                businessId_warehouseId_variantId: {
                  businessId: actor.businessId,
                  warehouseId: request.warehouseId,
                  variantId: line.variantId,
                },
              },
            });
            if (!stock)
              throw new ProblemException(
                409,
                'STOCK_BALANCE_REQUIRED',
                'Không tìm thấy số dư kho của SKU trả về.',
              );
            const onHand = stock.onHandQuantity.add(line.baseQuantity);
            const unavailable = stock.unavailableQuantity.add(quarantineBase);
            const beforeValue = stock.onHandQuantity
              .mul(stock.averageCostVnd)
              .toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP);
            const returnValue = line.baseQuantity
              .mul(line.unitCostVnd)
              .toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP);
            const averageCost = onHand.isZero()
              ? new Prisma.Decimal(0)
              : beforeValue
                  .add(returnValue)
                  .div(onHand)
                  .toDecimalPlaces(6, Prisma.Decimal.ROUND_HALF_UP);
            const changed = await tx.stockBalance.updateMany({
              where: { id: stock.id, version: stock.version },
              data: {
                onHandQuantity: onHand,
                unavailableQuantity: unavailable,
                averageCostVnd: averageCost,
                version: { increment: 1 },
              },
            });
            if (changed.count !== 1)
              throw new ProblemException(
                409,
                'STOCK_VERSION_CONFLICT',
                'Tồn kho vừa thay đổi; tải lại rồi kiểm tra lại.',
              );
            await tx.returnLine.update({
              where: { id: line.id },
              data: { saleableQuantity: saleable, quarantineQuantity: quarantine, inspectedAt },
            });
            await tx.returnInspection.create({
              data: {
                requestId: request.id,
                lineId: line.id,
                inspectorId: actor.id,
                reason: input.reason?.trim() || null,
                inspectedAt,
              },
            });
            await tx.stockMovement.create({
              data: {
                businessId: actor.businessId,
                warehouseId: request.warehouseId,
                variantId: line.variantId,
                returnLineId: line.id,
                movementKey: `customer-return:${line.id}`,
                type: 'CUSTOMER_RETURN',
                quantityDelta: line.baseQuantity,
                valueDeltaVnd: returnValue,
                onHandAfter: onHand,
                averageCostAfterVnd: averageCost,
                occurredAt: inspectedAt,
              },
            });
          }
          const updated = await tx.returnRequest.updateMany({
            where: {
              id,
              businessId: actor.businessId,
              version: dto.expectedVersion,
              status: 'RECEIVED',
            },
            data: {
              status: 'INSPECTED',
              inspectedById: actor.id,
              inspectedAt,
              version: { increment: 1 },
            },
          });
          if (updated.count !== 1)
            throw new ProblemException(
              409,
              'RETURN_VERSION_CONFLICT',
              'Yêu cầu vừa được kiểm tra bởi thao tác khác.',
            );
          const response = await this.view(id, actor.businessId, tx);
          await tx.returnCommand.create({
            data: {
              businessId: actor.businessId,
              idempotencyKey: commandKey,
              requestHash,
              response,
              createdById: actor.id,
            },
          });
          await tx.auditLog.create({
            data: {
              businessId: actor.businessId,
              actorId: actor.id,
              action: 'returns.inspect',
              entityType: 'ReturnRequest',
              entityId: id,
              requestId,
              metadata: { lineCount: request.lines.length, idempotencyKey: key },
            },
          });
          return response;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const repeated = await this.prisma.returnCommand.findUnique({
          where: {
            businessId_idempotencyKey: { businessId: actor.businessId, idempotencyKey: commandKey },
          },
          select: { requestHash: true, response: true },
        });
        if (repeated) return this.replayCheck(repeated, requestHash);
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034')
        throw new ProblemException(
          409,
          'RETURN_CONCURRENT_UPDATE',
          'Yêu cầu hoặc tồn kho vừa thay đổi; tải lại rồi thử lại.',
        );
      throw error;
    }
  }
}
