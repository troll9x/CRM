import { Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import ExcelJS from '@jsreport/exceljs';
import { ProblemException } from '../common/problem.exception';
import type { RequestStaff } from '../common/request-context';
import { Prisma, type Prisma as PrismaTypes } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export const PRODUCT_IMPORT_MAX_BYTES = 10 * 1024 * 1024;
const MAX_VARIANT_ROWS = 1000;
const MAX_COLUMNS = 100;

export const IMPORT_FIELDS = [
  'productName',
  'parentSku',
  'sku',
  'variantName',
  'description',
  'category',
  'brand',
  'barcode',
  'color',
  'size',
  'imageUrl',
  'baseUnitCode',
  'baseUnitName',
] as const;

export type ImportField = (typeof IMPORT_FIELDS)[number];
export type ImportColumns = Partial<Record<ImportField, number>>;

export interface ProductImportOptions {
  sheetName: string;
  headerRow: number;
  columns: ImportColumns;
  defaultBaseUnitCode?: string;
  defaultBaseUnitName?: string;
}

export interface ImportIssue {
  row: number;
  field: string;
  code: string;
  message: string;
}

interface ParsedVariant {
  row: number;
  productKey: string;
  productName: string;
  description: string | null;
  category: string | null;
  brand: string | null;
  sku: string;
  name: string;
  barcode: string | null;
  baseUnitCode: string;
  baseUnitName: string;
  attributes: Record<string, string> | null;
  imageUrl: string | null;
}

interface ParsedProduct {
  key: string;
  name: string;
  description: string | null;
  category: string | null;
  brand: string | null;
  variants: ParsedVariant[];
}

interface ParsedWorkbook {
  products: ParsedProduct[];
  variants: ParsedVariant[];
  issues: ImportIssue[];
  ignoredRows: number[];
}

const HEADER_ALIASES: Record<ImportField, string[]> = {
  productName: ['product name', 'tên sản phẩm', 'ten san pham', 'tên hàng', 'ten hang'],
  parentSku: ['parent sku', 'sku cha'],
  sku: ['seller sku', 'sku', 'mã sku', 'ma sku', 'mã phân loại hàng', 'ma phan loai hang'],
  variantName: ['variation name', 'tên phân loại hàng', 'ten phan loai hang', 'variant name'],
  description: ['description', 'mô tả', 'mo ta', 'product description'],
  category: ['category', 'danh mục', 'danh muc', 'ngành hàng', 'nganh hang'],
  brand: ['brand', 'thương hiệu', 'thuong hieu'],
  barcode: ['barcode', 'mã vạch', 'ma vach', 'gtin', 'ean'],
  color: ['color', 'colour', 'màu sắc', 'mau sac', 'màu', 'mau'],
  size: ['size', 'kích thước', 'kich thuoc', 'dung tích', 'dung tich'],
  imageUrl: ['image url', 'image', 'ảnh sản phẩm', 'anh san pham', 'photo url'],
  baseUnitCode: ['base unit code', 'mã đơn vị gốc', 'ma don vi goc', 'unit code'],
  baseUnitName: ['base unit name', 'tên đơn vị gốc', 'ten don vi goc', 'unit name'],
};

function normalizeHeader(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('vi-VN')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value).trim();
  }
  if (value instanceof Date) return value.toISOString();
  if ('text' in value && typeof value.text === 'string') return value.text.trim();
  if ('richText' in value)
    return value.richText
      .map((part) => part.text)
      .join('')
      .trim();
  if ('result' in value) return cellText(value.result);
  if ('hyperlink' in value && typeof value.hyperlink === 'string') return value.hyperlink.trim();
  return '';
}

function worksheetRows(sheet: ExcelJS.Worksheet, throughRow: number) {
  const rows: Array<{ rowNumber: number; values: string[] }> = [];
  const rowLimit = Math.min(sheet.rowCount, throughRow);
  for (let rowNumber = 1; rowNumber <= rowLimit; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const length = Math.min(Math.max(row.cellCount, row.actualCellCount), MAX_COLUMNS);
    rows.push({
      rowNumber,
      values: Array.from({ length }, (_, index) => cellText(row.getCell(index + 1).value)),
    });
  }
  return rows;
}

