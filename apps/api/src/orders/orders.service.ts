import { Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { ProblemException } from '../common/problem.exception';
import type { RequestStaff } from '../common/request-context';
import { Prisma, type Prisma as PrismaTypes } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { priceQuantityFrom } from '../pricing/pricing-rules';
import type { CreateOrderDto } from './dto/create-order.dto';
import type { CancelOrderDto } from './dto/cancel-order.dto';
import type { ConfirmOrderDto } from './dto/confirm-order.dto';
import type { ListOrdersQueryDto } from './dto/list-orders.dto';

const MAX_VND = new Prisma.Decimal('99999999999999999999');

const orderSelect = {
  id: true,
  orderNumber: true,
  status: true,
  version: true,
  sourceRevision: true,
  lineSubtotalVnd: true,
  lineDiscountVnd: true,
  orderDiscountMode: true,
  orderDiscountValue: true,
  orderDiscountVnd: true,
  shippingFeeVnd: true,
  taxMode: true,
  taxValue: true,
  taxVnd: true,
  depositVnd: true,
  grandTotalVnd: true,
  paymentNote: true,
  createdAt: true,
  updatedAt: true,
  confirmedAt: true,
  confirmedBy: { select: { id: true, displayName: true } },
  shipment: {
    select: {
      id: true,
      shipmentCode: true,
      status: true,
      version: true,
      shippedAt: true,
      deliveredAt: true,
      recognizedRevenueVnd: true,
    },
  },
  customer: { select: { id: true, customerCode: true, displayName: true } },
  createdBy: { select: { id: true, displayName: true } },
  sourceQuote: { select: { id: true, quoteNumber: true } },
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
      sellingUnitFactor: true,
      quantity: true,
      quantityFrom: true,
      unitPriceVnd: true,
      lineSubtotalVnd: true,
      discountMode: true,
      discountValue: true,
      discountVnd: true,
      lineTotalVnd: true,
    },
  },
  paymentAllocations: { select: { amountVnd: true } },
  creditApplications: {
    where: { status: 'ACTIVE' },
    select: { amountVnd: true },
  },
} satisfies Prisma.SalesOrderSelect;

type OrderRecord = Prisma.SalesOrderGetPayload<{ select: typeof orderSelect }>;

