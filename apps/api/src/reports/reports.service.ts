import { Injectable } from '@nestjs/common';
import { ProblemException } from '../common/problem.exception';
import type { RequestStaff } from '../common/request-context';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { SalesReportQueryDto } from './dto/sales-report.dto';

type MonthlyRevenueRow = { month: string; revenueVnd: string };
type BestSellerRow = {
  variantId: string;
  sku: string;
  productName: string;
  variantName: string;
  baseUnitName: string;
  deliveredBaseQuantity: string;
};

function todayAtTimezone(timezone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function defaultStart(currentDate: string) {
  const [year, month] = currentDate.split('-').map(Number);
  const start = new Date(Date.UTC(year!, month! - 12, 1));
  return `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

function validateDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value;
}

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async sales(query: SalesReportQueryDto, actor: RequestStaff) {
    const business = await this.prisma.business.findUniqueOrThrow({
      where: { id: actor.businessId },
      select: { timezone: true },
    });
    const to = query.to ?? todayAtTimezone(business.timezone);
    const from = query.from ?? defaultStart(to);
    if (!validateDate(from) || !validateDate(to)) {
      throw new ProblemException(
        422,
        'REPORT_DATE_INVALID',
        'Ngày báo cáo phải đúng định dạng YYYY-MM-DD.',
      );
    }
    if (from > to) {
      throw new ProblemException(
        422,
        'REPORT_RANGE_INVALID',
        'Ngày bắt đầu không được sau ngày kết thúc.',
      );
    }
    const span =
      (Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) / 86_400_000;
    if (span > 730) {
      throw new ProblemException(
        422,
        'REPORT_RANGE_TOO_LARGE',
        'Khoảng báo cáo tối đa là 731 ngày.',
      );
    }

    const dateFilters = Prisma.sql`
      s."delivered_at" >= (${from}::date::timestamp AT TIME ZONE ${business.timezone})
      AND s."delivered_at" < ((${to}::date + 1)::timestamp AT TIME ZONE ${business.timezone})
    `;
    const [monthlyRevenue, topProducts] = await Promise.all([
      this.prisma.$queryRaw<MonthlyRevenueRow[]>(Prisma.sql`
        SELECT to_char(date_trunc('month', s."delivered_at" AT TIME ZONE ${business.timezone}), 'YYYY-MM') AS "month",
               COALESCE(SUM(s."recognized_revenue_vnd"), 0)::text AS "revenueVnd"
        FROM "shipments" s
        WHERE s."business_id" = ${actor.businessId}
          AND s."status" = 'DELIVERED'
          AND ${dateFilters}
        GROUP BY 1
        ORDER BY 1
      `),
      this.prisma.$queryRaw<BestSellerRow[]>(Prisma.sql`
        SELECT pv."id" AS "variantId", pv."sku", p."name" AS "productName",
               pv."name" AS "variantName", pv."base_unit_name" AS "baseUnitName",
               SUM(sl."base_quantity")::text AS "deliveredBaseQuantity"
        FROM "shipment_lines" sl
        INNER JOIN "shipments" s ON s."id" = sl."shipment_id"
        INNER JOIN "product_variants" pv ON pv."id" = sl."variant_id"
        INNER JOIN "products" p ON p."id" = pv."product_id"
        WHERE s."business_id" = ${actor.businessId}
          AND s."status" = 'DELIVERED'
          AND ${dateFilters}
        GROUP BY pv."id", pv."sku", p."name", pv."name", pv."base_unit_name"
        ORDER BY SUM(sl."base_quantity") DESC, pv."sku" ASC
        LIMIT 10
      `),
    ]);

    return {
      range: { from, to, timezone: business.timezone },
      revenueBasis: 'DELIVERED_GOODS_GROSS_BEFORE_RETURNS',
      quantityBasis: 'DELIVERED_BASE_UNIT_QUANTITY',
      monthlyRevenue: monthlyRevenue.map((row) => ({ ...row, revenueVnd: row.revenueVnd || '0' })),
      topProducts: topProducts.map((product) => ({
        ...product,
        deliveredBaseQuantity: new Prisma.Decimal(product.deliveredBaseQuantity).toString(),
      })),
    };
  }
}