function worksheetRow(sheet: ExcelJS.Worksheet, rowNumber: number) {
  const row = sheet.getRow(rowNumber);
  const length = Math.min(Math.max(row.cellCount, row.actualCellCount), MAX_COLUMNS);
  return Array.from({ length }, (_, index) => cellText(row.getCell(index + 1).value));
}

function suggestColumns(headers: string[]): ImportColumns {
  const result: ImportColumns = {};
  for (const field of IMPORT_FIELDS) {
    const aliases = HEADER_ALIASES[field].map(normalizeHeader);
    const index = headers.findIndex((header) => aliases.includes(normalizeHeader(header)));
    if (index >= 0) result[field] = index;
  }
  return result;
}

function optionsError(message: string): never {
  throw new ProblemException(400, 'INVALID_IMPORT_OPTIONS', message);
}

function validateOptions(options: ProductImportOptions): ProductImportOptions {
  if (!options || typeof options !== 'object') optionsError('Thiếu cấu hình ánh xạ cột.');
  if (typeof options.sheetName !== 'string' || options.sheetName.length > 100) {
    optionsError('Tên sheet không hợp lệ.');
  }
  if (!Number.isInteger(options.headerRow) || options.headerRow < 1 || options.headerRow > 100) {
    optionsError('Hàng tiêu đề phải từ 1 đến 100.');
  }
  if (!options.columns || typeof options.columns !== 'object' || Array.isArray(options.columns)) {
    optionsError('Thiếu ánh xạ cột.');
  }
  for (const [field, index] of Object.entries(options.columns)) {
    if (
      !IMPORT_FIELDS.includes(field as ImportField) ||
      !Number.isInteger(index) ||
      index < 0 ||
      index >= MAX_COLUMNS
    ) {
      optionsError('Ánh xạ cột có trường hoặc vị trí không hợp lệ.');
    }
  }
  const defaultBaseUnitCode = options.defaultBaseUnitCode?.trim();
  const defaultBaseUnitName = options.defaultBaseUnitName?.trim();
  if (Boolean(defaultBaseUnitCode) !== Boolean(defaultBaseUnitName)) {
    optionsError('Cần nhập đồng thời mã và tên đơn vị gốc mặc định.');
  }
  return {
    ...options,
    ...(defaultBaseUnitCode ? { defaultBaseUnitCode } : {}),
    ...(defaultBaseUnitName ? { defaultBaseUnitName } : {}),
  };
}

function rowHasInstruction(values: string[]) {
  const joined = values.join(' ').toLocaleLowerCase('vi-VN');
  return /(mandatory|optional|required|instruction|example|hướng dẫn|bat buoc|khong bat buoc|ví dụ|vi du)/i.test(
    joined,
  );
}

function addIssue(issues: ImportIssue[], issue: ImportIssue) {
  if (issues.length < 200) issues.push(issue);
}

function readField(row: string[], columns: ImportColumns, field: ImportField) {
  const column = columns[field];
  return column === undefined ? '' : (row[column] ?? '').trim();
}

function validateLength(
  issues: ImportIssue[],
  row: number,
  field: string,
  value: string,
  min: number,
  max: number,
) {
  if (value.length < min || value.length > max) {
    addIssue(issues, {
      row,
      field,
      code: 'INVALID_LENGTH',
      message: `${field} phải có từ ${min} đến ${max} ký tự.`,
    });
    return false;
  }
  return true;
}

function cleanOptional(
  value: string,
  maxLength: number,
  field: string,
  row: number,
  issues: ImportIssue[],
) {
  if (value.length > maxLength) {
    addIssue(issues, {
      row,
      field,
      code: 'INVALID_LENGTH',
      message: `${field} vượt quá ${maxLength} ký tự.`,
    });
  }
  return value ? value : null;
}