function presentOrder(order: OrderRecord) {
  const allocatedVnd = order.paymentAllocations.reduce(
    (sum, allocation) => sum.add(allocation.amountVnd),
    new Prisma.Decimal(0),
  );
  const creditAppliedVnd = order.creditApplications.reduce(
    (sum, application) => sum.add(application.amountVnd),
    new Prisma.Decimal(0),
  );
  const paidVnd = allocatedVnd.add(creditAppliedVnd);
  return {
    ...order,
    lineSubtotalVnd: order.lineSubtotalVnd.toString(),
    lineDiscountVnd: order.lineDiscountVnd.toString(),
    orderDiscountValue: order.orderDiscountValue?.toString() ?? null,
    orderDiscountVnd: order.orderDiscountVnd.toString(),
    shippingFeeVnd: order.shippingFeeVnd.toString(),
    taxValue: order.taxValue?.toString() ?? null,
    taxVnd: order.taxVnd.toString(),
    depositVnd: order.depositVnd.toString(),
    grandTotalVnd: order.grandTotalVnd.toString(),
    shipment: order.shipment
      ? {
          ...order.shipment,
          recognizedRevenueVnd: order.shipment.recognizedRevenueVnd.toFixed(0),
        }
      : null,
    cashPaidVnd: allocatedVnd.toFixed(0),
    creditAppliedVnd: creditAppliedVnd.toFixed(0),
    paidVnd: paidVnd.toFixed(0),
    remainingVnd: order.grandTotalVnd.sub(paidVnd).toFixed(0),
    paymentAllocations: undefined,
    creditApplications: undefined,
    lines: order.lines.map((line) => ({
      ...line,
      sellingUnitFactor: line.sellingUnitFactor.toString(),
      quantity: line.quantity.toString(),
      unitPriceVnd: line.unitPriceVnd.toString(),
      lineSubtotalVnd: line.lineSubtotalVnd.toString(),
      discountValue: line.discountValue?.toString() ?? null,
      discountVnd: line.discountVnd.toString(),
      lineTotalVnd: line.lineTotalVnd.toString(),
    })),
  };
}

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  private commandKey(raw?: string) {
    const key = raw?.trim();
    if (!key || !/^[A-Za-z0-9._:-]{8,100}$/.test(key)) {
      throw new ProblemException(
        400,
        'IDEMPOTENCY_KEY_REQUIRED',
        'Idempotency-Key phải có 8–100 ký tự an toàn.',
      );
    }
    return `manual-create:${key}`;
  }

  private async replay(businessId: string, idempotencyKey: string, requestHash: string) {
    const command = await this.prisma.orderCommand.findUnique({
      where: { businessId_idempotencyKey: { businessId, idempotencyKey } },
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
    dto: CreateOrderDto,
    rawKey: string | undefined,
    actor: RequestStaff,
    requestId: string,
  ) {
    const idempotencyKey = this.commandKey(rawKey);
    const requestHash = createHash('sha256').update(JSON.stringify(dto)).digest('hex');
    const replay = await this.replay(actor.businessId, idempotencyKey, requestHash);
    if (replay) return replay;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.prisma.$transaction(
          async (tx) => {
            const repeated = await tx.orderCommand.findUnique({
              where: {
                businessId_idempotencyKey: { businessId: actor.businessId, idempotencyKey },
              },
              select: { requestHash: true, response: true },
            });
            if (repeated) {
              if (repeated.requestHash !== requestHash) {
                throw new ProblemException(
                  409,
                  'IDEMPOTENCY_KEY_REUSED',
                  'Idempotency-Key đã dùng với nội dung khác.',
                );
              }
              return repeated.response;
            }

            const customer = await tx.customer.findFirst({
              where: { id: dto.customerId, businessId: actor.businessId, status: 'ACTIVE' },
              select: { id: true },
            });
            if (!customer) {
              throw new ProblemException(
                404,
                'CUSTOMER_NOT_FOUND',
                'Không tìm thấy khách hàng đang hoạt động.',
              );
            }

            const lines: PrismaTypes.SalesOrderLineUncheckedCreateWithoutOrderInput[] = [];
            let subtotal = new Prisma.Decimal(0);
            for (const [index, input] of dto.lines.entries()) {
              const quantity = new Prisma.Decimal(input.quantity);
              if (!quantity.gt(0) || quantity.gt(1_000_000_000) || quantity.decimalPlaces() > 6) {
                throw new ProblemException(
                  422,
                  'INVALID_ORDER_QUANTITY',
                  'Số lượng phải dương và tối đa 6 số lẻ.',
                );
              }
              const variant = await tx.productVariant.findFirst({
                where: {
                  id: input.variantId,
                  businessId: actor.businessId,
                  status: 'ACTIVE',
                  product: { status: 'ACTIVE' },
                },
                select: {
                  id: true,
                  sku: true,
                  name: true,
                  sellingUnitCode: true,
                  sellingUnitName: true,
                  sellingUnitFactor: true,
                  product: { select: { name: true } },
                },
              });
              if (!variant) {
                throw new ProblemException(
                  404,
                  'VARIANT_NOT_FOUND',
                  'Không tìm thấy SKU đang bán trong đơn vị kinh doanh.',
                );
              }
              const quantityFrom = priceQuantityFrom(input.quantity);
              const tier = await tx.priceTier.findUnique({
                where: {
                  businessId_variantId_quantityFrom: {
                    businessId: actor.businessId,
                    variantId: variant.id,
                    quantityFrom,
                  },
                },
                select: { priceVnd: true },
              });
              if (!tier?.priceVnd) {
                throw new ProblemException(
                  422,
                  'PRICE_NOT_CONFIGURED',
                  `Chưa cấu hình giá cho SKU ${variant.sku} ở bậc ${quantityFrom}.`,
                );
              }
              const lineSubtotal = quantity
                .mul(tier.priceVnd)
                .toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP);
              subtotal = subtotal.plus(lineSubtotal);
              if (!lineSubtotal.isInteger() || lineSubtotal.lt(0) || lineSubtotal.gt(MAX_VND)) {
                throw new ProblemException(
                  422,
                  'MONEY_OUT_OF_RANGE',
                  'Thành tiền dòng vượt phạm vi VND cho phép.',
                );
              }
              lines.push({
                variantId: variant.id,
                lineNumber: index + 1,
                productNameSnapshot: variant.product.name,
                skuSnapshot: variant.sku,
                variantNameSnapshot: variant.name,
                unitCodeSnapshot: variant.sellingUnitCode,
                unitNameSnapshot: variant.sellingUnitName,
                sellingUnitFactor: variant.sellingUnitFactor,
                quantity,
                quantityFrom,
                unitPriceVnd: tier.priceVnd,
                lineSubtotalVnd: lineSubtotal,
                discountMode: null,
                discountValue: null,
                discountVnd: new Prisma.Decimal(0),
                lineTotalVnd: lineSubtotal,
              });
            }
            if (!subtotal.isInteger() || subtotal.lt(0) || subtotal.gt(MAX_VND)) {
              throw new ProblemException(
                422,
                'MONEY_OUT_OF_RANGE',
                'Tạm tính tiền hàng vượt phạm vi VND cho phép.',
              );
            }

            const administrators = await tx.staffUser.findMany({
              where: {
                businessId: actor.businessId,
                status: 'ACTIVE',
                roles: {
                  some: { role: { permissions: { some: { permissionKey: 'staff.manage' } } } },
                },
              },
              select: { id: true },
            });
            if (administrators.length === 0) {
              throw new ProblemException(
                409,
                'ADMIN_RECIPIENT_NOT_CONFIGURED',
                'Không có nhân viên quản lý đang hoạt động để nhận thông báo đơn mới.',
              );
            }

            const orderNumber = `SO-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${randomBytes(4).toString('hex').toUpperCase()}`;
            const order = await tx.salesOrder.create({
              data: {
                businessId: actor.businessId,
                customerId: customer.id,
                createdById: actor.id,
                sourceQuoteId: null,
                orderNumber,
                sourceRevision: 0,
                lineSubtotalVnd: subtotal,
                lineDiscountVnd: 0,
                orderDiscountVnd: 0,
                shippingFeeVnd: 0,
                taxVnd: 0,
                depositVnd: 0,
                grandTotalVnd: subtotal,
                lines: { create: lines },
              },
              select: orderSelect,
            });
            await tx.adminAlert.createMany({
              data: administrators.map(({ id: recipientId }) => ({
                businessId: actor.businessId,
                recipientId,
                orderId: order.id,
                type: 'MANUAL_ORDER_CREATED' as const,
                title: 'Có đơn hàng nháp mới',
                body: `Đơn ${orderNumber} được tạo thủ công; vui lòng kiểm tra thông tin khách và đơn.`,
              })),
            });
            const response = presentOrder(order);
            await tx.orderCommand.create({
              data: {
                businessId: actor.businessId,
                idempotencyKey,
                requestHash,
                response,
              },
            });
            await tx.auditLog.create({
              data: {
                businessId: actor.businessId,
                actorId: actor.id,
                action: 'order.create_manual_draft',
                entityType: 'SalesOrder',
                entityId: order.id,
                requestId,
                metadata: {
                  orderNumber,
                  customerId: customer.id,
                  lineCount: lines.length,
                  idempotencyKey,
                  alertRecipientCount: administrators.length,
                },
              },
            });
            return response;
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2034' &&
          attempt < 2
        ) {
          continue;
        }
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          const repeated = await this.replay(actor.businessId, idempotencyKey, requestHash);
          if (repeated) return repeated;
        }
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
          throw new ProblemException(
            409,
            'ORDER_CONCURRENT_UPDATE',
            'Dữ liệu vừa thay đổi đồng thời; hãy tải lại rồi thử lại.',
          );
        }
        throw error;
      }
    }
    throw new ProblemException(
      409,
      'ORDER_CONCURRENT_UPDATE',
      'Không thể tạo đơn do dữ liệu thay đổi đồng thời.',
    );
  }

  async cancel(
    id: string,
    dto: CancelOrderDto,
    rawKey: string | undefined,
    actor: RequestStaff,
    requestId: string,
  ) {
    const inputKey = this.commandKey(rawKey).replace('manual-create:', '');
    const idempotencyKey = `cancel:${id}:${inputKey}`;
    const requestHash = createHash('sha256').update(JSON.stringify({ id, dto })).digest('hex');
    const replay = await this.replay(actor.businessId, idempotencyKey, requestHash);
    if (replay) return replay;

    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const duplicate = await tx.orderCommand.findUnique({
            where: {
              businessId_idempotencyKey: {
                businessId: actor.businessId,
                idempotencyKey,
              },
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
            where: { id, businessId: actor.businessId },
            select: { id: true, orderNumber: true, status: true, version: true },
          });
          if (!order) {
            throw new ProblemException(404, 'RESOURCE_NOT_FOUND', 'Không tìm thấy đơn bán.');
          }
          if (order.version !== dto.expectedVersion) {
            throw new ProblemException(
              409,
              'ORDER_VERSION_CONFLICT',
              'Đơn đã thay đổi; tải lại trước khi hủy.',
            );
          }
          if (order.status !== 'DRAFT') {
            throw new ProblemException(
              409,
              'ORDER_NOT_CANCELLABLE',
              'Chỉ đơn nháp chưa xác nhận mới được hủy ở lát cắt này.',
            );
          }
          const payments = await tx.paymentAllocation.aggregate({
            where: { orderId: id },
            _sum: { amountVnd: true },
          });
          if ((payments._sum.amountVnd ?? new Prisma.Decimal(0)).gt(0)) {
            throw new ProblemException(
              409,
              'ORDER_HAS_PAYMENTS_CANNOT_CANCEL',
              'Đơn đã nhận tiền; cần quy trình hoàn/đối trừ trước khi hủy.',
            );
          }

          const creditApplications = await tx.customerCreditApplication.findMany({
            where: { businessId: actor.businessId, orderId: id, status: 'ACTIVE' },
            select: { id: true, customerId: true, amountVnd: true },
          });
          for (const application of creditApplications) {
            const reversed = await tx.customerCreditApplication.updateMany({
              where: { id: application.id, status: 'ACTIVE' },
              data: { status: 'REVERSED' },
            });
            if (reversed.count !== 1) {
              throw new ProblemException(
                409,
                'CUSTOMER_CREDIT_CONCURRENT_UPDATE',
                'Số dư đã thay đổi; tải lại đơn trước khi hủy.',
              );
            }
            await tx.customerCreditBalance.update({
              where: { customerId: application.customerId },
              data: { balanceVnd: { increment: application.amountVnd }, version: { increment: 1 } },
            });
            await tx.customerCreditEvent.create({
              data: {
                businessId: actor.businessId,
                customerId: application.customerId,
                applicationId: application.id,
                eventKey: `${application.id}:reversal`,
                type: 'REVERSAL',
                amountVnd: application.amountVnd,
                occurredAt: new Date(),
              },
            });
          }

          const events = await tx.stockReservationEvent.findMany({
            where: { businessId: actor.businessId, orderId: id },
            orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
            select: {
              orderLineId: true,
              warehouseId: true,
              variantId: true,
              type: true,
              quantity: true,
            },
          });
          const byLine = new Map<
            string,
            { warehouseId: string; variantId: string; reserved: Prisma.Decimal }
          >();
          for (const event of events) {
            const current = byLine.get(event.orderLineId) ?? {
              warehouseId: event.warehouseId,
              variantId: event.variantId,
              reserved: new Prisma.Decimal(0),
            };
            current.reserved =
              event.type === 'RESERVED'
                ? current.reserved.add(event.quantity)
                : current.reserved.sub(event.quantity);
            byLine.set(event.orderLineId, current);
          }
          const activeReservations = [...byLine.entries()].filter(([, row]) => row.reserved.gt(0));
          const releaseTime = new Date();
          for (const [orderLineId, reservation] of activeReservations) {
            const balance = await tx.stockBalance.findUnique({
              where: {
                businessId_warehouseId_variantId: {
                  businessId: actor.businessId,
                  warehouseId: reservation.warehouseId,
                  variantId: reservation.variantId,
                },
              },
              select: { id: true, version: true, reservedQuantity: true },
            });
            if (!balance || balance.reservedQuantity.lessThan(reservation.reserved)) {
              throw new ProblemException(
                409,
                'RESERVATION_PROJECTION_MISMATCH',
                'Số giữ trên tồn kho không khớp sổ giữ hàng; cần kiểm tra trước khi hủy.',
              );
            }
            const updated = await tx.stockBalance.updateMany({
              where: { id: balance.id, version: balance.version },
              data: {
                reservedQuantity: { decrement: reservation.reserved },
                version: { increment: 1 },
              },
            });
            if (updated.count !== 1) {
              throw new ProblemException(
                409,
                'ORDER_CONCURRENT_UPDATE',
                'Tồn kho vừa thay đổi; tải lại và thử hủy đơn lần nữa.',
              );
            }
            await tx.stockReservationEvent.create({
              data: {
                businessId: actor.businessId,
                warehouseId: reservation.warehouseId,
                variantId: reservation.variantId,
                orderId: id,
                orderLineId,
                eventKey: `${id}:${orderLineId}:release`,
                type: 'RELEASED',
                quantity: reservation.reserved,
                occurredAt: releaseTime,
              },
            });
          }

          const updatedOrder = await tx.salesOrder.updateMany({
            where: {
              id,
              businessId: actor.businessId,
              status: 'DRAFT',
              version: dto.expectedVersion,
            },
            data: { status: 'CANCELED', version: { increment: 1 } },
          });
          if (updatedOrder.count !== 1) {
            throw new ProblemException(
              409,
              'ORDER_VERSION_CONFLICT',
              'Đơn đã thay đổi; tải lại trước khi hủy.',
            );
          }
          const response = presentOrder(
            await tx.salesOrder.findUniqueOrThrow({ where: { id }, select: orderSelect }),
          );
          await tx.auditLog.create({
            data: {
              businessId: actor.businessId,
              actorId: actor.id,
              action: 'order.cancel',
              entityType: 'SalesOrder',
              entityId: id,
              requestId,
              metadata: {
                orderNumber: order.orderNumber,
                releasedLineCount: activeReservations.length,
                idempotencyKey,
              },
            },
          });
          await tx.orderCommand.create({
            data: { businessId: actor.businessId, idempotencyKey, requestHash, response },
          });
          return response;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const repeated = await this.replay(actor.businessId, idempotencyKey, requestHash);
        if (repeated) return repeated;
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
        throw new ProblemException(
          409,
          'ORDER_CONCURRENT_UPDATE',
          'Dữ liệu vừa thay đổi đồng thời; hãy tải lại rồi thử lại.',
        );
      }
      throw error;
    }
  }

  async confirm(
    id: string,
    dto: ConfirmOrderDto,
    rawKey: string | undefined,
    actor: RequestStaff,
    requestId: string,
  ) {
    const inputKey = this.commandKey(rawKey).replace('manual-create:', '');
    const idempotencyKey = `confirm:${id}:${inputKey}`;
    const requestHash = createHash('sha256').update(JSON.stringify({ id, dto })).digest('hex');
    const replay = await this.replay(actor.businessId, idempotencyKey, requestHash);
    if (replay) return replay;
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const duplicate = await tx.orderCommand.findUnique({
            where: {
              businessId_idempotencyKey: {
                businessId: actor.businessId,
                idempotencyKey,
              },
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
            where: { id, businessId: actor.businessId },
            select: { ...orderSelect, version: true, status: true, customerId: true },
          });
          if (!order)
            throw new ProblemException(404, 'RESOURCE_NOT_FOUND', 'Không tìm thấy đơn bán.');
          if (order.status !== 'DRAFT') {
            throw new ProblemException(
              409,
              'ORDER_NOT_CONFIRMABLE',
              'Chỉ đơn nháp chưa xác nhận hoặc hủy mới được xác nhận.',
            );
          }
          if (order.version !== dto.expectedVersion) {
            throw new ProblemException(
              409,
              'ORDER_VERSION_CONFLICT',
              'Đơn đã thay đổi; tải lại trước khi xác nhận.',
            );
          }
          const paid = order.paymentAllocations
            .reduce((sum, allocation) => sum.add(allocation.amountVnd), new Prisma.Decimal(0))
            .add(
              order.creditApplications.reduce(
                (sum, application) => sum.add(application.amountVnd),
                new Prisma.Decimal(0),
              ),
            );
          if (paid.lt(order.grandTotalVnd)) {
            throw new ProblemException(
              409,
              'PAYMENT_REQUIRED_TO_CONFIRM',
              'Cần thu đủ 100% tổng phải trả trước khi xác nhận đơn.',
              [
                {
                  field: 'payment',
                  reason: `Đã phân bổ ${paid.toFixed(0)} / ${order.grandTotalVnd.toFixed(0)} VND.`,
                },
              ],
            );
          }
          if (paid.gt(order.grandTotalVnd)) {
            throw new ProblemException(
              409,
              'ORDER_OVERALLOCATED',
              'Tổng phân bổ vượt tổng đơn; cần điều chỉnh trước khi xác nhận.',
            );
          }

          const reservationEvents = await tx.stockReservationEvent.findMany({
            where: { businessId: actor.businessId, orderId: id },
            orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
            select: { orderLineId: true, warehouseId: true, type: true, quantity: true },
          });
          const heldByLine = new Map<string, { warehouseId: string; quantity: Prisma.Decimal }>();
          for (const event of reservationEvents) {
            const current = heldByLine.get(event.orderLineId) ?? {
              warehouseId: event.warehouseId,
              quantity: new Prisma.Decimal(0),
            };
            current.quantity =
              event.type === 'RESERVED'
                ? current.quantity.add(event.quantity)
                : current.quantity.sub(event.quantity);
            heldByLine.set(event.orderLineId, current);
          }
          const missingByLine = order.lines
            .map((line) => {
              const required = line.quantity.mul(line.sellingUnitFactor);
              const held = heldByLine.get(line.id)?.quantity ?? new Prisma.Decimal(0);
              if (held.gt(required)) {
                throw new ProblemException(
                  409,
                  'RESERVATION_PROJECTION_MISMATCH',
                  `Số hàng giữ vượt số lượng dòng ${line.skuSnapshot}.`,
                );
              }
              return { line, missing: required.sub(held) };
            })
            .filter(({ missing }) => missing.gt(0));
          if (missingByLine.length) {
            const warehouses = await tx.warehouse.findMany({
              where: { businessId: actor.businessId, status: 'ACTIVE' },
              take: 2,
              select: { id: true },
            });
            if (warehouses.length !== 1) {
              throw new ProblemException(
                409,
                warehouses.length === 0
                  ? 'ACTIVE_WAREHOUSE_REQUIRED'
                  : 'WAREHOUSE_SELECTION_REQUIRED',
                warehouses.length === 0
                  ? 'Cần có một kho hoạt động để giữ hàng trước khi xác nhận.'
                  : 'Cần chọn kho giữ hàng trước khi xác nhận đơn.',
              );
            }
            const warehouseId = warehouses[0]!.id;
            const requiredByVariant = new Map<string, Prisma.Decimal>();
            for (const { line, missing } of missingByLine) {
              requiredByVariant.set(
                line.variantId,
                (requiredByVariant.get(line.variantId) ?? new Prisma.Decimal(0)).add(missing),
              );
            }
            for (const [variantId, required] of requiredByVariant) {
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
                  unavailableQuantity: true,
                },
              });
              const available = balance
                ? balance.onHandQuantity
                    .sub(balance.reservedQuantity)
                    .sub(balance.unavailableQuantity)
                : new Prisma.Decimal(0);
              if (!balance || available.lt(required)) {
                const line = missingByLine.find((row) => row.line.variantId === variantId)!.line;
                throw new ProblemException(
                  409,
                  'INSUFFICIENT_AVAILABLE_STOCK',
                  `Không đủ tồn khả dụng cho SKU ${line.skuSnapshot}; đơn chưa được xác nhận.`,
                );
              }
              const updated = await tx.stockBalance.updateMany({
                where: { id: balance.id, version: balance.version },
                data: {
                  reservedQuantity: { increment: required },
                  version: { increment: 1 },
                },
              });
              if (updated.count !== 1) {
                throw new ProblemException(
                  409,
                  'STOCK_CHANGED_RETRY',
                  'Tồn vừa thay đổi; tải lại đơn và thử xác nhận lại.',
                );
              }
            }
            await tx.stockReservationEvent.createMany({
              data: missingByLine.map(({ line, missing }) => ({
                businessId: actor.businessId,
                warehouseId,
                variantId: line.variantId,
                orderId: id,
                orderLineId: line.id,
                eventKey: `${id}:${line.id}:confirm-reserve:${dto.expectedVersion}`,
                type: 'RESERVED' as const,
                quantity: missing,
                occurredAt: new Date(),
              })),
            });
          }

          const paymentAllocations = await tx.paymentAllocation.findMany({
            where: { orderId: id },
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
            select: { id: true, amountVnd: true },
          });
          const creditApplications = await tx.customerCreditApplication.findMany({
            where: { businessId: actor.businessId, orderId: id, status: 'ACTIVE' },
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
            select: { id: true, amountVnd: true },
          });
          const confirmedAt = new Date();
          const receivable = await tx.receivable.create({
            data: {
              businessId: actor.businessId,
              customerId: order.customerId,
              orderId: id,
              createdById: actor.id,
              amountVnd: order.grandTotalVnd,
              balanceVnd: 0,
            },
            select: { id: true },
          });
          await tx.receivableSettlement.createMany({
            data: [
              ...paymentAllocations.map((allocation) => ({
                receivableId: receivable.id,
                paymentAllocationId: allocation.id,
                amountVnd: allocation.amountVnd,
              })),
              ...creditApplications.map((application) => ({
                receivableId: receivable.id,
                creditApplicationId: application.id,
                amountVnd: application.amountVnd,
              })),
            ],
          });
          const changed = await tx.salesOrder.updateMany({
            where: {
              id,
              businessId: actor.businessId,
              status: 'DRAFT',
              version: dto.expectedVersion,
            },
            data: {
              status: 'CONFIRMED',
              confirmedById: actor.id,
              confirmedAt,
              version: { increment: 1 },
            },
          });
          if (changed.count !== 1) {
            throw new ProblemException(
              409,
              'ORDER_VERSION_CONFLICT',
              'Đơn đã thay đổi; tải lại trước khi xác nhận.',
            );
          }
          const response = presentOrder(
            await tx.salesOrder.findUniqueOrThrow({ where: { id }, select: orderSelect }),
          );
          await tx.auditLog.create({
            data: {
              businessId: actor.businessId,
              actorId: actor.id,
              action: 'order.confirm',
              entityType: 'SalesOrder',
              entityId: id,
              requestId,
              metadata: {
                orderNumber: order.orderNumber,
                grandTotalVnd: order.grandTotalVnd.toFixed(0),
                paidVnd: paid.toFixed(0),
                receivableId: receivable.id,
                idempotencyKey,
              },
            },
          });
          await tx.orderCommand.create({
            data: { businessId: actor.businessId, idempotencyKey, requestHash, response },
          });
          return response;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const repeated = await this.replay(actor.businessId, idempotencyKey, requestHash);
        if (repeated) return repeated;
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
        throw new ProblemException(
          409,
          'ORDER_CONCURRENT_UPDATE',
          'Đơn hoặc tồn vừa thay đổi đồng thời; tải lại và thử lại.',
        );
      }
      throw error;
    }
  }

  async list(actor: RequestStaff, query: ListOrdersQueryDto) {
    const search = query.query?.trim();
    const orders = await this.prisma.salesOrder.findMany({
      where: {
        businessId: actor.businessId,
        ...(query.status ? { status: query.status } : {}),
        ...(search
          ? {
              OR: [
                { orderNumber: { contains: search.toUpperCase(), mode: 'insensitive' as const } },
                { customer: { displayName: { contains: search, mode: 'insensitive' as const } } },
                { customer: { customerCode: { contains: search.toUpperCase() } } },
                { sourceQuote: { quoteNumber: { contains: search.toUpperCase() } } },
                { lines: { some: { skuSnapshot: { contains: search.toUpperCase() } } } },
              ],
            }
          : {}),
      },
      take: query.limit,
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      select: orderSelect,
    });
    return { items: orders.map(presentOrder) };
  }

  async get(id: string, actor: RequestStaff) {
    const order = await this.prisma.salesOrder.findFirst({
      where: { id, businessId: actor.businessId },
      select: orderSelect,
    });
    if (!order) {
      throw new ProblemException(404, 'RESOURCE_NOT_FOUND', 'Không tìm thấy đơn bán.');
    }
    return presentOrder(order);
  }
}
