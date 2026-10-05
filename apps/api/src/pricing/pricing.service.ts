import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { ProblemException } from '../common/problem.exception';
import type { RequestStaff } from '../common/request-context';
import { Prisma, type Prisma as PrismaTypes } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { ResolveWholesalePriceQueryDto, SetPriceTierDto } from './dto/price-tier.dto';
import { priceQuantityFrom } from './pricing-rules';

const RETRIES = 3;

const priceTierSelect = {
  id: true,
  variantId: true,
  quantityFrom: true,
  priceVnd: true,
  version: true,
  updatedAt: true,
  variant: {
    select: {
      sku: true,
      name: true,
      baseUnitCode: true,
      baseUnitName: true,
      sellingUnitCode: true,
      sellingUnitName: true,
      sellingUnitFactor: true,
      product: { select: { name: true } },
    },
  },
} satisfies PrismaTypes.PriceTierSelect;

type PriceTierRecord = PrismaTypes.PriceTierGetPayload<{ select: typeof priceTierSelect }>;

function present(row: PriceTierRecord) {
  return {
    id: row.id,
    variantId: row.variantId,
    sku: row.variant.sku,
    productName: row.variant.product.name,
    variantName: row.variant.name,
    baseUnitCode: row.variant.baseUnitCode,
    baseUnitName: row.variant.baseUnitName,
    sellingUnitCode: row.variant.sellingUnitCode,
    sellingUnitName: row.variant.sellingUnitName,
    sellingUnitFactor: row.variant.sellingUnitFactor.toString(),
    quantityFrom: row.quantityFrom,
    priceVnd: row.priceVnd?.toFixed(0) ?? null,
    version: row.version,
    updatedAt: row.updatedAt,
  };
}

@Injectable()
export class PricingService {
  constructor(private readonly prisma: PrismaService) {}

  async list(businessId: string, variantId?: string) {
    const rows = await this.prisma.priceTier.findMany({
      where: { businessId, ...(variantId ? { variantId } : {}) },
      orderBy: [{ variant: { sku: 'asc' } }, { quantityFrom: 'asc' }],
      select: priceTierSelect,
    });
    return { items: rows.map(present) };
  }