function parseWorkbookRows(
  sheet: ExcelJS.Worksheet,
  options: ProductImportOptions,
): ParsedWorkbook {
  const issues: ImportIssue[] = [];
  const productsByKey = new Map<string, ParsedProduct>();
  const variants: ParsedVariant[] = [];
  const ignoredRows: number[] = [];
  const headers = worksheetRow(sheet, options.headerRow);
  if (options.columns.productName === undefined || options.columns.sku === undefined) {
    addIssue(issues, {
      row: options.headerRow,
      field: 'columns',
      code: 'REQUIRED_MAPPING',
      message: 'Cần ánh xạ cột tên sản phẩm và SKU.',
    });
    return { products: [], variants, issues, ignoredRows };
  }

  const seenSkus = new Map<string, number>();
  const seenBarcodes = new Map<string, number>();
  let dataRowCount = 0;
  for (let rowNumber = options.headerRow + 1; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = worksheetRow(sheet, rowNumber);
    if (!row.some(Boolean)) continue;
    const productNameRaw = readField(row, options.columns, 'productName');
    const skuRaw = readField(row, options.columns, 'sku');
    const productNameHeader =
      options.columns.productName === undefined ? '' : (headers[options.columns.productName] ?? '');
    const skuHeader = options.columns.sku === undefined ? '' : (headers[options.columns.sku] ?? '');
    const repeatedHeader =
      Boolean(productNameRaw && skuRaw) &&
      normalizeHeader(productNameRaw) === normalizeHeader(productNameHeader) &&
      normalizeHeader(skuRaw) === normalizeHeader(skuHeader);
    const instructionLabel =
      /^(mandatory|optional|required|instruction|example|bắt buộc|không bắt buộc|hướng dẫn|ví dụ)$/i;
    const markedInstruction =
      rowHasInstruction(row) &&
      (instructionLabel.test(productNameRaw) || instructionLabel.test(skuRaw));
    if (
      repeatedHeader ||
      (((!productNameRaw && !skuRaw) || markedInstruction) && rowHasInstruction(row))
    ) {
      ignoredRows.push(rowNumber);
      continue;
    }
    dataRowCount += 1;
    if (dataRowCount > MAX_VARIANT_ROWS) {
      addIssue(issues, {
        row: rowNumber,
        field: 'row',
        code: 'TOO_MANY_ROWS',
        message: `Mỗi lần nhập tối đa ${MAX_VARIANT_ROWS} dòng SKU.`,
      });
      break;
    }

    const productName = productNameRaw;
    const sku = skuRaw.toUpperCase();
    const variantName =
      readField(row, options.columns, 'variantName') ||
      [readField(row, options.columns, 'color'), readField(row, options.columns, 'size')]
        .filter(Boolean)
        .join(' / ') ||
      productName;
    const parentSku = readField(row, options.columns, 'parentSku').toUpperCase();
    const productKey = parentSku ? `parent:${parentSku}` : `row:${rowNumber}`;
    const description = cleanOptional(
      readField(row, options.columns, 'description'),
      3000,
      'description',
      rowNumber,
      issues,
    );
    const category = cleanOptional(
      readField(row, options.columns, 'category'),
      100,
      'category',
      rowNumber,
      issues,
    );
    const brand = cleanOptional(
      readField(row, options.columns, 'brand'),
      100,
      'brand',
      rowNumber,
      issues,
    );
    const barcodeRaw = readField(row, options.columns, 'barcode');
    const barcode = cleanOptional(barcodeRaw, 80, 'barcode', rowNumber, issues);
    const unitCode = (
      readField(row, options.columns, 'baseUnitCode') ||
      options.defaultBaseUnitCode ||
      ''
    ).toUpperCase();
    const unitName =
      readField(row, options.columns, 'baseUnitName') || options.defaultBaseUnitName || '';
    const imageUrl = readField(row, options.columns, 'imageUrl') || null;
    const color = readField(row, options.columns, 'color');
    const size = readField(row, options.columns, 'size');
    const attributes = { ...(color ? { color } : {}), ...(size ? { size } : {}) };

    validateLength(issues, rowNumber, 'productName', productName, 2, 180);
    if (!sku || !/^[A-Z0-9._-]{2,64}$/.test(sku)) {
      addIssue(issues, {
        row: rowNumber,
        field: 'sku',
        code: 'INVALID_SKU',
        message: 'SKU bắt buộc, 2–64 ký tự A–Z, 0–9, dấu chấm, gạch dưới hoặc gạch ngang.',
      });
    }
    validateLength(issues, rowNumber, 'variantName', variantName, 1, 160);
    if (barcode && barcode.length > 80) {
      addIssue(issues, {
        row: rowNumber,
        field: 'barcode',
        code: 'INVALID_BARCODE',
        message: 'Barcode tối đa 80 ký tự.',
      });
    }
    if (!/^[A-Z0-9_-]{1,16}$/.test(unitCode)) {
      addIssue(issues, {
        row: rowNumber,
        field: 'baseUnitCode',
        code: 'INVALID_BASE_UNIT',
        message: 'Mã đơn vị gốc bắt buộc, 1–16 ký tự chữ, số, gạch dưới hoặc gạch ngang.',
      });
    }
    validateLength(issues, rowNumber, 'baseUnitName', unitName, 1, 50);
    for (const [attribute, value] of Object.entries(attributes)) {
      if (value.length > 100)
        addIssue(issues, {
          row: rowNumber,
          field: attribute,
          code: 'INVALID_ATTRIBUTE',
          message: `${attribute} tối đa 100 ký tự.`,
        });
    }
    if (imageUrl) {
      try {
        const parsedUrl = new URL(imageUrl);
        if (
          parsedUrl.protocol !== 'https:' ||
          imageUrl.length > 1000 ||
          parsedUrl.username ||
          parsedUrl.password
        ) {
          throw new Error('invalid');
        }
      } catch {
        addIssue(issues, {
          row: rowNumber,
          field: 'imageUrl',
          code: 'INVALID_IMAGE_URL',
          message: 'URL ảnh phải là HTTPS hợp lệ và tối đa 1000 ký tự.',
        });
      }
    }

    if (sku) {
      const previous = seenSkus.get(sku);
      if (previous) {
        addIssue(issues, {
          row: rowNumber,
          field: 'sku',
          code: 'DUPLICATE_SKU_IN_FILE',
          message: `SKU trùng với dòng ${previous}.`,
        });
      } else seenSkus.set(sku, rowNumber);
    }
    if (barcode) {
      const previous = seenBarcodes.get(barcode);
      if (previous) {
        addIssue(issues, {
          row: rowNumber,
          field: 'barcode',
          code: 'DUPLICATE_BARCODE_IN_FILE',
          message: `Barcode trùng với dòng ${previous}.`,
        });
      } else seenBarcodes.set(barcode, rowNumber);
    }

    let product = productsByKey.get(productKey);
    if (!product) {
      product = { key: productKey, name: productName, description, category, brand, variants: [] };
      productsByKey.set(productKey, product);
    } else if (
      product.name !== productName ||
      product.description !== description ||
      product.category !== category ||
      product.brand !== brand
    ) {
      addIssue(issues, {
        row: rowNumber,
        field: 'parentSku',
        code: 'INCONSISTENT_PRODUCT_GROUP',
        message: 'Các dòng cùng Parent SKU phải thống nhất tên, mô tả, danh mục và thương hiệu.',
      });
    }

    const variant: ParsedVariant = {
      row: rowNumber,
      productKey,
      productName,
      description,
      category,
      brand,
      sku,
      name: variantName,
      barcode,
      baseUnitCode: unitCode,
      baseUnitName: unitName,
      attributes: Object.keys(attributes).length ? attributes : null,
      imageUrl,
    };
    product.variants.push(variant);
    variants.push(variant);
  }

  if (dataRowCount === 0) {
    addIssue(issues, {
      row: options.headerRow + 1,
      field: 'rows',
      code: 'NO_DATA_ROWS',
      message: 'Không tìm thấy dòng sản phẩm sau hàng tiêu đề.',
    });
  }
  return { products: [...productsByKey.values()], variants, issues, ignoredRows };
}

