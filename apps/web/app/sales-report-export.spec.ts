import { describe, expect, it } from 'vitest';
import {
  buildSalesReportCsv,
  reportMonths,
  type SalesReportExportData,
} from './sales-report-export';

const report: SalesReportExportData = {
  range: { from: '2026-01-01', to: '2026-03-31' },
  monthlyRevenue: [
    { month: '2026-01', revenueVnd: '120000' },
    { month: '2026-03', revenueVnd: '350000' },
  ],
  topProducts: [
    {
      sku: 'SKU-1',
      productName: '  =HYPERLINK("https://example.com")',
      variantName: 'Màu, "đỏ"',
      baseUnitName: 'kg',
      deliveredBaseQuantity: '5.5',
    },
  ],
};

describe('sales report export', () => {
  it('fills missing calendar months with zero while keeping the requested range', () => {
    expect(reportMonths(report)).toEqual([
      { month: '2026-01', revenueVnd: '120000' },
      { month: '2026-02', revenueVnd: '0' },
      { month: '2026-03', revenueVnd: '350000' },
    ]);
  });

  it('exports UTF-8 CSV with escaped cells and formula-safe text', () => {
    const csv = buildSalesReportCsv(report);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('"Doanh thu tháng","2026-02","","","","","","0"');
    expect(csv).toContain(`"'  =HYPERLINK(""https://example.com"")"`);
    expect(csv).toContain('"Màu, ""đỏ"""');
    expect(csv).toContain('"5.5","kg"');
  });
});
