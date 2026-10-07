import { Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { ProblemException } from '../common/problem.exception';
import type { RequestStaff } from '../common/request-context';
import { Prisma, type Prisma as PrismaTypes } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { priceQuantityFrom } from '../pricing/pricing-rules';
import type {
  CreateQuoteDto,
  QuoteLineInputDto,
  SendQuoteDto,
  UpdateQuoteDto,
} from './dto/quote.dto';

const RETRIES = 3;
const HOUR_MS = 60 * 60 * 1000;
const MAX_VND = new Prisma.Decimal('99999999999999999999');

const quoteSelect = {
  id: true,
  businessId: true,
  quoteNumber: true,
  customerId: true,
  status: true,
  version: true,
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
  internalNote: true,
  receivedAt: true,
  expiresAt: true,
  createdAt: true,
  updatedAt: true,
  customer: {
    select: { id: true, customerCode: true, displayName: true, legalName: true, taxCode: true },
  },
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
  revisions: {
    orderBy: { revisionNumber: 'desc' as const },
    select: { id: true, revisionNumber: true, sentAt: true, receivedAt: true, expiresAt: true },
  },
  salesOrder: {
    select: { id: true, orderNumber: true, status: true, sourceRevision: true },
  },
} satisfies PrismaTypes.QuoteSelect;

type QuoteRecord = PrismaTypes.QuoteGetPayload<{ select: typeof quoteSelect }>;

function money(value: Prisma.Decimal) {
  return value.toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP);
}

function vnd(value: Prisma.Decimal | null) {
  return value?.toFixed(0) ?? '0';
}

function percentAmount(base: Prisma.Decimal, value: string) {
  return money(base.mul(new Prisma.Decimal(value)).div(100));
}

function assertVnd(value: Prisma.Decimal, field = 'thành tiền') {
  if (!value.isInteger() || value.lt(0) || value.gt(MAX_VND)) {
    throw new ProblemException(
      422,
      'MONEY_OUT_OF_RANGE',
      `${field} phải là VND nguyên trong phạm vi cho phép.`,
    );
  }
  return value;
}

function parseModeValue(mode?: 'PERCENTAGE' | 'FIXED_VND' | null, value?: string | null) {
  if (!mode && value == null) return { mode: null, value: null } as const;
  if (!mode || value == null) {
    throw new ProblemException(422, 'DISCOUNT_INPUT_INCOMPLETE', 'Chọn kiểu giảm và nhập giá trị.');
  }
  if (mode === 'PERCENTAGE' && new Prisma.Decimal(value).gt(100)) {
    throw new ProblemException(
      422,
      'DISCOUNT_EXCEEDS_TOTAL',
      'Tỷ lệ giảm không được vượt quá 100%.',
    );
  }
  if (mode === 'FIXED_VND' && !new Prisma.Decimal(value).isInteger()) {
    throw new ProblemException(422, 'INVALID_VND_AMOUNT', 'Số tiền VND phải là số nguyên.');
  }
  return { mode, value: new Prisma.Decimal(value) } as const;
}