function workbookError(message: string): never {
  throw new ProblemException(422, 'INVALID_PRODUCT_IMPORT_FILE', message);
}

function commandKey(raw: string | undefined) {
  const key = raw?.trim();
  if (!key || !/^[A-Za-z0-9._:-]{8,100}$/.test(key)) {
    throw new ProblemException(
      400,
      'IDEMPOTENCY_KEY_REQUIRED',
      'Idempotency-Key phải có 8–100 ký tự an toàn.',
    );
  }
  return key;
}

function requestHash(file: Buffer, options: ProductImportOptions) {
  return createHash('sha256').update(file).update(JSON.stringify(options)).digest('hex');
}

@Injectable()
export class ProductImportService {
  constructor(private readonly prisma: PrismaService) {}

  private async workbook(file: Buffer) {
    if (!file.length || file.length > PRODUCT_IMPORT_MAX_BYTES) {
      throw new ProblemException(413, 'IMPORT_FILE_TOO_LARGE', 'File Excel tối đa 10 MiB.');
    }
    if (file[0] !== 0x50 || file[1] !== 0x4b)
      workbookError('File không phải workbook .xlsx hợp lệ.');
    const workbook = new ExcelJS.Workbook();
    try {
      const input = new Uint8Array(file.length);
      input.set(file);
      await workbook.xlsx.load(input.buffer);
    } catch {
      workbookError('Không đọc được workbook. Hãy tải file .xlsx từ Shopee và thử lại.');
    }
    if (workbook.worksheets.length === 0) workbookError('Workbook không có sheet dữ liệu.');
    return workbook;
  }