  async resolveWholesalePrice(businessId: string, query: ResolveWholesalePriceQueryDto) {
    const quantityFrom = priceQuantityFrom(query.quantity);
    const variant = await this.prisma.productVariant.findFirst({
      where: { id: query.variantId, businessId },
      select: { id: true, sellingUnitCode: true, sellingUnitName: true },
    });
    if (!variant) {
      throw new ProblemException(
        404,
        'VARIANT_NOT_FOUND',
        'Không tìm thấy SKU trong đơn vị kinh doanh.',
      );
    }
    const row = await this.prisma.priceTier.findUnique({
      where: {
        businessId_variantId_quantityFrom: {
          businessId,
          variantId: query.variantId,
          quantityFrom,
        },
      },
      select: { priceVnd: true },
    });
    if (row?.priceVnd) {
      return {
        variantId: query.variantId,
        quantity: query.quantity,
        sellingUnitCode: variant.sellingUnitCode,
        sellingUnitName: variant.sellingUnitName,
        quantityFrom,
        priceVnd: row.priceVnd.toFixed(0),
        source: 'ADMIN',
        status: 'RESOLVED',
      };
    }
    return {
      variantId: query.variantId,
      quantity: query.quantity,
      sellingUnitCode: variant.sellingUnitCode,
      sellingUnitName: variant.sellingUnitName,
      quantityFrom,
      priceVnd: null,
      source: null,
      status: 'PRICE_NOT_CONFIGURED',
    };
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

  private requestHash(dto: SetPriceTierDto) {
    return createHash('sha256')
      .update(
        JSON.stringify({
          variantId: dto.variantId,
          quantityFrom: dto.quantityFrom,
          expectedVersion: dto.expectedVersion,
          priceVnd: dto.priceVnd,
        }),
      )
      .digest('hex');
  }

  private ensureSameRequest(existingHash: string, requestHash: string) {
    if (existingHash !== requestHash) {
      throw new ProblemException(
        409,
        'IDEMPOTENCY_KEY_REUSED',
        'Idempotency-Key đã được dùng cho nội dung giá khác.',
      );
    }
  }

  async setPriceTier(
    dto: SetPriceTierDto,
    rawKey: string | undefined,
    actor: RequestStaff,
    requestId: string,
  ) {
    const idempotencyKey = this.validateKey(rawKey);
    const requestHash = this.requestHash(dto);
    if (dto.quantityFrom !== 1 && (dto.quantityFrom < 5 || dto.quantityFrom % 5 !== 0)) {
      throw new ProblemException(
        422,
        'INVALID_PRICE_TIER',
        'Chỉ nhận giá lẻ ở bậc 1 hoặc bậc sỉ là bội số của 5 từ 5 trở lên.',
      );
    }
    if (dto.priceVnd === null && dto.expectedVersion === 0) {
      throw new ProblemException(
        422,
        'PRICE_TIER_NOT_CONFIGURED',
        'Không thể xóa bậc giá chưa được cấu hình.',
      );
    }

    const existingCommand = await this.prisma.priceTierCommand.findUnique({
      where: { businessId_idempotencyKey: { businessId: actor.businessId, idempotencyKey } },
      select: { requestHash: true, response: true },
    });
    if (existingCommand) {
      this.ensureSameRequest(existingCommand.requestHash, requestHash);
      return existingCommand.response;
    }

    for (let attempt = 0; attempt < RETRIES; attempt += 1) {
      try {
        return await this.prisma.$transaction(
          async (tx) => {
            const repeated = await tx.priceTierCommand.findUnique({
              where: {
                businessId_idempotencyKey: { businessId: actor.businessId, idempotencyKey },
              },
              select: { requestHash: true, response: true },
            });
            if (repeated) {
              this.ensureSameRequest(repeated.requestHash, requestHash);
              return repeated.response;
            }

            const variant = await tx.productVariant.findFirst({
              where: { id: dto.variantId, businessId: actor.businessId },
              select: { id: true },
            });
            if (!variant) {
              throw new ProblemException(
                404,
                'VARIANT_NOT_FOUND',
                'Không tìm thấy SKU trong đơn vị kinh doanh.',
              );
            }

            const current = await tx.priceTier.findUnique({
              where: {
                businessId_variantId_quantityFrom: {
                  businessId: actor.businessId,
                  variantId: dto.variantId,
                  quantityFrom: dto.quantityFrom,
                },
              },
              select: { id: true, priceVnd: true, version: true },
            });
            let response: Record<string, unknown>;
            let action: 'SET' | 'DELETE';
            let previousPriceVnd: string | null = null;

            if (current) {
              if (dto.expectedVersion !== current.version) {
                throw new ProblemException(
                  409,
                  'PRICE_TIER_VERSION_CONFLICT',
                  'Giá đã được thay đổi. Tải lại trước khi sửa.',
                );
              }
              previousPriceVnd = current.priceVnd?.toFixed(0) ?? null;
              if (dto.priceVnd === null) {
                const cleared = await tx.priceTier.update({
                  where: { id: current.id },
                  data: { priceVnd: null, version: { increment: 1 } },
                  select: priceTierSelect,
                });
                action = 'DELETE';
                response = present(cleared);
              } else {
                const updated = await tx.priceTier.update({
                  where: { id: current.id },
                  data: { priceVnd: new Prisma.Decimal(dto.priceVnd), version: { increment: 1 } },
                  select: priceTierSelect,
                });
                action = 'SET';
                response = present(updated);
              }
            } else {
              if (dto.expectedVersion !== 0) {
                throw new ProblemException(
                  409,
                  'PRICE_TIER_VERSION_CONFLICT',
                  'Bậc giá đã bị xóa hoặc chưa được cấu hình. Tải lại trước khi sửa.',
                );
              }
              if (dto.priceVnd === null) {
                throw new ProblemException(
                  422,
                  'PRICE_TIER_NOT_CONFIGURED',
                  'Không thể xóa bậc giá chưa được cấu hình.',
                );
              }
              const created = await tx.priceTier.create({
                data: {
                  businessId: actor.businessId,
                  variantId: dto.variantId,
                  quantityFrom: dto.quantityFrom,
                  priceVnd: new Prisma.Decimal(dto.priceVnd),
                },
                select: priceTierSelect,
              });
              action = 'SET';
              response = present(created);
            }

            const nextPrice = dto.priceVnd;
            await tx.auditLog.create({
              data: {
                businessId: actor.businessId,
                actorId: actor.id,
                action: action === 'SET' ? 'pricing.tier.set' : 'pricing.tier.delete',
                entityType: 'PriceTier',
                entityId: current?.id ?? (response.id as string | undefined) ?? null,
                requestId,
                metadata: {
                  variantId: dto.variantId,
                  quantityFrom: dto.quantityFrom,
                  previousPriceVnd,
                  priceVnd: nextPrice,
                  idempotencyKey,
                },
              },
            });
            await tx.priceTierCommand.create({
              data: {
                businessId: actor.businessId,
                idempotencyKey,
                requestHash,
                response: response as PrismaTypes.InputJsonObject,
              },
            });
            return response;
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
          if (attempt < RETRIES - 1) continue;
          throw new ProblemException(
            409,
            'PRICE_TIER_CONCURRENT_UPDATE',
            'Giá đang được sửa đồng thời. Tải lại rồi thử lại.',
          );
        }
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          const duplicate = await this.prisma.priceTierCommand.findUnique({
            where: { businessId_idempotencyKey: { businessId: actor.businessId, idempotencyKey } },
            select: { requestHash: true, response: true },
          });
          if (duplicate) {
            this.ensureSameRequest(duplicate.requestHash, requestHash);
            return duplicate.response;
          }
          throw new ProblemException(
            409,
            'PRICE_TIER_VERSION_CONFLICT',
            'Bậc giá vừa được thay đổi. Tải lại trước khi sửa.',
          );
        }
        throw error;
      }
    }
    throw new ProblemException(
      409,
      'PRICE_TIER_CONCURRENT_UPDATE',
      'Giá đang được sửa đồng thời. Tải lại rồi thử lại.',
    );
  }
}
