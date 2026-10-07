import { Injectable } from '@nestjs/common';
import { ProblemException } from '../common/problem.exception';
import type { RequestStaff } from '../common/request-context';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { ListOrdersQueryDto } from './dto/list-orders.dto';

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