  async inspect(file: Buffer) {
    const workbook = await this.workbook(file);
    return {
      sheets: workbook.worksheets.slice(0, 50).map((sheet) => {
        const rows = worksheetRows(sheet, 30);
        const candidates = rows
          .map(({ rowNumber, values }) => ({ rowNumber, values, mapping: suggestColumns(values) }))
          .filter(({ mapping }) => mapping.productName !== undefined || mapping.sku !== undefined)
          .slice(0, 10);
        return {
          name: sheet.name,
          rowCount: sheet.rowCount,
          columnCount: Math.min(sheet.columnCount, MAX_COLUMNS),
          rows,
          headerCandidates: candidates,
        };
      }),
    };
  }

  private async parse(file: Buffer, rawOptions: ProductImportOptions) {
    const options = validateOptions(rawOptions);
    const workbook = await this.workbook(file);
    const sheet = workbook.getWorksheet(options.sheetName);
    if (!sheet) workbookError('Không tìm thấy sheet đã chọn trong file.');
    if (options.headerRow > sheet.rowCount)
      workbookError('Hàng tiêu đề nằm ngoài dữ liệu của sheet.');
    const parsed = parseWorkbookRows(sheet, options);
    return { options, parsed };
  }

  private async existingCatalogIssues(businessId: string, parsed: ParsedWorkbook) {
    const skus = [...new Set(parsed.variants.map(({ sku }) => sku).filter(Boolean))];
    const barcodes = [
      ...new Set(
        parsed.variants
          .map(({ barcode }) => barcode)
          .filter((value): value is string => Boolean(value)),
      ),
    ];
    if (!skus.length) return [] as ImportIssue[];
    const found = await this.prisma.productVariant.findMany({
      where: {
        businessId,
        OR: [{ sku: { in: skus } }, ...(barcodes.length ? [{ barcode: { in: barcodes } }] : [])],
      },
      select: { sku: true, barcode: true },
    });
    const issues: ImportIssue[] = [];
    for (const variant of parsed.variants) {
      if (found.some((item) => item.sku === variant.sku)) {
        addIssue(issues, {
          row: variant.row,
          field: 'sku',
          code: 'SKU_ALREADY_EXISTS',
          message: `SKU ${variant.sku} đã tồn tại trong CRM.`,
        });
      }
      if (variant.barcode && found.some((item) => item.barcode === variant.barcode)) {
        addIssue(issues, {
          row: variant.row,
          field: 'barcode',
          code: 'BARCODE_ALREADY_EXISTS',
          message: `Barcode ${variant.barcode} đã tồn tại trong CRM.`,
        });
      }
    }
    return issues;
  }

