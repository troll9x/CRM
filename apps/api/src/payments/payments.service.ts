import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { ProblemException } from '../common/problem.exception';
import type { RequestStaff } from '../common/request-context';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type {
  ApplyCustomerCreditDto,
  CreatePaymentDto,
  PaymentSuggestionsQueryDto,
} from './dto/payment.dto';

const MAX_VND = new Prisma.Decimal('99999999999999999999');

@Injectable()
export class PaymentsService {
  constructor(private readonly prisma: PrismaService) {}

  private key(raw?: string) {
    const key = raw?.trim();
    if (!key || !/^[A-Za-z0-9._:-]{8,100}$/.test(key)) {
      throw new ProblemException(
        400,
        'IDEMPOTENCY_KEY_REQUIRED',
        'Idempotency-Key phải có 8–100 ký tự an toàn.',
      );
    }
    return `receipt:${key}`;
  }

  private hash(dto: CreatePaymentDto) {
    return createHash('sha256').update(JSON.stringify(dto)).digest('hex');
  }

  private async getById(id: string, businessId: string) {
    const receipt = await this.prisma.paymentReceipt.findFirst({
      where: { id, businessId },
      include: {
        customer: { select: { id: true, customerCode: true, displayName: true } },
        allocations: {
          orderBy: { createdAt: 'asc' },
          include: { order: { select: { id: true, orderNumber: true } } },
        },
      },
    });
    if (!receipt) throw new ProblemException(404, 'PAYMENT_NOT_FOUND', 'Không tìm thấy phiếu thu.');
    const allocatedVnd = receipt.allocations.reduce(
      (sum, allocation) => sum.add(allocation.amountVnd),
      new Prisma.Decimal(0),
    );
    const credit = await this.prisma.customerCreditBalance.findUnique({
      where: { customerId: receipt.customerId },
      select: { balanceVnd: true },
    });
    return {
      ...receipt,
      amountVnd: receipt.amountVnd.toFixed(0),
      allocatedVnd: allocatedVnd.toFixed(0),
      unallocatedVnd: receipt.amountVnd.sub(allocatedVnd).toFixed(0),
      customerCreditBalanceVnd: credit?.balanceVnd.toFixed(0) ?? '0',
      allocations: receipt.allocations.map((allocation) => ({
        ...allocation,
        amountVnd: allocation.amountVnd.toFixed(0),
      })),
    };
  }

