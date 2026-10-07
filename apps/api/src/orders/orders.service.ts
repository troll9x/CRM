import { Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { ProblemException } from '../common/problem.exception';
import type { RequestStaff } from '../common/request-context';
import { Prisma, type Prisma as PrismaTypes } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { priceQuantityFrom } from '../pricing/pricing-rules';
import type { CreateOrderDto } from './dto/create-order.dto';
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
  customer: { select: { id: true, customerCode: true, displayName: true } },
  createdBy: { select: { id: true, displayName: true } },
  sourceQuote: { select: { id: true, quoteNumber: true } },
  lines: {
    orderBy: { lineNumber: 'asc' as const },
    select: {
      id: true,
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
} satisfies Prisma.SalesOrderSelect;

type OrderRecord = Prisma.SalesOrderGetPayload<{ select: typeof orderSelect }>;

function presentOrder(order: OrderRecord) {
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