  async preview(file: Buffer, options: ProductImportOptions, actor: RequestStaff) {
    const result = await this.parse(file, options);
    const issues = [
      ...result.parsed.issues,
      ...(await this.existingCatalogIssues(actor.businessId, result.parsed)),
    ].slice(0, 200);
    return {
      sheetName: result.options.sheetName,
      headerRow: result.options.headerRow,
      productCount: result.parsed.products.length,
      variantCount: result.parsed.variants.length,
      ignoredRows: result.parsed.ignoredRows,
      issues,
      warnings: [
        'Giá bán và số lượng tồn trong file Shopee sẽ bị bỏ qua.',
        'Chỉ URL ảnh HTTPS được lưu làm metadata; CRM không tải file ảnh.',
        'Chỉ dùng Parent SKU để nhóm biến thể. Thiếu Parent SKU thì mỗi dòng tạo một sản phẩm riêng.',
        'Mỗi SKU dùng đơn vị gốc đã ánh xạ hoặc đơn vị mặc định; chưa suy luận quy đổi đơn vị.',
      ],
    };
  }

  private async replay(businessId: string, key: string, hash: string) {
    const command = await this.prisma.productImportCommand.findUnique({
      where: { businessId_idempotencyKey: { businessId, idempotencyKey: key } },
      select: { requestHash: true, response: true },
    });
    if (!command) return null;
    if (command.requestHash !== hash) {
      throw new ProblemException(
        409,
        'IDEMPOTENCY_KEY_REUSED',
        'Idempotency-Key đã dùng với nội dung khác.',
      );
    }
    return command.response;
  }