  async create(
    dto: CreatePaymentDto,
    rawKey: string | undefined,
    actor: RequestStaff,
    requestId: string,
  ) {
    const key = this.key(rawKey);
    const requestHash = this.hash(dto);
    const existing = await this.prisma.paymentReceipt.findUnique({
      where: { businessId_idempotencyKey: { businessId: actor.businessId, idempotencyKey: key } },
      select: { id: true, requestHash: true },
    });
    if (existing) {
      if (existing.requestHash !== requestHash) {
        throw new ProblemException(
          409,
          'IDEMPOTENCY_KEY_REUSED',
          'Idempotency-Key đã dùng với nội dung khác.',
        );
      }
      return this.getById(existing.id, actor.businessId);
    }

    const amount = new Prisma.Decimal(dto.amountVnd);
    if (!amount.isInteger() || amount.lte(0) || amount.gt(MAX_VND)) {
      throw new ProblemException(422, 'INVALID_VND_AMOUNT', 'Số thu phải là VND nguyên dương.');
    }
    const allocations = dto.allocations ?? [];
    const orderIds = allocations.map(({ orderId }) => orderId);
    if (new Set(orderIds).size !== orderIds.length) {
      throw new ProblemException(
        422,
        'DUPLICATE_PAYMENT_ALLOCATION',
        'Mỗi đơn chỉ được chọn một lần trong một phiếu thu.',
      );
    }
    const prepared = allocations.map(({ orderId, amountVnd }) => {
      const value = new Prisma.Decimal(amountVnd);
      if (!value.isInteger() || value.lte(0) || value.gt(MAX_VND)) {
        throw new ProblemException(
          422,
          'INVALID_ALLOCATION_AMOUNT',
          'Số phân bổ phải là VND nguyên dương.',
        );
      }
      return { orderId, amountVnd: value };
    });
    const allocated = prepared.reduce(
      (sum, allocation) => sum.add(allocation.amountVnd),
      new Prisma.Decimal(0),
    );
    if (allocated.gt(amount)) {
      throw new ProblemException(
        422,
        'ALLOCATION_EXCEEDS_PAYMENT',
        'Tổng phân bổ không được vượt số tiền thực nhận.',
      );
    }
    const now = new Date();

    try {
      const receiptId = await this.prisma.$transaction(
        async (tx) => {
          const duplicate = await tx.paymentReceipt.findUnique({
            where: {
              businessId_idempotencyKey: { businessId: actor.businessId, idempotencyKey: key },
            },
            select: { id: true, requestHash: true },
          });
          if (duplicate) {
            if (duplicate.requestHash !== requestHash) {
              throw new ProblemException(
                409,
                'IDEMPOTENCY_KEY_REUSED',
                'Idempotency-Key đã dùng với nội dung khác.',
              );
            }
            return duplicate.id;
          }
          const customer = await tx.customer.findFirst({
            where: { id: dto.customerId, businessId: actor.businessId, status: 'ACTIVE' },
            select: { id: true },
          });
          if (!customer) {
            throw new ProblemException(404, 'CUSTOMER_NOT_FOUND', 'Không tìm thấy khách hàng.');
          }

          if (prepared.length) {
            const orders = await tx.salesOrder.findMany({
              where: {
                businessId: actor.businessId,
                customerId: customer.id,
                id: { in: orderIds },
              },
              select: {
                id: true,
                orderNumber: true,
                status: true,
                version: true,
                grandTotalVnd: true,
                creditApplications: {
                  where: { status: 'ACTIVE' },
                  select: { amountVnd: true },
                },
              },
            });
            const byId = new Map(orders.map((order) => [order.id, order]));
            if (orders.length !== orderIds.length) {
              throw new ProblemException(
                404,
                'ORDER_NOT_FOUND',
                'Không tìm thấy một hay nhiều đơn.',
              );
            }
            for (const allocation of prepared) {
              const order = byId.get(allocation.orderId)!;
              if (order.status !== 'DRAFT') {
                throw new ProblemException(
                  409,
                  'ORDER_NOT_PAYABLE',
                  `Đơn ${order.orderNumber} không còn ở trạng thái nhận thanh toán.`,
                );
              }
              const current = await tx.paymentAllocation.aggregate({
                where: { orderId: order.id },
                _sum: { amountVnd: true },
              });
              const paidInCash = current._sum.amountVnd ?? new Prisma.Decimal(0);
              const paidByCredit = order.creditApplications.reduce(
                (sum, application) => sum.add(application.amountVnd),
                new Prisma.Decimal(0),
              );
              const paidBefore = paidInCash.add(paidByCredit);
              if (paidBefore.add(allocation.amountVnd).gt(order.grandTotalVnd)) {
                throw new ProblemException(
                  422,
                  'ORDER_ALLOCATION_EXCEEDS_TOTAL',
                  `Phân bổ cho đơn ${order.orderNumber} vượt số còn phải thanh toán.`,
                );
              }
            }
          }

          const receipt = await tx.paymentReceipt.create({
            data: {
              businessId: actor.businessId,
              customerId: customer.id,
              createdById: actor.id,
              amountVnd: amount,
              receivedAt: now,
              reference: dto.reference?.trim() || null,
              note: dto.note?.trim() || null,
              idempotencyKey: key,
              requestHash,
            },
            select: { id: true },
          });
          for (const allocation of prepared) {
            const order = await tx.salesOrder.findFirstOrThrow({
              where: { id: allocation.orderId, businessId: actor.businessId, status: 'DRAFT' },
              select: { id: true, version: true },
            });
            const locked = await tx.salesOrder.updateMany({
              where: {
                id: order.id,
                businessId: actor.businessId,
                status: 'DRAFT',
                version: order.version,
              },
              data: { version: { increment: 1 } },
            });
            if (locked.count !== 1) {
              throw new ProblemException(
                409,
                'ORDER_CONCURRENT_UPDATE',
                'Đơn vừa thay đổi; hãy tải lại.',
              );
            }
            await tx.paymentAllocation.create({
              data: { paymentId: receipt.id, orderId: order.id, amountVnd: allocation.amountVnd },
            });
          }

          const overpayment = amount.sub(allocated);
          if (overpayment.gt(0)) {
            await tx.customerCreditBalance.upsert({
              where: { customerId: customer.id },
              create: {
                businessId: actor.businessId,
                customerId: customer.id,
                balanceVnd: overpayment,
              },
              update: { balanceVnd: { increment: overpayment }, version: { increment: 1 } },
            });
            await tx.customerCreditEvent.create({
              data: {
                businessId: actor.businessId,
                customerId: customer.id,
                paymentId: receipt.id,
                eventKey: `${receipt.id}:overpayment`,
                type: 'OVERPAYMENT',
                amountVnd: overpayment,
                occurredAt: now,
              },
            });
          }
          await tx.auditLog.create({
            data: {
              businessId: actor.businessId,
              actorId: actor.id,
              action: 'payment.receive',
              entityType: 'PaymentReceipt',
              entityId: receipt.id,
              requestId,
              metadata: {
                amountVnd: amount.toFixed(0),
                allocationCount: prepared.length,
                overpaymentVnd: overpayment.toFixed(0),
                idempotencyKey: key,
              },
            },
          });
          return receipt.id;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
      return this.getById(receiptId, actor.businessId);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const duplicate = await this.prisma.paymentReceipt.findUnique({
          where: {
            businessId_idempotencyKey: { businessId: actor.businessId, idempotencyKey: key },
          },
          select: { id: true, requestHash: true },
        });
        if (duplicate) {
          if (duplicate.requestHash !== requestHash) {
            throw new ProblemException(
              409,
              'IDEMPOTENCY_KEY_REUSED',
              'Idempotency-Key đã dùng khác nội dung.',
            );
          }
          return this.getById(duplicate.id, actor.businessId);
        }
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
        throw new ProblemException(
          409,
          'PAYMENT_CONCURRENT_UPDATE',
          'Đơn hoặc khoản thu vừa thay đổi; tải lại và thử lại.',
        );
      }
      throw error;
    }
  }

  async suggestions(query: PaymentSuggestionsQueryDto, actor: RequestStaff) {
    const customer = await this.prisma.customer.findFirst({
      where: { id: query.customerId, businessId: actor.businessId },
      select: { id: true },
    });
    if (!customer)
      throw new ProblemException(404, 'CUSTOMER_NOT_FOUND', 'Không tìm thấy khách hàng.');
    const orders = await this.prisma.salesOrder.findMany({
      where: { businessId: actor.businessId, customerId: customer.id, status: 'DRAFT' },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        orderNumber: true,
        grandTotalVnd: true,
        createdAt: true,
        paymentAllocations: { select: { amountVnd: true } },
        creditApplications: {
          where: { status: 'ACTIVE' },
          select: { amountVnd: true },
        },
      },
    });
    const items = orders
      .map((order) => {
        const paidByReceipts = order.paymentAllocations.reduce(
          (sum, allocation) => sum.add(allocation.amountVnd),
          new Prisma.Decimal(0),
        );
        const paidByCredit = order.creditApplications.reduce(
          (sum, application) => sum.add(application.amountVnd),
          new Prisma.Decimal(0),
        );
        const paid = paidByReceipts.add(paidByCredit);
        return {
          id: order.id,
          orderNumber: order.orderNumber,
          createdAt: order.createdAt,
          totalVnd: order.grandTotalVnd.toFixed(0),
          allocatedVnd: paid.toFixed(0),
          cashAllocatedVnd: paidByReceipts.toFixed(0),
          creditAppliedVnd: paidByCredit.toFixed(0),
          remainingVnd: order.grandTotalVnd.sub(paid).toFixed(0),
        };
      })
      .filter((order) => new Prisma.Decimal(order.remainingVnd).gt(0));
    return { items };
  }

