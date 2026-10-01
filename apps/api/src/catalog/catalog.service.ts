import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { ProblemException } from '../common/problem.exception';
import type { RequestStaff } from '../common/request-context';
import { Prisma, type Prisma as PrismaTypes } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type {
  CreateMediaDto,
  CreateProductDto,
  CreateVariantDto,
  ListProductsQueryDto,
  ReplaceConversionsDto,
  UnitConversionInputDto,
  UpdateMediaDto,
  UpdateProductDto,
  UpdateVariantDto,
} from './dto/catalog.dto';

const productSummarySelect = {
  id: true,
  name: true,
  category: true,
  brand: true,
  status: true,
  version: true,
  updatedAt: true,
  variants: {
    orderBy: { sku: 'asc' as const },
    select: {
      id: true,
      sku: true,
      name: true,
      barcode: true,
      baseUnitCode: true,
      baseUnitName: true,
      status: true,
      version: true,
    },
  },
  _count: { select: { variants: true, media: true } },
} satisfies PrismaTypes.ProductSelect;

const productDetailSelect = {
  ...productSummarySelect,
  description: true,
  createdAt: true,
  variants: {
    orderBy: { sku: 'asc' as const },
    select: {
      id: true,
      sku: true,
      name: true,
      barcode: true,
      baseUnitCode: true,
      baseUnitName: true,
      attributes: true,
      status: true,
      version: true,
      conversions: {
        orderBy: { factor: 'asc' as const },
        select: { id: true, unitCode: true, unitName: true, factor: true },
      },
    },
  },
  media: {
    orderBy: [{ sortOrder: 'asc' as const }, { createdAt: 'asc' as const }],
    select: {
      id: true,
      variantId: true,
      url: true,
      altText: true,
      sortOrder: true,
      status: true,
    },
  },
} satisfies PrismaTypes.ProductSelect;

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  private normalizeSku(value: string) {
    return value.trim().toUpperCase();
  }

  private normalizeUnitCode(value: string) {
    return value.trim().toUpperCase();
  }

  private sanitizeAttributes(
    attributes?: Record<string, string>,
  ): PrismaTypes.InputJsonObject | undefined {
    if (!attributes) return undefined;
    const entries = Object.entries(attributes);
    if (entries.length > 20) {
      throw new ProblemException(422, 'TOO_MANY_ATTRIBUTES', 'Tối đa 20 thuộc tính cho một SKU.');
    }
    const clean: Record<string, string> = {};
    for (const [rawKey, rawValue] of entries) {
      const key = rawKey.trim();
      const value = String(rawValue).trim();
      if (!key || key.length > 50 || value.length > 100) {
        throw new ProblemException(
          422,
          'INVALID_VARIANT_ATTRIBUTE',
          'Tên thuộc tính tối đa 50 ký tự và giá trị tối đa 100 ký tự.',
        );
      }
      clean[key] = value;
    }
    return clean;
  }

  private cleanConversions(baseUnitCode: string, conversions: UnitConversionInputDto[] = []) {
    const base = this.normalizeUnitCode(baseUnitCode);
    const seen = new Set<string>();
    return conversions.map((conversion) => {
      const unitCode = this.normalizeUnitCode(conversion.unitCode);
      if (unitCode === base) {
        throw new ProblemException(
          422,
          'BASE_UNIT_CONVERSION_FORBIDDEN',
          'Đơn vị gốc luôn có hệ số 1 và không được lặp trong danh sách quy đổi.',
        );
      }
      if (seen.has(unitCode)) {
        throw new ProblemException(422, 'DUPLICATE_UNIT_CODE', 'Mã đơn vị quy đổi bị lặp.');
      }
      if (/^0+(?:\.0+)?$/.test(conversion.factor)) {
        throw new ProblemException(
          422,
          'INVALID_CONVERSION_FACTOR',
          'Hệ số quy đổi phải lớn hơn 0.',
        );
      }
      seen.add(unitCode);
      return {
        id: randomUUID(),
        unitCode,
        unitName: conversion.unitName.trim(),
        factor: conversion.factor,
      };
    });
  }

  private cleanVariant(dto: CreateVariantDto) {
    const baseUnitCode = this.normalizeUnitCode(dto.baseUnitCode);
    return {
      id: randomUUID(),
      sku: this.normalizeSku(dto.sku),
      name: dto.name.trim(),
      barcode: dto.barcode?.trim() || null,
      baseUnitCode,
      baseUnitName: dto.baseUnitName.trim(),
      attributes: this.sanitizeAttributes(dto.attributes),
      conversions: this.cleanConversions(baseUnitCode, dto.conversions),
    };
  }

  private ensureDistinctVariants(variants: ReturnType<CatalogService['cleanVariant']>[]) {
    const skus = new Set<string>();
    const barcodes = new Set<string>();
    for (const variant of variants) {
      if (skus.has(variant.sku)) {
        throw new ProblemException(422, 'DUPLICATE_SKU_IN_REQUEST', 'SKU bị lặp trong sản phẩm.');
      }
      skus.add(variant.sku);
      if (variant.barcode) {
        if (barcodes.has(variant.barcode)) {
          throw new ProblemException(
            422,
            'DUPLICATE_BARCODE_IN_REQUEST',
            'Barcode bị lặp trong sản phẩm.',
          );
        }
        barcodes.add(variant.barcode);
      }
    }
  }

  private async ensureCatalogUnique(
    businessId: string,
    variants: ReturnType<CatalogService['cleanVariant']>[],
  ) {
    const skus = variants.map(({ sku }) => sku);
    const barcodes = variants
      .map(({ barcode }) => barcode)
      .filter((barcode): barcode is string => Boolean(barcode));
    const existing = await this.prisma.productVariant.findFirst({
      where: {
        businessId,
        OR: [{ sku: { in: skus } }, ...(barcodes.length ? [{ barcode: { in: barcodes } }] : [])],
      },
      select: { sku: true, barcode: true },
    });
    if (existing?.sku && skus.includes(existing.sku)) {
      throw new ProblemException(409, 'SKU_ALREADY_EXISTS', 'SKU đã tồn tại trong đơn vị.');
    }
    if (existing?.barcode && barcodes.includes(existing.barcode)) {
      throw new ProblemException(409, 'BARCODE_ALREADY_EXISTS', 'Barcode đã tồn tại trong đơn vị.');
    }
  }

  private throwMappedDatabaseError(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const target = Array.isArray(error.meta?.target) ? error.meta.target.join(',') : '';
      if (target.includes('sku') || error.message.includes('business_id_sku')) {
        throw new ProblemException(409, 'SKU_ALREADY_EXISTS', 'SKU đã tồn tại trong đơn vị.');
      }
      if (target.includes('barcode') || error.message.includes('business_id_barcode')) {
        throw new ProblemException(
          409,
          'BARCODE_ALREADY_EXISTS',
          'Barcode đã tồn tại trong đơn vị.',
        );
      }
    }
    throw error;
  }

  async list(businessId: string, query: ListProductsQueryDto) {
    const search = query.query?.trim();
    const where: PrismaTypes.ProductWhereInput = {
      businessId,
      ...(query.status ? { status: query.status } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { category: { contains: search, mode: 'insensitive' } },
              {
                variants: {
                  some: {
                    OR: [
                      { sku: { contains: search.toUpperCase(), mode: 'insensitive' } },
                      { barcode: { contains: search, mode: 'insensitive' } },
                    ],
                  },
                },
              },
            ],
          }
        : {}),
    };
    const rows = await this.prisma.product.findMany({
      where,
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      select: productSummarySelect,
    });
    const hasMore = rows.length > query.limit;
    const items = hasMore ? rows.slice(0, query.limit) : rows;
    return { items, nextCursor: hasMore ? items.at(-1)?.id : null, hasMore };
  }

  async getById(id: string, businessId: string) {
    const product = await this.prisma.product.findFirst({
      where: { id, businessId },
      select: productDetailSelect,
    });
    if (!product) {
      throw new ProblemException(404, 'RESOURCE_NOT_FOUND', 'Không tìm thấy sản phẩm.');
    }
    return product;
  }

  async create(dto: CreateProductDto, actor: RequestStaff, requestId: string) {
    const variants = dto.variants.map((variant) => this.cleanVariant(variant));
    this.ensureDistinctVariants(variants);
    await this.ensureCatalogUnique(actor.businessId, variants);
    const productId = randomUUID();
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.product.create({
          data: {
            id: productId,
            businessId: actor.businessId,
            name: dto.name.trim(),
            description: dto.description?.trim() || null,
            category: dto.category?.trim() || null,
            brand: dto.brand?.trim() || null,
          },
        });
        for (const variant of variants) {
          await tx.productVariant.create({
            data: {
              id: variant.id,
              businessId: actor.businessId,
              productId,
              sku: variant.sku,
              name: variant.name,
              barcode: variant.barcode,
              baseUnitCode: variant.baseUnitCode,
              baseUnitName: variant.baseUnitName,
              attributes: variant.attributes,
              conversions: {
                create: variant.conversions.map(({ id, ...conversion }) => ({ id, ...conversion })),
              },
            },
          });
        }
        await tx.auditLog.create({
          data: {
            businessId: actor.businessId,
            actorId: actor.id,
            action: 'catalog.product.create',
            entityType: 'Product',
            entityId: productId,
            requestId,
            metadata: { variantCount: variants.length, skus: variants.map(({ sku }) => sku) },
          },
        });
      });
    } catch (error) {
      this.throwMappedDatabaseError(error);
    }
    return this.getById(productId, actor.businessId);
  }

  async updateProduct(id: string, dto: UpdateProductDto, actor: RequestStaff, requestId: string) {
    await this.prisma.$transaction(async (tx) => {
      const result = await tx.product.updateMany({
        where: { id, businessId: actor.businessId, version: dto.version },
        data: {
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.description !== undefined ? { description: dto.description.trim() || null } : {}),
          ...(dto.category !== undefined ? { category: dto.category.trim() || null } : {}),
          ...(dto.brand !== undefined ? { brand: dto.brand.trim() || null } : {}),
          ...(dto.status ? { status: dto.status } : {}),
          version: { increment: 1 },
        },
      });
      if (result.count !== 1) {
        const exists = await tx.product.findFirst({ where: { id, businessId: actor.businessId } });
        throw new ProblemException(
          exists ? 409 : 404,
          exists ? 'VERSION_CONFLICT' : 'RESOURCE_NOT_FOUND',
          exists ? 'Sản phẩm đã được cập nhật ở nơi khác.' : 'Không tìm thấy sản phẩm.',
        );
      }
      await tx.auditLog.create({
        data: {
          businessId: actor.businessId,
          actorId: actor.id,
          action:
            dto.status === 'INACTIVE' ? 'catalog.product.deactivate' : 'catalog.product.update',
          entityType: 'Product',
          entityId: id,
          requestId,
          metadata: { previousVersion: dto.version, status: dto.status },
        },
      });
    });
    return this.getById(id, actor.businessId);
  }

  async addVariant(
    productId: string,
    dto: CreateVariantDto,
    actor: RequestStaff,
    requestId: string,
  ) {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, businessId: actor.businessId },
      select: { id: true },
    });
    if (!product) {
      throw new ProblemException(404, 'RESOURCE_NOT_FOUND', 'Không tìm thấy sản phẩm.');
    }
    const variant = this.cleanVariant(dto);
    await this.ensureCatalogUnique(actor.businessId, [variant]);
    try {
      await this.prisma.$transaction([
        this.prisma.productVariant.create({
          data: {
            id: variant.id,
            businessId: actor.businessId,
            productId,
            sku: variant.sku,
            name: variant.name,
            barcode: variant.barcode,
            baseUnitCode: variant.baseUnitCode,
            baseUnitName: variant.baseUnitName,
            attributes: variant.attributes,
            conversions: { create: variant.conversions },
          },
        }),
        this.prisma.auditLog.create({
          data: {
            businessId: actor.businessId,
            actorId: actor.id,
            action: 'catalog.variant.create',
            entityType: 'ProductVariant',
            entityId: variant.id,
            requestId,
            metadata: { productId, sku: variant.sku },
          },
        }),
      ]);
    } catch (error) {
      this.throwMappedDatabaseError(error);
    }
    return this.getById(productId, actor.businessId);
  }

  async updateVariant(id: string, dto: UpdateVariantDto, actor: RequestStaff, requestId: string) {
    const attributes =
      dto.attributes === undefined ? undefined : this.sanitizeAttributes(dto.attributes);
    let productId = '';
    try {
      await this.prisma.$transaction(async (tx) => {
        const current = await tx.productVariant.findFirst({
          where: { id, businessId: actor.businessId },
          select: { productId: true },
        });
        if (!current) {
          throw new ProblemException(404, 'RESOURCE_NOT_FOUND', 'Không tìm thấy SKU.');
        }
        productId = current.productId;
        const result = await tx.productVariant.updateMany({
          where: { id, businessId: actor.businessId, version: dto.version },
          data: {
            ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
            ...(dto.barcode !== undefined ? { barcode: dto.barcode.trim() || null } : {}),
            ...(attributes !== undefined ? { attributes } : {}),
            ...(dto.status ? { status: dto.status } : {}),
            version: { increment: 1 },
          },
        });
        if (result.count !== 1) {
          throw new ProblemException(409, 'VERSION_CONFLICT', 'SKU đã được cập nhật ở nơi khác.');
        }
        await tx.auditLog.create({
          data: {
            businessId: actor.businessId,
            actorId: actor.id,
            action:
              dto.status === 'INACTIVE' ? 'catalog.variant.deactivate' : 'catalog.variant.update',
            entityType: 'ProductVariant',
            entityId: id,
            requestId,
            metadata: { productId, previousVersion: dto.version, status: dto.status },
          },
        });
      });
    } catch (error) {
      this.throwMappedDatabaseError(error);
    }
    return this.getById(productId, actor.businessId);
  }

  async replaceConversions(
    id: string,
    dto: ReplaceConversionsDto,
    actor: RequestStaff,
    requestId: string,
  ) {
    let productId = '';
    await this.prisma.$transaction(async (tx) => {
      const variant = await tx.productVariant.findFirst({
        where: { id, businessId: actor.businessId },
        select: { productId: true, baseUnitCode: true },
      });
      if (!variant) {
        throw new ProblemException(404, 'RESOURCE_NOT_FOUND', 'Không tìm thấy SKU.');
      }
      productId = variant.productId;
      const referencedByPurchaseOrder = await tx.purchaseOrderLine.count({
        where: { variantId: id },
      });
      if (referencedByPurchaseOrder > 0) {
        throw new ProblemException(
          409,
          'UNIT_CONVERSION_IN_USE',
          'SKU đã được chứng từ mua tham chiếu; không thể thay danh sách quy đổi.',
        );
      }
      const conversions = this.cleanConversions(variant.baseUnitCode, dto.conversions);
      const update = await tx.productVariant.updateMany({
        where: { id, version: dto.version },
        data: { version: { increment: 1 } },
      });
      if (update.count !== 1) {
        throw new ProblemException(409, 'VERSION_CONFLICT', 'SKU đã được cập nhật ở nơi khác.');
      }
      await tx.unitConversion.deleteMany({ where: { variantId: id } });
      if (conversions.length) {
        await tx.unitConversion.createMany({
          data: conversions.map((conversion) => ({ ...conversion, variantId: id })),
        });
      }
      await tx.auditLog.create({
        data: {
          businessId: actor.businessId,
          actorId: actor.id,
          action: 'catalog.unit_conversions.replace',
          entityType: 'ProductVariant',
          entityId: id,
          requestId,
          metadata: {
            productId,
            previousVersion: dto.version,
            units: conversions.map(({ unitCode, factor }) => ({ unitCode, factor })),
          },
        },
      });
    });
    return this.getById(productId, actor.businessId);
  }

  async addMedia(productId: string, dto: CreateMediaDto, actor: RequestStaff, requestId: string) {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, businessId: actor.businessId },
      select: { id: true },
    });
    if (!product) {
      throw new ProblemException(404, 'RESOURCE_NOT_FOUND', 'Không tìm thấy sản phẩm.');
    }
    if (dto.variantId) {
      const variant = await this.prisma.productVariant.findFirst({
        where: { id: dto.variantId, productId, businessId: actor.businessId },
        select: { id: true },
      });
      if (!variant) {
        throw new ProblemException(422, 'VARIANT_NOT_IN_PRODUCT', 'SKU không thuộc sản phẩm này.');
      }
    }
    const id = randomUUID();
    await this.prisma.$transaction([
      this.prisma.mediaAsset.create({
        data: {
          id,
          productId,
          variantId: dto.variantId || null,
          url: dto.url,
          altText: dto.altText?.trim() || null,
          sortOrder: dto.sortOrder ?? 0,
        },
      }),
      this.prisma.auditLog.create({
        data: {
          businessId: actor.businessId,
          actorId: actor.id,
          action: 'catalog.media.create',
          entityType: 'MediaAsset',
          entityId: id,
          requestId,
          metadata: { productId, variantId: dto.variantId || null },
        },
      }),
    ]);
    return this.getById(productId, actor.businessId);
  }

  async updateMedia(id: string, dto: UpdateMediaDto, actor: RequestStaff, requestId: string) {
    const media = await this.prisma.mediaAsset.findFirst({
      where: { id, product: { businessId: actor.businessId } },
      select: { productId: true },
    });
    if (!media) {
      throw new ProblemException(404, 'RESOURCE_NOT_FOUND', 'Không tìm thấy ảnh sản phẩm.');
    }
    await this.prisma.$transaction([
      this.prisma.mediaAsset.update({
        where: { id },
        data: {
          ...(dto.altText !== undefined ? { altText: dto.altText.trim() || null } : {}),
          ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
          ...(dto.status ? { status: dto.status } : {}),
        },
      }),
      this.prisma.auditLog.create({
        data: {
          businessId: actor.businessId,
          actorId: actor.id,
          action: dto.status === 'ARCHIVED' ? 'catalog.media.archive' : 'catalog.media.update',
          entityType: 'MediaAsset',
          entityId: id,
          requestId,
          metadata: { productId: media.productId, status: dto.status },
        },
      }),
    ]);
    return this.getById(media.productId, actor.businessId);
  }
}