  async apply(
    file: Buffer,
    rawOptions: ProductImportOptions,
    rawKey: string | undefined,
    actor: RequestStaff,
    requestId: string,
  ) {
    const key = commandKey(rawKey);
    const { options, parsed } = await this.parse(file, rawOptions);
    const hash = requestHash(file, options);
    const replay = await this.replay(actor.businessId, key, hash);
    if (replay) return replay;
    const issues = [
      ...parsed.issues,
      ...(await this.existingCatalogIssues(actor.businessId, parsed)),
    ];
    if (issues.length) {
      throw new ProblemException(
        422,
        'PRODUCT_IMPORT_HAS_ERRORS',
        'Có lỗi dữ liệu; chưa sản phẩm nào được tạo.',
        issues
          .slice(0, 200)
          .map((issue) => ({ field: `row_${issue.row}_${issue.field}`, reason: issue.message })),
      );
    }

    const retryLimit = 3;
    for (let attempt = 1; attempt <= retryLimit; attempt += 1) {
      try {
        return await this.prisma.$transaction(
          async (tx) => {
            const duplicate = await tx.productImportCommand.findUnique({
              where: {
                businessId_idempotencyKey: { businessId: actor.businessId, idempotencyKey: key },
              },
              select: { requestHash: true, response: true },
            });
            if (duplicate) {
              if (duplicate.requestHash !== hash) {
                throw new ProblemException(
                  409,
                  'IDEMPOTENCY_KEY_REUSED',
                  'Idempotency-Key đã dùng với nội dung khác.',
                );
              }
              return duplicate.response;
            }

            const variantSkus = parsed.variants.map(({ sku }) => sku);
            const variantBarcodes = parsed.variants
              .map(({ barcode }) => barcode)
              .filter((value): value is string => Boolean(value));
            const existing = await tx.productVariant.findFirst({
              where: {
                businessId: actor.businessId,
                OR: [
                  { sku: { in: variantSkus } },
                  ...(variantBarcodes.length ? [{ barcode: { in: variantBarcodes } }] : []),
                ],
              },
              select: { id: true },
            });
            if (existing) {
              throw new ProblemException(
                409,
                'CATALOG_CHANGED_DURING_IMPORT',
                'SKU hoặc barcode vừa được tạo ở nơi khác; hãy xem trước file lại.',
              );
            }

            const productIdsByKey = new Map(
              parsed.products.map((product) => [product.key, randomUUID()]),
            );
            const createdProductIds = [...productIdsByKey.values()];
            const productRows = parsed.products.map((product) => ({
              id: productIdsByKey.get(product.key)!,
              businessId: actor.businessId,
              name: product.name,
              description: product.description,
              category: product.category,
              brand: product.brand,
            }));
            const variantIdsByRow = new Map(
              parsed.variants.map((variant) => [variant.row, randomUUID()]),
            );
            const variantRows = parsed.variants.map((variant) => ({
              id: variantIdsByRow.get(variant.row)!,
              businessId: actor.businessId,
              productId: productIdsByKey.get(variant.productKey)!,
              sku: variant.sku,
              name: variant.name,
              barcode: variant.barcode,
              baseUnitCode: variant.baseUnitCode,
              baseUnitName: variant.baseUnitName,
              sellingUnitCode: variant.baseUnitCode,
              sellingUnitName: variant.baseUnitName,
              sellingUnitFactor: '1',
              attributes: variant.attributes
                ? (variant.attributes as PrismaTypes.InputJsonValue)
                : Prisma.JsonNull,
            }));
            const mediaRows = parsed.variants.flatMap((variant) => {
              if (!variant.imageUrl) return [];
              return [
                {
                  id: randomUUID(),
                  productId: productIdsByKey.get(variant.productKey)!,
                  variantId: variantIdsByRow.get(variant.row)!,
                  url: variant.imageUrl,
                  altText: `${variant.productName} - ${variant.name}`.slice(0, 250),
                  sortOrder: 0,
                },
              ];
            });
            const auditRows = parsed.products.map((product) => ({
              id: randomUUID(),
              businessId: actor.businessId,
              actorId: actor.id,
              action: 'catalog.product.import',
              entityType: 'Product',
              entityId: productIdsByKey.get(product.key)!,
              requestId,
              metadata: {
                variantCount: product.variants.length,
                source: 'shopee-xlsx',
              },
            }));
            await tx.product.createMany({ data: productRows });
            await tx.productVariant.createMany({ data: variantRows });
            if (mediaRows.length) await tx.mediaAsset.createMany({ data: mediaRows });
            await tx.auditLog.createMany({ data: auditRows });
            const response = {
              createdProducts: parsed.products.length,
              createdVariants: parsed.variants.length,
              productIds: createdProductIds,
            };
            await tx.productImportCommand.create({
              data: {
                businessId: actor.businessId,
                actorId: actor.id,
                idempotencyKey: key,
                requestHash: hash,
                response,
              },
            });
            return response;
          },
          {
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
            maxWait: 10_000,
            timeout: 30_000,
          },
        );
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
          if (attempt < retryLimit) continue;
          throw new ProblemException(
            409,
            'IMPORT_CONFLICT_RETRY',
            'Dữ liệu thay đổi liên tục; hãy xem trước và thử lại.',
            undefined,
            true,
          );
        }
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          const replayAfterConflict = await this.replay(actor.businessId, key, hash);
          if (replayAfterConflict) return replayAfterConflict;
          throw new ProblemException(
            409,
            'CATALOG_CHANGED_DURING_IMPORT',
            'SKU/barcode đã được tạo ở nơi khác; hãy xem trước file lại.',
          );
        }
        throw error;
      }
    }
    throw new ProblemException(
      409,
      'IMPORT_CONFLICT_RETRY',
      'Hãy thử lại yêu cầu nhập.',
      undefined,
      true,
    );
  }
}