  async customerCredit(customerId: string, actor: RequestStaff) {
    const credit = await this.prisma.customerCreditBalance.findFirst({
      where: { businessId: actor.businessId, customerId },
      select: {
        balanceVnd: true,
        version: true,
        updatedAt: true,
        customer: { select: { id: true, customerCode: true, displayName: true } },
      },
    });
    if (!credit) {
      const customer = await this.prisma.customer.findFirst({
        where: { id: customerId, businessId: actor.businessId },
        select: { id: true, customerCode: true, displayName: true },
      });
      if (!customer)
        throw new ProblemException(404, 'CUSTOMER_NOT_FOUND', 'Không tìm thấy khách hàng.');
      return { customer, balanceVnd: '0', version: 0, updatedAt: null };
    }
    return { ...credit, balanceVnd: credit.balanceVnd.toFixed(0) };
  }

  async receivables(actor: RequestStaff) {
    const rows = await this.prisma.receivable.findMany({
      where: { businessId: actor.businessId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: 200,
      select: {
        id: true,
        amountVnd: true,
        balanceVnd: true,
        createdAt: true,
        customer: { select: { id: true, customerCode: true, displayName: true } },
        order: { select: { id: true, orderNumber: true, status: true } },
      },
    });
    return {
      items: rows.map((row) => ({
        id: row.id,
        customer: row.customer,
        order: row.order,
        createdAt: row.createdAt,
        amountVnd: row.amountVnd.toFixed(0),
        settledVnd: row.amountVnd.sub(row.balanceVnd).toFixed(0),
        balanceVnd: row.balanceVnd.toFixed(0),
      })),
    };
  }

  async applyCustomerCredit(
    customerId: string,
    dto: ApplyCustomerCreditDto,
    rawKey: string | undefined,
    actor: RequestStaff,
    requestId: string,
  ) {
    const raw = rawKey?.trim();
    if (!raw || !/^[A-Za-z0-9._:-]{8,100}$/.test(raw)) {
      throw new ProblemException(
        400,
        'IDEMPOTENCY_KEY_REQUIRED',
        'Idempotency-Key phải có 8–100 ký tự an toàn.',
      );
    }
    const idempotencyKey = `credit-application:${customerId}:${raw}`;
    const requestHash = createHash('sha256')
      .update(JSON.stringify({ customerId, dto }))
      .digest('hex');
    const amount = new Prisma.Decimal(dto.amountVnd);
    if (!amount.isInteger() || amount.lte(0) || amount.gt(MAX_VND)) {
      throw new ProblemException(
        422,
        'INVALID_CREDIT_APPLICATION_AMOUNT',
        'Số tiền sử dụng số dư phải là VND nguyên dương.',
      );
    }

    const replay = await this.prisma.customerCreditApplication.findUnique({
      where: { businessId_idempotencyKey: { businessId: actor.businessId, idempotencyKey } },
      select: { requestHash: true, response: true },
    });
    if (replay) {
      if (replay.requestHash !== requestHash) {
        throw new ProblemException(
          409,
          'IDEMPOTENCY_KEY_REUSED',
          'Idempotency-Key đã dùng với nội dung khác.',
        );
      }
      return replay.response;
    }

    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const duplicate = await tx.customerCreditApplication.findUnique({
            where: { businessId_idempotencyKey: { businessId: actor.businessId, idempotencyKey } },
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
            where: { id: dto.orderId, businessId: actor.businessId, customerId },
            select: {
              id: true,
              orderNumber: true,
              status: true,
              version: true,
              grandTotalVnd: true,
              paymentAllocations: { select: { amountVnd: true } },
              creditApplications: {
                where: { status: 'ACTIVE' },
                select: { amountVnd: true },
              },
            },
          });
          if (!order) {
            throw new ProblemException(
              404,
              'ORDER_NOT_FOUND',
              'Không tìm thấy đơn của khách hàng.',
            );
          }
          if (order.status !== 'DRAFT') {
            throw new ProblemException(
              409,
              'ORDER_NOT_PAYABLE',
              'Chỉ đơn nháp mới nhận được số dư khách hàng.',
            );
          }
          if (order.version !== dto.expectedVersion) {
            throw new ProblemException(
              409,
              'ORDER_VERSION_CONFLICT',
              'Đơn đã thay đổi; tải lại trước khi sử dụng số dư.',
            );
          }
          const paidByReceipts = order.paymentAllocations.reduce(
            (sum, row) => sum.add(row.amountVnd),
            new Prisma.Decimal(0),
          );
          const paidByCredit = order.creditApplications.reduce(
            (sum, row) => sum.add(row.amountVnd),
            new Prisma.Decimal(0),
          );
          const outstanding = order.grandTotalVnd.sub(paidByReceipts).sub(paidByCredit);
          if (amount.gt(outstanding)) {
            throw new ProblemException(
              422,
              'CREDIT_APPLICATION_EXCEEDS_ORDER_BALANCE',
              'Số dư sử dụng vượt phần còn phải thanh toán của đơn.',
            );
          }

          const changedOrder = await tx.salesOrder.updateMany({
            where: {
              id: order.id,
              businessId: actor.businessId,
              customerId,
              status: 'DRAFT',
              version: dto.expectedVersion,
            },
            data: { version: { increment: 1 } },
          });
          if (changedOrder.count !== 1) {
            throw new ProblemException(
              409,
              'ORDER_CONCURRENT_UPDATE',
              'Đơn vừa thay đổi; tải lại trước khi sử dụng số dư.',
            );
          }

          const updatedBalance = await tx.customerCreditBalance.updateMany({
            where: { businessId: actor.businessId, customerId, balanceVnd: { gte: amount } },
            data: { balanceVnd: { decrement: amount }, version: { increment: 1 } },
          });
          if (updatedBalance.count !== 1) {
            throw new ProblemException(
              409,
              'INSUFFICIENT_CUSTOMER_CREDIT',
              'Số dư khách hàng không đủ hoặc vừa được sử dụng ở giao dịch khác.',
            );
          }

          const application = await tx.customerCreditApplication.create({
            data: {
              businessId: actor.businessId,
              customerId,
              orderId: order.id,
              createdById: actor.id,
              amountVnd: amount,
              idempotencyKey,
              requestHash,
            },
            select: { id: true, amountVnd: true, status: true },
          });
          const occurredAt = new Date();
          await tx.customerCreditEvent.create({
            data: {
              businessId: actor.businessId,
              customerId,
              applicationId: application.id,
              eventKey: `${application.id}:application`,
              type: 'APPLICATION',
              amountVnd: amount,
              occurredAt,
            },
          });
          const balance = await tx.customerCreditBalance.findUniqueOrThrow({
            where: { customerId },
            select: { balanceVnd: true },
          });
          const paidAfter = paidByReceipts.add(paidByCredit).add(amount);
          const response = {
            application: {
              id: application.id,
              orderId: order.id,
              orderNumber: order.orderNumber,
              amountVnd: application.amountVnd.toFixed(0),
              status: application.status,
              occurredAt: occurredAt.toISOString(),
            },
            order: {
              id: order.id,
              version: dto.expectedVersion + 1,
              paidVnd: paidAfter.toFixed(0),
              remainingVnd: order.grandTotalVnd.sub(paidAfter).toFixed(0),
            },
            customerCreditBalanceVnd: balance.balanceVnd.toFixed(0),
          };
          await tx.customerCreditApplication.update({
            where: { id: application.id },
            data: { response },
          });
          await tx.auditLog.create({
            data: {
              businessId: actor.businessId,
              actorId: actor.id,
              action: 'customer_credit.apply',
              entityType: 'CustomerCreditApplication',
              entityId: application.id,
              requestId,
              metadata: {
                customerId,
                orderId: order.id,
                amountVnd: amount.toFixed(0),
                idempotencyKey,
              },
            },
          });
          return response;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const duplicate = await this.prisma.customerCreditApplication.findUnique({
          where: { businessId_idempotencyKey: { businessId: actor.businessId, idempotencyKey } },
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
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
        throw new ProblemException(
          409,
          'CUSTOMER_CREDIT_CONCURRENT_UPDATE',
          'Số dư hoặc đơn vừa thay đổi; tải lại rồi thử lại.',
        );
      }
      throw error;
    }
  }
}
