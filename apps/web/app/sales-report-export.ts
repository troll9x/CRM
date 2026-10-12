export type SalesReportExportData = {
  range: { from: string; to: string };
  monthlyRevenue: Array<{ month: string; revenueVnd: string }>;
  topProducts: Array<{
    sku: string;
    productName: string;
    variantName: string;
    baseUnitName: string;
    deliveredBaseQuantity: string;
  }>;
};

export function reportMonths(report: SalesReportExportData) {
  const [startYear, startMonth] = report.range.from.split('-').map(Number);
  const [endYear, endMonth] = report.range.to.split('-').map(Number);
  const values = new Map(report.monthlyRevenue.map((item) => [item.month, item.revenueVnd]));
  const rows: Array<{ month: string; revenueVnd: string }> = [];
  for (
    let cursor = new Date(Date.UTC(startYear!, startMonth! - 1, 1));
    cursor <= new Date(Date.UTC(endYear!, endMonth! - 1, 1));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1)
  ) {
    const month = `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, '0')}`;
    rows.push({ month, revenueVnd: values.get(month) ?? '0' });
  }
  return rows;
}

function csvCell(value: string) {
  const safe = /^[\s\u0000-\u001f]*[=+\-@]/.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}

export function buildSalesReportCsv(report: SalesReportExportData) {
  const rows: string[][] = [
    [
      'Loại',
      'Tháng',
      'SKU',
      'Sản phẩm',
      'Biến thể',
      'Số lượng giao',
      'Đơn vị',
      'Doanh thu hàng hóa (VND)',
    ],
    ...reportMonths(report).map((item) => [
      'Doanh thu tháng',
      item.month,
      '',
      '',
      '',
      '',
      '',
      item.revenueVnd,
    ]),
    ...report.topProducts.map((item) => [
      'Sản phẩm giao nhiều',
      '',
      item.sku,
      item.productName,
      item.variantName,
      item.deliveredBaseQuantity,
      item.baseUnitName,
      '',
    ]),
  ];
  return `\uFEFF${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}`;
}
