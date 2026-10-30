import ExcelJS from '@jsreport/exceljs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RequestStaff } from '../common/request-context';
import type { PrismaService } from '../prisma/prisma.service';
import { ProductImportService, type ProductImportOptions } from './product-import.service';

const actor: RequestStaff = {
  id: 'staff-1',
  businessId: 'business-1',
  email: 'owner@example.test',
  displayName: 'Owner',
  roles: ['owner'],
  permissions: ['catalog.write'],
};

const options: ProductImportOptions = {
  sheetName: 'Products',
  headerRow: 5,
  columns: {
    productName: 0,
    parentSku: 1,
    sku: 2,
    variantName: 3,
    color: 4,
    baseUnitCode: 5,
    baseUnitName: 6,
    imageUrl: 7,
    barcode: 8,
  },
};

async function makeWorkbook(rows: Array<[number, string[]]>) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Products');
  for (const [rowNumber, values] of rows) sheet.getRow(rowNumber).values = values;
  const content = await workbook.xlsx.writeBuffer();
  return Buffer.from(new Uint8Array(content));
}

describe('ProductImportService', () => {
  const findMany = vi.fn();
  let service: ProductImportService;

  beforeEach(() => {
    findMany.mockReset().mockResolvedValue([]);
    service = new ProductImportService({
      productVariant: { findMany },
    } as unknown as PrismaService);
  });

  it('groups variants by Parent SKU and ignores Shopee guide rows', async () => {
    const file = await makeWorkbook([
      [
        5,
        [
          'Product Name',
          'Parent SKU',
          'Seller SKU',
          'Variation Name',
          'Color',
          'Unit Code',
          'Unit Name',
          'Image URL',
          'Barcode',
          'Price',
          'Stock',
        ],
      ],
      [6, ['', '', '', '', '', '', '', '', '', 'Mandatory', 'Optional']],
      [
        7,
        [
          'Áo thun',
          'TSHIRT',
          'TS-RED',
          'Red',
          'Đỏ',
          'CAI',
          'Cái',
          'https://img.example.test/red.jpg',
          '10001',
        ],
      ],
      [
        8,
        [
          'Áo thun',
          'TSHIRT',
          'TS-BLUE',
          'Blue',
          'Xanh',
          'CAI',
          'Cái',
          'https://img.example.test/blue.jpg',
          '10002',
        ],
      ],
    ]);

    const inspected = await service.inspect(file);
    expect(inspected.sheets[0]?.headerCandidates[0]).toMatchObject({
      rowNumber: 5,
      mapping: { productName: 0, parentSku: 1, sku: 2 },
    });
    const preview = await service.preview(file, options, actor);

    expect(preview.productCount).toBe(1);
    expect(preview.variantCount).toBe(2);
    expect(preview.ignoredRows).toEqual([6]);
    expect(preview.issues).toEqual([]);
    expect(preview.warnings.join(' ')).toContain('số lượng tồn');
    expect(findMany).toHaveBeenCalled();
  });

  it('blocks duplicate SKUs inside the file before any writes', async () => {
    const file = await makeWorkbook([
      [
        5,
        [
          'Product Name',
          'Parent SKU',
          'Seller SKU',
          'Variation Name',
          'Color',
          'Unit Code',
          'Unit Name',
        ],
      ],
      [6, ['Áo thun', '', 'SKU-1', '', '', 'CAI', 'Cái']],
      [7, ['Mũ', '', 'SKU-1', '', '', 'CAI', 'Cái']],
    ]);

    const preview = await service.preview(file, options, actor);

    expect(preview.productCount).toBe(2);
    expect(preview.issues).toContainEqual(
      expect.objectContaining({ row: 7, code: 'DUPLICATE_SKU_IN_FILE' }),
    );
  });

  it('creates one product per row when Parent SKU is blank and requires a base unit', async () => {
    const file = await makeWorkbook([
      [5, ['Product Name', 'Parent SKU', 'Seller SKU', 'Variation Name']],
      [6, ['Áo thun', '', 'SKU-1', 'Đỏ']],
      [7, ['Mũ', '', 'SKU-2', 'Đen']],
    ]);

    const preview = await service.preview(
      file,
      { ...options, columns: { productName: 0, sku: 2, variantName: 3 } },
      actor,
    );

    expect(preview.productCount).toBe(2);
    expect(preview.variantCount).toBe(2);
    expect(preview.issues.filter((issue) => issue.code === 'INVALID_BASE_UNIT')).toHaveLength(2);
  });

  it('rejects non-xlsx content', async () => {
    await expect(service.inspect(Buffer.from('not an xlsx'))).rejects.toMatchObject({
      code: 'INVALID_PRODUCT_IMPORT_FILE',
    });
  });
});
