import { Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { ProblemException } from '../common/problem.exception';
import type { RequestStaff } from '../common/request-context';
import { Prisma, type Prisma as PrismaTypes } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateShipmentDto, DeliverShipmentDto } from './dto/shipment.dto';
import type { ListShipmentsDto } from './dto/list-shipments.dto';

const MAX_VND = new Prisma.Decimal('99999999999999999999');

function commandKey(raw: string | undefined, operation: string, id: string) {
  const key = raw?.trim();
  if (!key || !/^[A-Za-z0-9._:-]{8,100}$/.test(key)) {
    throw new ProblemException(
      400,
      'IDEMPOTENCY_KEY_REQUIRED',
      'Idempotency-Key phải có 8–100 ký tự an toàn.',
    );
  }
  return `${operation}:${id}:${key}`;
}

function hash(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function presentShipment(shipment: {
  id: string;
  shipmentCode: string;
  orderId: string;
  warehouseId: string;
  status: 'IN_TRANSIT' | 'DELIVERED';
  version: number;
  shippedAt: Date;
  deliveredAt: Date | null;
  recognizedRevenueVnd: Prisma.Decimal;
  lines: Array<{
    id: string;
    orderLineId: string;
    productNameSnapshot: string;
    skuSnapshot: string;
    variantNameSnapshot: string;
    unitCodeSnapshot: string;
    unitNameSnapshot: string;
    quantity: Prisma.Decimal;
    baseQuantity: Prisma.Decimal;
  }>;
}) {
  return {
    id: shipment.id,
    shipmentCode: shipment.shipmentCode,
    orderId: shipment.orderId,
    warehouseId: shipment.warehouseId,
    status: shipment.status,
    version: shipment.version,
    shippedAt: shipment.shippedAt,
    deliveredAt: shipment.deliveredAt,
    recognizedRevenueVnd: shipment.recognizedRevenueVnd.toFixed(0),
    lines: shipment.lines.map((line) => ({
      id: line.id,
      orderLineId: line.orderLineId,
      productNameSnapshot: line.productNameSnapshot,
      skuSnapshot: line.skuSnapshot,
      variantNameSnapshot: line.variantNameSnapshot,
      unitCodeSnapshot: line.unitCodeSnapshot,
      unitNameSnapshot: line.unitNameSnapshot,
      quantity: line.quantity.toString(),
      baseQuantity: line.baseQuantity.toString(),
    })),
  };
}

const shipmentSelect = {
  id: true,
  shipmentCode: true,
  orderId: true,
  warehouseId: true,
  status: true,
  version: true,
  shippedAt: true,
  deliveredAt: true,
  recognizedRevenueVnd: true,
  lines: {
    orderBy: { id: 'asc' as const },
    select: {
      id: true,
      orderLineId: true,
      productNameSnapshot: true,
      skuSnapshot: true,
      variantNameSnapshot: true,
      unitCodeSnapshot: true,
      unitNameSnapshot: true,
      quantity: true,
      baseQuantity: true,
    },
  },
} satisfies PrismaTypes.ShipmentSelect;

@Injectable()
export class ShipmentsService {
  constructor(private readonly prisma: PrismaService) {}

  async readyOrders(actor: RequestStaff) {
    const orders = await this.prisma.salesOrder.findMany({
      where: {
        businessId: actor.businessId,
        status: 'CONFIRMED',
        shipment: null,
      },
      orderBy: [{ confirmedAt: 'asc' }, { id: 'asc' }],
      take: 100,
      select: {
        id: true,
        orderNumber: true,
        version: true,
        confirmedAt: true,
        customer: { select: { displayName: true } },
        lines: {
          orderBy: { lineNumber: 'asc' },
          select: {
            id: true,
            productNameSnapshot: true,
            skuSnapshot: true,
            variantNameSnapshot: true,
            unitCodeSnapshot: true,
            unitNameSnapshot: true,
            quantity: true,
          },
        },
      },
    });
    return {
      items: orders.map((order) => ({
        id: order.id,
        orderNumber: order.orderNumber,
        version: order.version,
        confirmedAt: order.confirmedAt,
        customerName: order.customer.displayName,
        lines: order.lines.map((line) => ({
          ...line,
          quantity: line.quantity.toString(),
        })),
      })),
      limit: 100,
    };
  }

  async list(query: ListShipmentsDto, actor: RequestStaff) {
    const shipments = await this.prisma.shipment.findMany({
      where: {
        businessId: actor.businessId,
        ...(query.status ? { status: query.status } : {}),
      },
      orderBy: [{ status: 'asc' }, { shippedAt: 'asc' }, { id: 'asc' }],
      take: 100,
      select: {
        ...shipmentSelect,
        order: {
          select: {
            orderNumber: true,
            customer: { select: { displayName: true } },
          },
        },
        warehouse: { select: { name: true } },
      },
    });
    return {
      items: shipments.map((shipment) => ({
        ...presentShipment(shipment),
        orderNumber: shipment.order.orderNumber,
        customerName: shipment.order.customer.displayName,
        warehouseName: shipment.warehouse.name,
      })),
      limit: 100,
    };
  }

  private async replay(businessId: string, key: string, requestHash: string) {
    const command = await this.prisma.orderCommand.findUnique({
      where: { businessId_idempotencyKey: { businessId, idempotencyKey: key } },
      select: { requestHash: true, response: true },
    });
    if (!command) return null;
    if (command.requestHash !== requestHash) {
      throw new ProblemException(
        409,
        'IDEMPOTENCY_KEY_REUSED',
        'Idempotency-Key đã dùng với nội dung khác.',
      );
    }
    return command.response;
  }

  async create(
    dto: CreateShipmentDto,
    rawKey: string | undefined,
    actor: RequestStaff,
    requestId: string,
  ) {
    const key = commandKey(rawKey, 'shipment', dto.orderId);
    const requestHash = hash(dto);
    const existing = await this.replay(actor.businessId, key, requestHash);
    if (existing) return existing;

    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const duplicate = await tx.orderCommand.findUnique({
            where: {
              businessId_idempotencyKey: { businessId: actor.businessId, idempotencyKey: key },
            },
            select: { requestHash: true, response: true },
          });
          if (duplicate) {
            if (duplicate.requestHash !== requestHash) {
              throw new ProblemException(
                409,
                'IDEMPOTENCY_KEY_REUSED',
                'Idempotency-Key đã dùng với nội dung khác.',
              );
            }
            return duplicate.response;
          }

          const order = await tx.salesOrder.findFirst({
            where: { id: dto.orderId, businessId: actor.businessId },
            select: {
              id: true,
              orderNumber: true,
              status: true,
              version: true,
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
                  sellingUnitFactor: true,
                  quantity: true,
                },
              },
            },
          });
          if (!order) throw new ProblemException(404, 'ORDER_NOT_FOUND', 'Không tìm thấy đơn bán.');
          if (order.status !== 'CONFIRMED') {
            throw new ProblemException(
              409,
              'ORDER_NOT_READY_TO_SHIP',
              'Chỉ đơn đã xác nhận mới được xuất giao.',
            );
          }
          if (order.version !== dto.expectedVersion) {
            throw new ProblemException(
              409,
              'ORDER_VERSION_CONFLICT',
              'Đơn đã thay đổi; tải lại trước khi xuất giao.',
            );
          }
          if (order.lines.length === 0) {
            throw new ProblemException(409, 'EMPTY_ORDER', 'Đơn không có dòng hàng để xuất giao.');
          }
          const alreadyShipped = await tx.shipment.findFirst({
            where: { orderId: order.id, businessId: actor.businessId },
            select: { id: true },
          });
          if (alreadyShipped) {
            throw new ProblemException(409, 'ORDER_ALREADY_SHIPPED', 'Đơn này đã có phiếu giao.');
          }

          const events = await tx.stockReservationEvent.findMany({
            where: { businessId: actor.businessId, orderId: order.id },
            orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
            select: { orderLineId: true, warehouseId: true, type: true, quantity: true },
          });
          const heldByLine = new Map<string, { warehouseId: string; quantity: Prisma.Decimal }>();
          for (const event of events) {
            const current = heldByLine.get(event.orderLineId) ?? {
              warehouseId: event.warehouseId,
              quantity: new Prisma.Decimal(0),
            };
            if (current.warehouseId !== event.warehouseId) {
              throw new ProblemException(
                409,
                'MULTI_WAREHOUSE_SHIPMENT_UNSUPPORTED',
                'Đơn có hàng giữ ở nhiều kho; cần quy trình điều phối kho.',
              );
            }
            current.quantity =
              event.type === 'RESERVED'
                ? current.quantity.add(event.quantity)
                : current.quantity.sub(event.quantity);
            heldByLine.set(event.orderLineId, current);
          }
          const warehouses = new Set([...heldByLine.values()].map((row) => row.warehouseId));
          if (warehouses.size !== 1) {
            throw new ProblemException(
              409,
              'RESERVATION_REQUIRED',
              'Đơn chưa có đủ hàng giữ trong một kho để xuất giao.',
            );
          }
          const warehouseId = [...warehouses][0]!;

          const shipmentItems = order.lines.map((line) => {
            const required = line.quantity.mul(line.sellingUnitFactor);
            const held = heldByLine.get(line.id);
            if (!held || !held.quantity.eq(required)) {
              throw new ProblemException(
                409,
                'RESERVATION_REQUIRED',
                `Lượng giữ cho SKU ${line.skuSnapshot} không khớp toàn bộ đơn.`,
              );
            }
            return { line, baseQuantity: required };
          });

          const byVariant = new Map<string, typeof shipmentItems>();
          for (const item of shipmentItems) {
            const group = byVariant.get(item.line.variantId) ?? [];
            group.push(item);
            byVariant.set(item.line.variantId, group);
          }
          const balances = new Map<
            string,
            {
              id: string;
              version: number;
              onHandQuantity: Prisma.Decimal;
              reservedQuantity: Prisma.Decimal;
              averageCostVnd: Prisma.Decimal;
            }
          >();
          const shipmentAt = new Date();
          const shipmentCode = `SH-${shipmentAt.toISOString().slice(0, 10).replaceAll('-', '')}-${randomUUID().slice(0, 8).toUpperCase()}`;
          const shipment = await tx.shipment.create({
            data: {
              businessId: actor.businessId,
              orderId: order.id,
              warehouseId,
              shipmentCode,
              shippedById: actor.id,
              shippedAt: shipmentAt,
              status: 'IN_TRANSIT',
            },
            select: { id: true },
          });

          for (const [variantId, items] of byVariant) {
            const totalQuantity = items.reduce(
              (sum, item) => sum.add(item.baseQuantity),
              new Prisma.Decimal(0),
            );
            const balance = await tx.stockBalance.findUnique({
              where: {
                businessId_warehouseId_variantId: {
                  businessId: actor.businessId,
                  warehouseId,
                  variantId,
                },
              },
              select: {
                id: true,
                version: true,
                onHandQuantity: true,
                reservedQuantity: true,
                averageCostVnd: true,
              },
            });
            if (
              !balance ||
              balance.onHandQuantity.lessThan(totalQuantity) ||
              balance.reservedQuantity.lessThan(totalQuantity)
            ) {
              throw new ProblemException(
                409,
                'RESERVATION_PROJECTION_MISMATCH',
                'Tồn thực tế/giữ hàng không đủ khớp với phiếu giao; cần kiểm tra sổ kho.',
              );
            }
            balances.set(variantId, balance);

            const currentValue = balance.onHandQuantity
              .mul(balance.averageCostVnd)
              .toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP);
            const totalValue = totalQuantity
              .mul(balance.averageCostVnd)
              .toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP);
            if (totalValue.gt(currentValue)) {
              throw new ProblemException(
                409,
                'INVENTORY_VALUE_MISMATCH',
                'Giá trị xuất lớn hơn giá trị tồn đang ghi sổ.',
              );
            }
            const newOnHand = balance.onHandQuantity.sub(totalQuantity);
            const newValue = currentValue.sub(totalValue);
            const newAverageCost = newOnHand.isZero()
              ? new Prisma.Decimal(0)
              : newValue.div(newOnHand).toDecimalPlaces(6, Prisma.Decimal.ROUND_HALF_UP);
            const update = await tx.stockBalance.updateMany({
              where: { id: balance.id, version: balance.version },
              data: {
                onHandQuantity: newOnHand,
                reservedQuantity: { decrement: totalQuantity },
                averageCostVnd: newAverageCost,
                version: { increment: 1 },
              },
            });
            if (update.count !== 1) {
              throw new ProblemException(
                409,
                'STOCK_VERSION_CONFLICT',
                'Tồn kho vừa thay đổi; tải lại và thử xuất giao lần nữa.',
              );
            }

            const rawLineCosts = items.map(({ baseQuantity }) =>
              baseQuantity
                .mul(balance.averageCostVnd)
                .toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP),
            );
            const roundedSum = rawLineCosts.reduce(
              (sum, value) => sum.add(value),
              new Prisma.Decimal(0),
            );
            rawLineCosts[rawLineCosts.length - 1] = rawLineCosts
              .at(-1)!
              .add(totalValue.sub(roundedSum));
            let movementOnHand = balance.onHandQuantity;
            let movementValue = currentValue;
            for (const [index, item] of items.entries()) {
              const lineCost = rawLineCosts[index]!;
              movementOnHand = movementOnHand.sub(item.baseQuantity);
              movementValue = movementValue.sub(lineCost);
              const movementAverage = movementOnHand.isZero()
                ? new Prisma.Decimal(0)
                : movementValue
                    .div(movementOnHand)
                    .toDecimalPlaces(6, Prisma.Decimal.ROUND_HALF_UP);
              const shipmentLine = await tx.shipmentLine.create({
                data: {
                  shipmentId: shipment.id,
                  orderLineId: item.line.id,
                  variantId,
                  productNameSnapshot: item.line.productNameSnapshot,
                  skuSnapshot: item.line.skuSnapshot,
                  variantNameSnapshot: item.line.variantNameSnapshot,
                  unitCodeSnapshot: item.line.unitCodeSnapshot,
                  unitNameSnapshot: item.line.unitNameSnapshot,
                  quantity: item.line.quantity,
                  baseQuantity: item.baseQuantity,
                  unitCostVnd: balance.averageCostVnd,
                  valueDeltaVnd: lineCost,
                },
                select: { id: true },
              });
              await tx.stockMovement.create({
                data: {
                  businessId: actor.businessId,
                  warehouseId,
                  variantId,
                  shipmentLineId: shipmentLine.id,
                  movementKey: `${shipment.id}:${shipmentLine.id}:sale-shipment`,
                  type: 'SALE_SHIPMENT',
                  quantityDelta: item.baseQuantity.negated(),
                  valueDeltaVnd: lineCost.negated(),
                  onHandAfter: movementOnHand,
                  averageCostAfterVnd: movementAverage,
                  occurredAt: shipmentAt,
                },
              });
            }
          }

          const complete = await tx.shipment.findUniqueOrThrow({
            where: { id: shipment.id },
            select: shipmentSelect,
          });
          const response = presentShipment(complete);
          await tx.auditLog.create({
            data: {
              businessId: actor.businessId,
              actorId: actor.id,
              action: 'shipment.create',
              entityType: 'Shipment',
              entityId: shipment.id,
              requestId,
              metadata: {
                shipmentCode,
                orderNumber: order.orderNumber,
                lineCount: shipmentItems.length,
                totalBaseQuantity: shipmentItems
                  .reduce((sum, item) => sum.add(item.baseQuantity), new Prisma.Decimal(0))
                  .toString(),
                idempotencyKey: key,
              },
            },
          });
          await tx.orderCommand.create({
            data: { businessId: actor.businessId, idempotencyKey: key, requestHash, response },
          });
          return response;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const repeated = await this.replay(actor.businessId, key, requestHash);
        if (repeated) return repeated;
        throw new ProblemException(409, 'ORDER_ALREADY_SHIPPED', 'Đơn này đã được xuất giao.');
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
        throw new ProblemException(
          409,
          'SHIPMENT_CONCURRENT_UPDATE',
          'Đơn hoặc tồn kho vừa thay đổi; tải lại rồi thử lại.',
        );
      }
      throw error;
    }
  }

  async deliver(
    id: string,
    dto: DeliverShipmentDto,
    rawKey: string | undefined,
    actor: RequestStaff,
    requestId: string,
  ) {
    const key = commandKey(rawKey, 'deliver', id);
    const requestHash = hash({ id, dto });
    const existing = await this.replay(actor.businessId, key, requestHash);
    if (existing) return existing;
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const duplicate = await tx.orderCommand.findUnique({
            where: {
              businessId_idempotencyKey: { businessId: actor.businessId, idempotencyKey: key },
            },
            select: { requestHash: true, response: true },
          });
          if (duplicate) {
            if (duplicate.requestHash !== requestHash) {
              throw new ProblemException(
                409,
                'IDEMPOTENCY_KEY_REUSED',
                'Idempotency-Key đã dùng với nội dung khác.',
              );
            }
            return duplicate.response;
          }
          const shipment = await tx.shipment.findFirst({
            where: { id, businessId: actor.businessId },
            select: {
              id: true,
              shipmentCode: true,
              status: true,
              version: true,
              order: {
                select: {
                  id: true,
                  orderNumber: true,
                  grandTotalVnd: true,
                  shippingFeeVnd: true,
                  taxVnd: true,
                },
              },
            },
          });
          if (!shipment)
            throw new ProblemException(404, 'SHIPMENT_NOT_FOUND', 'Không tìm thấy phiếu giao.');
          if (shipment.version !== dto.expectedVersion) {
            throw new ProblemException(
              409,
              'SHIPMENT_VERSION_CONFLICT',
              'Phiếu giao đã thay đổi; tải lại trước khi xác nhận đã giao.',
            );
          }
          if (shipment.status !== 'IN_TRANSIT') {
            throw new ProblemException(
              409,
              'SHIPMENT_NOT_DELIVERABLE',
              'Chỉ phiếu đang giao mới được ghi nhận đã giao.',
            );
          }
          const recognizedRevenue = shipment.order.grandTotalVnd
            .sub(shipment.order.shippingFeeVnd)
            .sub(shipment.order.taxVnd);
          if (recognizedRevenue.isNegative() || recognizedRevenue.gt(MAX_VND)) {
            throw new ProblemException(
              409,
              'REVENUE_AMOUNT_INVALID',
              'Doanh thu hàng hóa sau giảm giá không hợp lệ.',
            );
          }
          const deliveredAt = new Date();
          const updated = await tx.shipment.updateMany({
            where: {
              id,
              businessId: actor.businessId,
              status: 'IN_TRANSIT',
              version: dto.expectedVersion,
            },
            data: {
              status: 'DELIVERED',
              deliveredAt,
              deliveredById: actor.id,
              recognizedRevenueVnd: recognizedRevenue,
              version: { increment: 1 },
            },
          });
          if (updated.count !== 1) {
            throw new ProblemException(
              409,
              'SHIPMENT_VERSION_CONFLICT',
              'Phiếu giao vừa thay đổi; tải lại rồi thử lại.',
            );
          }
          const complete = await tx.shipment.findUniqueOrThrow({
            where: { id },
            select: shipmentSelect,
          });
          const response = presentShipment(complete);
          await tx.auditLog.create({
            data: {
              businessId: actor.businessId,
              actorId: actor.id,
              action: 'shipment.deliver',
              entityType: 'Shipment',
              entityId: id,
              requestId,
              metadata: {
                shipmentCode: shipment.shipmentCode,
                orderNumber: shipment.order.orderNumber,
                recognizedRevenueVnd: recognizedRevenue.toFixed(0),
                idempotencyKey: key,
              },
            },
          });
          await tx.orderCommand.create({
            data: { businessId: actor.businessId, idempotencyKey: key, requestHash, response },
          });
          return response;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const repeated = await this.replay(actor.businessId, key, requestHash);
        if (repeated) return repeated;
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
        throw new ProblemException(
          409,
          'SHIPMENT_CONCURRENT_UPDATE',
          'Phiếu giao vừa thay đổi; tải lại rồi thử lại.',
        );
      }
      throw error;
    }
  }
}