function present(row: QuoteRecord) {
  const now = new Date();
  const effectiveStatus =
    row.status === 'SENT' && row.expiresAt && row.expiresAt.getTime() <= now.getTime()
      ? 'EXPIRED'
      : row.status;
  return {
    id: row.id,
    quoteNumber: row.quoteNumber,
    customerId: row.customerId,
    customer: row.customer,
    status: effectiveStatus,
    version: row.version,
    lineSubtotalVnd: vnd(row.lineSubtotalVnd),
    lineDiscountVnd: vnd(row.lineDiscountVnd),
    orderDiscountMode: row.orderDiscountMode,
    orderDiscountValue: row.orderDiscountValue?.toString() ?? null,
    orderDiscountVnd: vnd(row.orderDiscountVnd),
    shippingFeeVnd: vnd(row.shippingFeeVnd),
    taxMode: row.taxMode,
    taxValue: row.taxValue?.toString() ?? null,
    taxVnd: vnd(row.taxVnd),
    depositVnd: vnd(row.depositVnd),
    grandTotalVnd: vnd(row.grandTotalVnd),
    paymentNote: row.paymentNote,
    internalNote: row.internalNote,
    receivedAt: row.receivedAt,
    expiresAt: row.expiresAt,
    lines: row.lines.map((line) => ({
      ...line,
      sellingUnitFactor: line.sellingUnitFactor.toString(),
      quantity: line.quantity.toString(),
      unitPriceVnd: vnd(line.unitPriceVnd),
      lineSubtotalVnd: vnd(line.lineSubtotalVnd),
      discountValue: line.discountValue?.toString() ?? null,
      discountVnd: vnd(line.discountVnd),
      lineTotalVnd: vnd(line.lineTotalVnd),
    })),
    revisions: row.revisions,
    salesOrder: row.salesOrder,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

@Injectable()
export class QuoteService {
  constructor(private readonly prisma: PrismaService) {}

  private key(raw?: string, operation = 'command') {
    const key = raw?.trim();
    if (!key || !/^[A-Za-z0-9._:-]{8,100}$/.test(key)) {
      throw new ProblemException(
        400,
        'IDEMPOTENCY_KEY_REQUIRED',
        'Idempotency-Key phải có 8–100 ký tự an toàn.',
      );
    }
    return `${operation}:${key}`;
  }

  private hash(value: unknown) {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex');
  }

  private async replay(businessId: string, idempotencyKey: string, requestHash: string) {
    const command = await this.prisma.quoteCommand.findUnique({
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

  private async resolveLines(
    tx: PrismaTypes.TransactionClient,
    inputs: QuoteLineInputDto[],
    businessId: string,
    canDiscount: boolean,
  ) {
    const result: Array<Record<string, unknown>> = [];
    let subtotal = new Prisma.Decimal(0);
    let discountTotal = new Prisma.Decimal(0);
    for (const [index, input] of inputs.entries()) {
      const quantity = new Prisma.Decimal(input.quantity);
      if (!quantity.gt(0) || quantity.gt(1_000_000_000) || quantity.decimalPlaces() > 6) {
        throw new ProblemException(
          422,
          'INVALID_QUOTE_QUANTITY',
          'Số lượng phải dương và tối đa 6 số lẻ.',
        );
      }
      const variant = await tx.productVariant.findFirst({
        where: { id: input.variantId, businessId, status: 'ACTIVE', product: { status: 'ACTIVE' } },
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
      if (!variant)
        throw new ProblemException(
          404,
          'VARIANT_NOT_FOUND',
          'Không tìm thấy SKU đang bán trong đơn vị kinh doanh.',
        );
      const quantityFrom = priceQuantityFrom(input.quantity);
      const tier = await tx.priceTier.findUnique({
        where: {
          businessId_variantId_quantityFrom: { businessId, variantId: variant.id, quantityFrom },
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
      const lineSubtotal = assertVnd(money(quantity.mul(tier.priceVnd)), 'Thành tiền dòng');
      const discount = parseModeValue(input.discountMode, input.discountValue);
      if (discount.mode && !canDiscount)
        throw new ProblemException(
          403,
          'PERMISSION_DENIED',
          'Bạn không có quyền áp dụng giảm giá.',
        );
      const discountVnd = assertVnd(
        !discount.mode
          ? new Prisma.Decimal(0)
          : discount.mode === 'PERCENTAGE'
            ? percentAmount(lineSubtotal, input.discountValue!)
            : money(discount.value),
        'Giảm giá dòng',
      );
      if (discountVnd.gt(lineSubtotal))
        throw new ProblemException(
          422,
          'DISCOUNT_EXCEEDS_TOTAL',
          'Giảm giá dòng không được lớn hơn thành tiền dòng.',
        );
      const lineTotal = lineSubtotal.minus(discountVnd);
      subtotal = subtotal.plus(lineSubtotal);
      discountTotal = discountTotal.plus(discountVnd);
      result.push({
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
        discountMode: discount.mode,
        discountValue: discount.value,
        discountVnd,
        lineTotalVnd: lineTotal,
      });
    }
    assertVnd(subtotal, 'Tạm tính tiền hàng');
    assertVnd(discountTotal, 'Tổng giảm giá dòng');
    return {
      lines: result as PrismaTypes.QuoteLineUncheckedCreateWithoutQuoteInput[],
      subtotal,
      discountTotal,
      afterLineDiscount: subtotal.minus(discountTotal),
    };
  }

  private async calculate(
    tx: PrismaTypes.TransactionClient,
    businessId: string,
    dto: CreateQuoteDto,
    actor: RequestStaff,
  ) {
    const customer = await tx.customer.findFirst({
      where: { id: dto.customerId, businessId, status: 'ACTIVE' },
      select: { id: true },
    });
    if (!customer)
      throw new ProblemException(
        404,
        'CUSTOMER_NOT_FOUND',
        'Không tìm thấy khách hàng đang hoạt động.',
      );
    const canDiscount = actor.permissions.includes('price.edit');
    const lines = await this.resolveLines(tx, dto.lines, businessId, canDiscount);
    const orderDiscount = parseModeValue(dto.orderDiscountMode, dto.orderDiscountValue);
    if (orderDiscount.mode && !canDiscount)
      throw new ProblemException(
        403,
        'PERMISSION_DENIED',
        'Bạn không có quyền áp dụng giảm giá toàn báo giá.',
      );
    const orderDiscountVnd = assertVnd(
      !orderDiscount.mode
        ? new Prisma.Decimal(0)
        : orderDiscount.mode === 'PERCENTAGE'
          ? percentAmount(lines.afterLineDiscount, dto.orderDiscountValue!)
          : money(orderDiscount.value),
      'Giảm toàn báo giá',
    );
    if (orderDiscountVnd.gt(lines.afterLineDiscount))
      throw new ProblemException(
        422,
        'DISCOUNT_EXCEEDS_TOTAL',
        'Giảm toàn báo giá không được lớn hơn tiền hàng sau giảm dòng.',
      );
    const shippingFee = assertVnd(new Prisma.Decimal(dto.shippingFeeVnd ?? '0'), 'Phí giao');
    const discountedItems = lines.afterLineDiscount.minus(orderDiscountVnd);
    const taxMode = dto.taxMode ?? null;
    const taxValue = dto.taxValue == null ? null : new Prisma.Decimal(dto.taxValue);
    if ((taxMode === null) !== (taxValue === null))
      throw new ProblemException(422, 'TAX_INPUT_INCOMPLETE', 'Chọn kiểu thuế và nhập giá trị.');
    if (taxMode === 'PERCENTAGE' && taxValue!.gt(100))
      throw new ProblemException(
        422,
        'INVALID_TAX_PERCENTAGE',
        'Tỷ lệ thuế tạm dùng phải từ 0 đến 100%.',
      );
    if (taxMode === 'FIXED_VND' && !taxValue!.isInteger())
      throw new ProblemException(422, 'INVALID_VND_AMOUNT', 'Thuế VND phải là số nguyên.');
    // Tạm dùng: phần trăm tính trên tiền hàng sau mọi giảm giá cộng phí giao; cọc không thuộc cơ sở tính.
    const taxBase = discountedItems.plus(shippingFee);
    const taxVnd = assertVnd(
      !taxMode
        ? new Prisma.Decimal(0)
        : taxMode === 'PERCENTAGE'
          ? percentAmount(taxBase, dto.taxValue!)
          : money(taxValue!),
      'Thuế',
    );
    const grandTotal = assertVnd(discountedItems.plus(shippingFee).plus(taxVnd), 'Tổng báo giá');
    const deposit = assertVnd(new Prisma.Decimal(dto.depositVnd ?? '0'), 'Tiền cọc');
    if (deposit.gt(grandTotal))
      throw new ProblemException(
        422,
        'DEPOSIT_EXCEEDS_TOTAL',
        'Tiền cọc dự kiến không được lớn hơn tổng báo giá.',
      );
    return {
      customerId: customer.id,
      lines: lines.lines,
      lineSubtotalVnd: lines.subtotal,
      lineDiscountVnd: lines.discountTotal,
      orderDiscountMode: orderDiscount.mode,
      orderDiscountValue: orderDiscount.value,
      orderDiscountVnd,
      shippingFeeVnd: shippingFee,
      taxMode,
      taxValue,
      taxVnd,
      depositVnd: deposit,
      grandTotalVnd: grandTotal,
      paymentNote: dto.paymentNote?.trim() || null,
      internalNote: dto.internalNote?.trim() || null,
    };
  }

  async list(businessId: string, filters: { customerId?: string; status?: string }) {
    const rows = await this.prisma.quote.findMany({
      where: {
        businessId,
        ...(filters.customerId ? { customerId: filters.customerId } : {}),
        ...(filters.status && filters.status !== 'EXPIRED'
          ? { status: filters.status as PrismaTypes.QuoteWhereInput['status'] }
          : {}),
        ...(filters.status === 'EXPIRED' ? { status: 'SENT', expiresAt: { lte: new Date() } } : {}),
      },
      orderBy: { updatedAt: 'desc' },
      take: 100,
      select: quoteSelect,
    });
    return { items: rows.map(present) };
  }

  async get(id: string, businessId: string) {
    const row = await this.prisma.quote.findFirst({
      where: { id, businessId },
      select: quoteSelect,
    });
    if (!row) throw new ProblemException(404, 'QUOTE_NOT_FOUND', 'Không tìm thấy báo giá.');
    return present(row);
  }

  private async saveCommand(
    tx: PrismaTypes.TransactionClient,
    businessId: string,
    key: string,
    hash: string,
    response: unknown,
  ) {
    await tx.quoteCommand.create({
      data: {
        businessId,
        idempotencyKey: key,
        requestHash: hash,
        response: response as PrismaTypes.InputJsonObject,
      },
    });
  }

  private async runCommand<T>(
    businessId: string,
    key: string,
    hash: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
        throw new ProblemException(
          409,
          'QUOTE_CONCURRENT_UPDATE',
          'Báo giá vừa được thay đổi đồng thời; tải lại rồi thử lại.',
        );
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const repeated = await this.replay(businessId, key, hash);
        if (repeated) return repeated as T;
      }
      throw error;
    }
  }

  async create(
    dto: CreateQuoteDto,
    keyRaw: string | undefined,
    actor: RequestStaff,
    requestId: string,
  ) {
    if ((dto.taxMode || dto.taxValue != null) && !actor.permissions.includes('price.edit')) {
      throw new ProblemException(
        403,
        'PERMISSION_DENIED',
        'Chỉ người có quyền quản lý giá được cấu hình thuế báo giá.',
      );
    }
    const key = this.key(keyRaw, 'create');
    const requestHash = this.hash(dto);
    const replay = await this.replay(actor.businessId, key, requestHash);
    if (replay) return replay;
    for (let attempt = 0; attempt < RETRIES; attempt += 1) {
      try {
        return await this.prisma.$transaction(
          async (tx) => {
            const repeated = await tx.quoteCommand.findUnique({
              where: {
                businessId_idempotencyKey: { businessId: actor.businessId, idempotencyKey: key },
              },
              select: { requestHash: true, response: true },
            });
            if (repeated) {
              if (repeated.requestHash !== requestHash)
                throw new ProblemException(
                  409,
                  'IDEMPOTENCY_KEY_REUSED',
                  'Idempotency-Key đã dùng với nội dung khác.',
                );
              return repeated.response;
            }
            const calculated = await this.calculate(tx, actor.businessId, dto, actor);
            const number = `BG-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${randomBytes(3).toString('hex').toUpperCase()}`;
            const { lines, ...totals } = calculated;
            const created = await tx.quote.create({
              data: {
                businessId: actor.businessId,
                createdById: actor.id,
                quoteNumber: number,
                ...totals,
                lines: { create: lines },
              },
              select: { id: true },
            });
            const complete = await tx.quote.findUniqueOrThrow({
              where: { id: created.id },
              select: quoteSelect,
            });
            const response = present(complete);
            await tx.auditLog.create({
              data: {
                businessId: actor.businessId,
                actorId: actor.id,
                action: 'quote.create',
                entityType: 'Quote',
                entityId: created.id,
                requestId,
                metadata: { quoteNumber: number, idempotencyKey: keyRaw },
              },
            });
            await this.saveCommand(tx, actor.businessId, key, requestHash, response);
            return response;
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2034' &&
          attempt < RETRIES - 1
        )
          continue;
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          const repeated = await this.replay(actor.businessId, key, requestHash);
          if (repeated) return repeated;
        }
        throw error;
      }
    }
    throw new ProblemException(
      409,
      'QUOTE_CONCURRENT_UPDATE',
      'Báo giá đang được cập nhật đồng thời; thử tải lại.',
    );
  }

  async update(
    id: string,
    dto: UpdateQuoteDto,
    keyRaw: string | undefined,
    actor: RequestStaff,
    requestId: string,
  ) {
    const key = this.key(keyRaw, `update-${id}`);
    const requestHash = this.hash({ id, dto });
    const replay = await this.replay(actor.businessId, key, requestHash);
    if (replay) return replay;
    return this.runCommand(actor.businessId, key, requestHash, () =>
      this.prisma.$transaction(
        async (tx) => {
          const duplicate = await tx.quoteCommand.findUnique({
            where: {
              businessId_idempotencyKey: { businessId: actor.businessId, idempotencyKey: key },
            },
            select: { requestHash: true, response: true },
          });
          if (duplicate) {
            if (duplicate.requestHash !== requestHash)
              throw new ProblemException(
                409,
                'IDEMPOTENCY_KEY_REUSED',
                'Idempotency-Key đã dùng với nội dung khác.',
              );
            return duplicate.response;
          }
          const current = await tx.quote.findFirst({
            where: { id, businessId: actor.businessId },
            select: quoteSelect,
          });
          if (!current)
            throw new ProblemException(404, 'QUOTE_NOT_FOUND', 'Không tìm thấy báo giá.');
          if (current.status !== 'DRAFT')
            throw new ProblemException(409, 'QUOTE_NOT_EDITABLE', 'Chỉ có thể sửa báo giá nháp.');
          if (dto.expectedVersion !== current.version)
            throw new ProblemException(
              409,
              'QUOTE_VERSION_CONFLICT',
              'Báo giá đã đổi; tải lại trước khi sửa.',
            );
          if (
            (dto.taxMode !== undefined || dto.taxValue !== undefined) &&
            !actor.permissions.includes('price.edit')
          ) {
            throw new ProblemException(
              403,
              'PERMISSION_DENIED',
              'Chỉ người có quyền quản lý giá được thay đổi thuế báo giá.',
            );
          }
          const merged: CreateQuoteDto = {
            customerId: dto.customerId ?? current.customerId,
            lines:
              dto.lines ??
              current.lines.map((line) => ({
                variantId: line.variantId,
                quantity: line.quantity.toString(),
                ...(line.discountMode
                  ? {
                      discountMode: line.discountMode,
                      discountValue: line.discountValue?.toString(),
                    }
                  : {}),
              })),
            orderDiscountMode:
              dto.orderDiscountMode === null
                ? undefined
                : (dto.orderDiscountMode ?? current.orderDiscountMode ?? undefined),
            orderDiscountValue:
              dto.orderDiscountMode === null || dto.orderDiscountValue === null
                ? undefined
                : (dto.orderDiscountValue ?? current.orderDiscountValue?.toString()),
            shippingFeeVnd: dto.shippingFeeVnd ?? current.shippingFeeVnd.toFixed(0),
            taxMode:
              dto.taxMode === null ? undefined : (dto.taxMode ?? current.taxMode ?? undefined),
            taxValue:
              dto.taxMode === null || dto.taxValue === null
                ? undefined
                : (dto.taxValue ?? current.taxValue?.toString()),
            depositVnd: dto.depositVnd ?? current.depositVnd.toFixed(0),
            paymentNote: dto.paymentNote ?? current.paymentNote ?? undefined,
            internalNote: dto.internalNote ?? current.internalNote ?? undefined,
          };
          const calculated = await this.calculate(tx, actor.businessId, merged, actor);
          await tx.quoteLine.deleteMany({ where: { quoteId: id } });
          const { lines, ...totals } = calculated;
          const updated = await tx.quote.update({
            where: { id },
            data: { ...totals, version: { increment: 1 } },
            select: { id: true },
          });
          const lineData = lines.map((line) => ({ ...line, quoteId: id }));
          await tx.quoteLine.createMany({
            data: lineData,
          });
          const complete = await tx.quote.findUniqueOrThrow({
            where: { id: updated.id },
            select: quoteSelect,
          });
          const response = present(complete);
          await tx.auditLog.create({
            data: {
              businessId: actor.businessId,
              actorId: actor.id,
              action: 'quote.update',
              entityType: 'Quote',
              entityId: id,
              requestId,
              metadata: { version: dto.expectedVersion + 1 },
            },
          });
          await this.saveCommand(tx, actor.businessId, key, requestHash, response);
          return response;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      ),
    );
  }

  async send(
    id: string,
    dto: SendQuoteDto,
    keyRaw: string | undefined,
    actor: RequestStaff,
    requestId: string,
  ) {
    const key = this.key(keyRaw, `send-${id}`);
    const requestHash = this.hash({ id, dto });
    const replay = await this.replay(actor.businessId, key, requestHash);
    if (replay) return replay;
    const receivedAt = new Date(dto.receivedAt);
    if (!Number.isFinite(receivedAt.getTime()) || receivedAt.getTime() > Date.now() + 60_000) {
      throw new ProblemException(
        422,
        'INVALID_RECEIVED_AT',
        'Thời điểm khách nhận không được ở tương lai.',
      );
    }
    return this.runCommand(actor.businessId, key, requestHash, () =>
      this.prisma.$transaction(
        async (tx) => {
          const duplicate = await tx.quoteCommand.findUnique({
            where: {
              businessId_idempotencyKey: { businessId: actor.businessId, idempotencyKey: key },
            },
            select: { requestHash: true, response: true },
          });
          if (duplicate) {
            if (duplicate.requestHash !== requestHash)
              throw new ProblemException(
                409,
                'IDEMPOTENCY_KEY_REUSED',
                'Idempotency-Key đã dùng với nội dung khác.',
              );
            return duplicate.response;
          }
          const quote = await tx.quote.findFirst({
            where: { id, businessId: actor.businessId },
            select: quoteSelect,
          });
          if (!quote) throw new ProblemException(404, 'QUOTE_NOT_FOUND', 'Không tìm thấy báo giá.');
          if (quote.status !== 'DRAFT')
            throw new ProblemException(
              409,
              'QUOTE_NOT_SENDABLE',
              'Chỉ có thể phát hành báo giá nháp.',
            );
          if (dto.expectedVersion !== quote.version)
            throw new ProblemException(
              409,
              'QUOTE_VERSION_CONFLICT',
              'Báo giá đã đổi; tải lại trước khi phát hành.',
            );
          if (receivedAt.getTime() < quote.createdAt.getTime())
            throw new ProblemException(
              422,
              'INVALID_RECEIVED_AT',
              'Thời điểm khách nhận không được trước lúc tạo báo giá.',
            );
          const sentAt = new Date();
          const expiresAt = new Date(receivedAt.getTime() + 72 * HOUR_MS);
          const revisionNumber = (await tx.quoteRevision.count({ where: { quoteId: id } })) + 1;
          const snapshot = {
            ...present(quote),
            status: 'SENT',
            revisionNumber,
            receivedAt: receivedAt.toISOString(),
            expiresAt: expiresAt.toISOString(),
            sentAt: sentAt.toISOString(),
            taxPolicy:
              'Tạm dùng: thuế phần trăm tính trên tiền hàng sau giảm giá cộng phí giao; tiền cọc không thuộc cơ sở tính.',
          };
          await tx.quoteRevision.create({
            data: {
              quoteId: id,
              revisionNumber,
              snapshot,
              sentAt,
              receivedAt,
              expiresAt,
              sentById: actor.id,
            },
          });
          await tx.quote.update({
            where: { id },
            data: { status: 'SENT', version: { increment: 1 }, receivedAt, expiresAt },
          });
          await tx.auditLog.create({
            data: {
              businessId: actor.businessId,
              actorId: actor.id,
              action: 'quote.send',
              entityType: 'Quote',
              entityId: id,
              requestId,
              metadata: {
                revisionNumber,
                receivedAt: receivedAt.toISOString(),
                expiresAt: expiresAt.toISOString(),
                idempotencyKey: keyRaw,
              },
            },
          });
          const response = {
            id,
            quoteNumber: quote.quoteNumber,
            status: 'SENT',
            revisionNumber,
            receivedAt,
            expiresAt,
            snapshot,
          };
          await this.saveCommand(tx, actor.businessId, key, requestHash, response);
          return response;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      ),
    );
  }

  async convert(
    id: string,
    dto: { expectedVersion: number },
    keyRaw: string | undefined,
    actor: RequestStaff,
    requestId: string,
  ) {
    const key = this.key(keyRaw, `convert-${id}`);
    const requestHash = this.hash({ id, dto });
    const replay = await this.replay(actor.businessId, key, requestHash);
    if (replay) return replay;

    try {
      return await this.runCommand(actor.businessId, key, requestHash, () =>
        this.prisma.$transaction(
          async (tx) => {
            const duplicate = await tx.quoteCommand.findUnique({
              where: {
                businessId_idempotencyKey: {
                  businessId: actor.businessId,
                  idempotencyKey: key,
                },
              },
              select: { requestHash: true, response: true },
            });
            if (duplicate) {
              if (duplicate.requestHash !== requestHash)
                throw new ProblemException(
                  409,
                  'IDEMPOTENCY_KEY_REUSED',
                  'Idempotency-Key đã dùng với nội dung khác.',
                );
              return duplicate.response;
            }

            const quote = await tx.quote.findFirst({
              where: { id, businessId: actor.businessId },
              select: quoteSelect,
            });
            if (!quote)
              throw new ProblemException(404, 'QUOTE_NOT_FOUND', 'Không tìm thấy báo giá.');
            if (quote.salesOrder)
              throw new ProblemException(
                409,
                'QUOTE_ALREADY_CONVERTED',
                'Báo giá này đã được chuyển thành đơn nháp.',
              );
            if (quote.version !== dto.expectedVersion)
              throw new ProblemException(
                409,
                'QUOTE_VERSION_CONFLICT',
                'Báo giá đã thay đổi; hãy tải lại trước khi chuyển thành đơn.',
              );
            if (quote.status !== 'SENT' || !quote.expiresAt)
              throw new ProblemException(
                409,
                'QUOTE_NOT_CONVERTIBLE',
                'Chỉ báo giá đã gửi mới có thể chuyển thành đơn nháp.',
              );
            const now = new Date();
            if (quote.expiresAt.getTime() <= now.getTime())
              throw new ProblemException(
                409,
                'QUOTE_EXPIRED',
                'Báo giá đã hết hạn; cần gửi lại báo giá mới trước khi tạo đơn.',
              );
            const sourceRevision = quote.revisions[0];
            if (!sourceRevision)
              throw new ProblemException(
                409,
                'QUOTE_REVISION_MISSING',
                'Không tìm thấy revision đã phát hành của báo giá.',
              );

            const administrators = await tx.staffUser.findMany({
              where: {
                businessId: actor.businessId,
                status: 'ACTIVE',
                roles: {
                  some: {
                    role: {
                      permissions: { some: { permissionKey: 'staff.manage' } },
                    },
                  },
                },
              },
              select: { id: true },
            });
            if (administrators.length === 0)
              throw new ProblemException(
                409,
                'ADMIN_RECIPIENT_NOT_CONFIGURED',
                'Không có nhân viên quản lý đang hoạt động để nhận thông báo đơn mới.',
              );

            const day = now.toISOString().slice(0, 10).replaceAll('-', '');
            const orderNumber = `SO-${day}-${randomBytes(4).toString('hex').toUpperCase()}`;
            const order = await tx.salesOrder.create({
              data: {
                businessId: actor.businessId,
                customerId: quote.customerId,
                createdById: actor.id,
                sourceQuoteId: quote.id,
                orderNumber,
                sourceRevision: sourceRevision.revisionNumber,
                lineSubtotalVnd: quote.lineSubtotalVnd,
                lineDiscountVnd: quote.lineDiscountVnd,
                orderDiscountMode: quote.orderDiscountMode,
                orderDiscountValue: quote.orderDiscountValue,
                orderDiscountVnd: quote.orderDiscountVnd,
                shippingFeeVnd: quote.shippingFeeVnd,
                taxMode: quote.taxMode,
                taxValue: quote.taxValue,
                taxVnd: quote.taxVnd,
                depositVnd: quote.depositVnd,
                grandTotalVnd: quote.grandTotalVnd,
                paymentNote: quote.paymentNote,
                lines: {
                  create: quote.lines.map((line) => ({
                    variantId: line.variantId,
                    lineNumber: line.lineNumber,
                    productNameSnapshot: line.productNameSnapshot,
                    skuSnapshot: line.skuSnapshot,
                    variantNameSnapshot: line.variantNameSnapshot,
                    unitCodeSnapshot: line.unitCodeSnapshot,
                    unitNameSnapshot: line.unitNameSnapshot,
                    sellingUnitFactor: line.sellingUnitFactor,
                    quantity: line.quantity,
                    quantityFrom: line.quantityFrom,
                    unitPriceVnd: line.unitPriceVnd,
                    lineSubtotalVnd: line.lineSubtotalVnd,
                    discountMode: line.discountMode,
                    discountValue: line.discountValue,
                    discountVnd: line.discountVnd,
                    lineTotalVnd: line.lineTotalVnd,
                  })),
                },
              },
              select: { id: true, orderNumber: true, status: true, sourceRevision: true },
            });
            const transitioned = await tx.quote.updateMany({
              where: {
                id: quote.id,
                businessId: actor.businessId,
                status: 'SENT',
                version: dto.expectedVersion,
                expiresAt: { gt: now },
              },
              data: { status: 'ACCEPTED', version: { increment: 1 } },
            });
            if (transitioned.count !== 1)
              throw new ProblemException(
                409,
                'QUOTE_VERSION_CONFLICT',
                'Báo giá đã thay đổi hoặc hết hạn; hãy tải lại trước khi chuyển thành đơn.',
              );

            await tx.adminAlert.createMany({
              data: administrators.map(({ id: recipientId }) => ({
                businessId: actor.businessId,
                recipientId,
                orderId: order.id,
                type: 'QUOTE_CONVERTED' as const,
                title: 'Có đơn hàng nháp mới',
                body: `Đơn ${orderNumber} được tạo từ báo giá ${quote.quoteNumber}.`,
              })),
            });
            await tx.auditLog.create({
              data: {
                businessId: actor.businessId,
                actorId: actor.id,
                action: 'quote.convert',
                entityType: 'SalesOrder',
                entityId: order.id,
                requestId,
                metadata: {
                  quoteId: quote.id,
                  quoteNumber: quote.quoteNumber,
                  orderNumber,
                  sourceRevision: sourceRevision.revisionNumber,
                  idempotencyKey: keyRaw,
                  alertRecipientCount: administrators.length,
                },
              },
            });

            const completeOrder = await tx.salesOrder.findUniqueOrThrow({
              where: { id: order.id },
              include: { lines: { orderBy: { lineNumber: 'asc' } } },
            });
            const completeQuote = await tx.quote.findUniqueOrThrow({
              where: { id: quote.id },
              select: quoteSelect,
            });
            const response = {
              order: {
                ...completeOrder,
                lineSubtotalVnd: vnd(completeOrder.lineSubtotalVnd),
                lineDiscountVnd: vnd(completeOrder.lineDiscountVnd),
                orderDiscountValue: completeOrder.orderDiscountValue?.toString() ?? null,
                orderDiscountVnd: vnd(completeOrder.orderDiscountVnd),
                shippingFeeVnd: vnd(completeOrder.shippingFeeVnd),
                taxValue: completeOrder.taxValue?.toString() ?? null,
                taxVnd: vnd(completeOrder.taxVnd),
                depositVnd: vnd(completeOrder.depositVnd),
                grandTotalVnd: vnd(completeOrder.grandTotalVnd),
                lines: completeOrder.lines.map((line) => ({
                  ...line,
                  sellingUnitFactor: line.sellingUnitFactor.toString(),
                  quantity: line.quantity.toString(),
                  unitPriceVnd: vnd(line.unitPriceVnd),
                  lineSubtotalVnd: vnd(line.lineSubtotalVnd),
                  discountValue: line.discountValue?.toString() ?? null,
                  discountVnd: vnd(line.discountVnd),
                  lineTotalVnd: vnd(line.lineTotalVnd),
                })),
              },
              quote: present(completeQuote),
              alertsCreated: administrators.length,
            };
            await this.saveCommand(tx, actor.businessId, key, requestHash, response);
            return response;
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        ),
      );
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const existing = await this.prisma.salesOrder.findFirst({
          where: { businessId: actor.businessId, sourceQuoteId: id },
          select: { id: true },
        });
        if (existing)
          throw new ProblemException(
            409,
            'QUOTE_ALREADY_CONVERTED',
            'Báo giá này đã được chuyển thành đơn nháp.',
          );
      }
      throw error;
    }
  }

  async revision(id: string, revisionNumber: number, businessId: string) {
    const revision = await this.prisma.quoteRevision.findFirst({
      where: { quoteId: id, revisionNumber, quote: { businessId } },
      select: {
        id: true,
        quoteId: true,
        revisionNumber: true,
        snapshot: true,
        sentAt: true,
        receivedAt: true,
        expiresAt: true,
      },
    });
    if (!revision)
      throw new ProblemException(
        404,
        'QUOTE_REVISION_NOT_FOUND',
        'Không tìm thấy phiên bản báo giá.',
      );
    return revision;
  }
}
