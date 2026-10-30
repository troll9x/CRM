'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { api, type Staff } from './api-client';

type Conversion = { id: string; unitCode: string; unitName: string; factor: string };
type Variant = {
  id: string;
  sku: string;
  name: string;
  barcode?: string | null;
  baseUnitCode: string;
  baseUnitName: string;
  sellingUnitCode: string;
  sellingUnitName: string;
  sellingUnitFactor: string;
  attributes?: Record<string, string> | null;
  status: 'ACTIVE' | 'INACTIVE';
  version: number;
  conversions: Conversion[];
};
type Media = {
  id: string;
  variantId?: string | null;
  url: string;
  altText?: string | null;
  sortOrder: number;
  status: 'ACTIVE' | 'ARCHIVED';
};
type ProductSummary = {
  id: string;
  name: string;
  category?: string | null;
  brand?: string | null;
  status: 'ACTIVE' | 'INACTIVE';
  version: number;
  updatedAt: string;
  variants: Omit<Variant, 'attributes' | 'conversions'>[];
  _count: { variants: number; media: number };
};
type ProductDetail = Omit<ProductSummary, 'variants'> & {
  description?: string | null;
  createdAt: string;
  variants: Variant[];
  media: Media[];
};

const PRODUCT_IMPORT_FIELDS = [
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

type ProductImportField = (typeof PRODUCT_IMPORT_FIELDS)[number];
type ProductImportColumns = Partial<Record<ProductImportField, number>>;
type ImportSheet = {
  name: string;
  rowCount: number;
  columnCount: number;
  rows: Array<{ rowNumber: number; values: string[] }>;
  headerCandidates: Array<{ rowNumber: number; values: string[]; mapping: ProductImportColumns }>;
};
type ImportPreview = {
  productCount: number;
  variantCount: number;
  ignoredRows: number[];
  issues: Array<{ row: number; field: string; code: string; message: string }>;
  warnings: string[];
};

const PRODUCT_IMPORT_LABELS: Record<ProductImportField, string> = {
  productName: 'Tên sản phẩm *',
  parentSku: 'Parent SKU (nhóm biến thể)',
  sku: 'SKU *',
  variantName: 'Tên phân loại',
  description: 'Mô tả',
  category: 'Danh mục',
  brand: 'Thương hiệu',
  barcode: 'Barcode',
  color: 'Màu sắc',
  size: 'Kích thước / dung tích',
  imageUrl: 'URL ảnh HTTPS',
  baseUnitCode: 'Mã đơn vị gốc',
  baseUnitName: 'Tên đơn vị gốc',
};

function field(form: FormData, name: string) {
  return String(form.get(name) ?? '').trim();
}

function conversionsFrom(form: FormData) {
  return [1, 2]
    .map((index) => ({
      unitCode: field(form, `unitCode${index}`).toUpperCase(),
      unitName: field(form, `unitName${index}`),
      factor: field(form, `factor${index}`),
    }))
    .filter((conversion) => conversion.unitCode && conversion.unitName && conversion.factor);
}

function attributesFrom(form: FormData) {
  const color = field(form, 'color');
  const size = field(form, 'size');
  return { ...(color ? { color } : {}), ...(size ? { size } : {}) };
}

export function ProductWorkspace({
  staff,
  onLogout,
  loggingOut,
}: {
  staff: Staff;
  onLogout: () => void;
  loggingOut: boolean;
}) {
  const canWrite = staff.permissions.includes('catalog.write');
  const canManageMedia = staff.permissions.includes('media.manage');
  const [products, setProducts] = useState<ProductSummary[]>([]);
  const [selected, setSelected] = useState<ProductDetail | null>(null);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importSheets, setImportSheets] = useState<ImportSheet[]>([]);
  const [importSheetName, setImportSheetName] = useState('');
  const [importHeaderRow, setImportHeaderRow] = useState(1);
  const [importColumns, setImportColumns] = useState<ProductImportColumns>({});
  const [importDefaultUnitCode, setImportDefaultUnitCode] = useState('');
  const [importDefaultUnitName, setImportDefaultUnitName] = useState('');
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [importIdempotencyKey, setImportIdempotencyKey] = useState('');
  const [importing, setImporting] = useState(false);
  const [editingProduct, setEditingProduct] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const selectedImportSheet = importSheets.find((sheet) => sheet.name === importSheetName);
  const selectedImportHeader = selectedImportSheet?.rows.find(
    (row) => row.rowNumber === importHeaderRow,
  );

  function optionsForImport() {
    return {
      sheetName: importSheetName,
      headerRow: importHeaderRow,
      columns: importColumns,
      ...(importDefaultUnitCode.trim() && importDefaultUnitName.trim()
        ? {
            defaultBaseUnitCode: importDefaultUnitCode.trim(),
            defaultBaseUnitName: importDefaultUnitName.trim(),
          }
        : {}),
    };
  }

  function importHeaders(file: File, withOptions = false) {
    return {
      'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'x-file-name': encodeURIComponent(file.name),
      ...(withOptions
        ? {
            'x-import-options': btoa(
              String.fromCharCode(...new TextEncoder().encode(JSON.stringify(optionsForImport()))),
            )
              .replace(/\+/g, '-')
              .replace(/\//g, '_')
              .replace(/=+$/g, ''),
          }
        : {}),
    };
  }

  function applySuggestedMapping(sheet: ImportSheet | undefined, headerRow: number) {
    const candidate = sheet?.headerCandidates.find((row) => row.rowNumber === headerRow);
    setImportColumns(candidate?.mapping ?? {});
    setImportPreview(null);
    setImportIdempotencyKey('');
  }

  async function inspectImportFile(file: File | null) {
    setImportFile(file);
    setImportSheets([]);
    setImportPreview(null);
    setImportIdempotencyKey('');
    if (!file) return;
    setImporting(true);
    setError('');
    try {
      const result = await api<{ sheets: ImportSheet[] }>('/products/import/inspect', {
        method: 'POST',
        body: file,
        headers: importHeaders(file),
      });
      setImportSheets(result.sheets);
      const firstSheet = result.sheets[0];
      setImportSheetName(firstSheet?.name ?? '');
      const suggestedRow = firstSheet?.headerCandidates[0]?.rowNumber ?? 1;
      setImportHeaderRow(suggestedRow);
      applySuggestedMapping(firstSheet, suggestedRow);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không đọc được file Excel.');
    } finally {
      setImporting(false);
    }
  }

  async function previewProductImport() {
    if (!importFile) return;
    setImporting(true);
    setError('');
    setMessage('');
    setImportIdempotencyKey('');
    try {
      const result = await api<ImportPreview>('/products/import/preview', {
        method: 'POST',
        body: importFile,
        headers: importHeaders(importFile, true),
      });
      setImportPreview(result);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không kiểm tra được file nhập.');
      setImportPreview(null);
    } finally {
      setImporting(false);
    }
  }

  async function applyProductImport() {
    if (!importFile || !importPreview || importPreview.issues.length) return;
    const key = importIdempotencyKey || crypto.randomUUID();
    setImportIdempotencyKey(key);
    setImporting(true);
    setError('');
    try {
      const result = await api<{ createdProducts: number; createdVariants: number }>(
        '/products/import',
        {
          method: 'POST',
          body: importFile,
          headers: { ...importHeaders(importFile, true), 'idempotency-key': key },
        },
      );
      setMessage(`Đã nhập ${result.createdProducts} sản phẩm và ${result.createdVariants} SKU.`);
      setShowImport(false);
      setImportFile(null);
      setImportSheets([]);
      setImportPreview(null);
      await loadProducts('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không nhập được sản phẩm.');
    } finally {
      setImporting(false);
    }
  }

  const loadDetail = useCallback(async (id: string) => {
    const product = await api<ProductDetail>(`/products/${id}`);
    setSelected(product);
  }, []);

  const loadProducts = useCallback(
    async (search = query) => {
      setLoading(true);
      setError('');
      try {
        const result = await api<{ items: ProductSummary[] }>(
          `/products${search ? `?query=${encodeURIComponent(search)}` : ''}`,
        );
        setProducts(result.items);
        if (result.items.length && !result.items.some((item) => item.id === selected?.id)) {
          await loadDetail(result.items[0].id);
        } else if (!result.items.length) {
          setSelected(null);
        }
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Không tải được danh mục.');
      } finally {
        setLoading(false);
      }
    },
    [loadDetail, query, selected?.id],
  );

  useEffect(() => {
    let active = true;
    async function initialLoad() {
      try {
        const result = await api<{ items: ProductSummary[] }>('/products');
        if (!active) return;
        setProducts(result.items);
        if (result.items[0]) await loadDetail(result.items[0].id);
      } catch (caught) {
        if (active) {
          setError(caught instanceof Error ? caught.message : 'Không tải được danh mục.');
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    void initialLoad();
    return () => {
      active = false;
    };
  }, [loadDetail]);

  async function selectProduct(id: string) {
    setError('');
    try {
      await loadDetail(id);
      setEditingProduct(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không tải được sản phẩm.');
    }
  }

  async function createProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');
    const form = new FormData(event.currentTarget);
    try {
      const product = await api<ProductDetail>('/products', {
        method: 'POST',
        body: JSON.stringify({
          name: field(form, 'productName'),
          category: field(form, 'category') || undefined,
          brand: field(form, 'brand') || undefined,
          description: field(form, 'description') || undefined,
          variants: [
            {
              sku: field(form, 'sku'),
              name: field(form, 'variantName'),
              barcode: field(form, 'barcode') || undefined,
              baseUnitCode: field(form, 'baseUnitCode'),
              baseUnitName: field(form, 'baseUnitName'),
              sellingUnitCode: field(form, 'sellingUnitCode') || undefined,
              attributes: attributesFrom(form),
              conversions: conversionsFrom(form),
            },
          ],
        }),
      });
      setSelected(product);
      setMessage('Đã tạo sản phẩm và SKU đầu tiên.');
      setShowCreate(false);
      event.currentTarget.reset();
      await loadProducts('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không tạo được sản phẩm.');
    } finally {
      setSaving(false);
    }
  }

  async function updateProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    setSaving(true);
    const form = new FormData(event.currentTarget);
    try {
      const product = await api<ProductDetail>(`/products/${selected.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          version: selected.version,
          name: field(form, 'name'),
          category: field(form, 'category'),
          brand: field(form, 'brand'),
          description: field(form, 'description'),
        }),
      });
      setSelected(product);
      setEditingProduct(false);
      setMessage('Đã cập nhật sản phẩm.');
      await loadProducts(query);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không cập nhật được sản phẩm.');
    } finally {
      setSaving(false);
    }
  }

  async function toggleProduct() {
    if (!selected) return;
    setSaving(true);
    try {
      const product = await api<ProductDetail>(`/products/${selected.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          version: selected.version,
          status: selected.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE',
        }),
      });
      setSelected(product);
      setMessage(
        product.status === 'ACTIVE' ? 'Đã mở bán lại sản phẩm.' : 'Đã ngừng bán sản phẩm.',
      );
      await loadProducts(query);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không đổi được trạng thái sản phẩm.');
    } finally {
      setSaving(false);
    }
  }

  async function addVariant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    setSaving(true);
    const form = new FormData(event.currentTarget);
    try {
      const product = await api<ProductDetail>(`/products/${selected.id}/variants`, {
        method: 'POST',
        body: JSON.stringify({
          sku: field(form, 'sku'),
          name: field(form, 'variantName'),
          barcode: field(form, 'barcode') || undefined,
          baseUnitCode: field(form, 'baseUnitCode'),
          baseUnitName: field(form, 'baseUnitName'),
          sellingUnitCode: field(form, 'sellingUnitCode') || undefined,
          attributes: attributesFrom(form),
          conversions: conversionsFrom(form),
        }),
      });
      setSelected(product);
      setMessage('Đã thêm SKU.');
      event.currentTarget.reset();
      await loadProducts(query);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không thêm được SKU.');
    } finally {
      setSaving(false);
    }
  }

  async function toggleVariant(variant: Variant) {
    if (!selected) return;
    setSaving(true);
    try {
      const product = await api<ProductDetail>(`/variants/${variant.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          version: variant.version,
          status: variant.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE',
        }),
      });
      setSelected(product);
      setMessage(variant.status === 'ACTIVE' ? 'Đã ngừng bán SKU.' : 'Đã mở bán lại SKU.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không đổi được trạng thái SKU.');
    } finally {
      setSaving(false);
    }
  }

  async function replaceConversions(event: FormEvent<HTMLFormElement>, variant: Variant) {
    event.preventDefault();
    setSaving(true);
    const form = new FormData(event.currentTarget);
    try {
      const product = await api<ProductDetail>(`/variants/${variant.id}/unit-conversions`, {
        method: 'PUT',
        body: JSON.stringify({ version: variant.version, conversions: conversionsFrom(form) }),
      });
      setSelected(product);
      setMessage('Đã cập nhật quy đổi đơn vị.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không cập nhật được quy đổi.');
    } finally {
      setSaving(false);
    }
  }

  async function setSellingUnit(event: FormEvent<HTMLFormElement>, variant: Variant) {
    event.preventDefault();
    setSaving(true);
    const form = new FormData(event.currentTarget);
    try {
      const product = await api<ProductDetail>(`/variants/${variant.id}/selling-unit`, {
        method: 'PUT',
        body: JSON.stringify({
          version: variant.version,
          sellingUnitCode: field(form, 'sellingUnitCode'),
        }),
      });
      setSelected(product);
      setMessage('Đã cập nhật đơn vị bán cố định cho SKU.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không cập nhật được đơn vị bán.');
    } finally {
      setSaving(false);
    }
  }

  async function addMedia(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    setSaving(true);
    const form = new FormData(event.currentTarget);
    try {
      const product = await api<ProductDetail>(`/products/${selected.id}/media`, {
        method: 'POST',
        body: JSON.stringify({
          url: field(form, 'url'),
          altText: field(form, 'altText') || undefined,
          variantId: field(form, 'variantId') || undefined,
        }),
      });
      setSelected(product);
      setMessage('Đã lưu metadata ảnh HTTPS.');
      event.currentTarget.reset();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không thêm được ảnh.');
    } finally {
      setSaving(false);
    }
  }

  async function archiveMedia(mediaId: string) {
    if (!selected) return;
    setSaving(true);
    try {
      const product = await api<ProductDetail>(`/media/${mediaId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'ARCHIVED' }),
      });
      setSelected(product);
      setMessage('Đã lưu trữ ảnh metadata.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không lưu trữ được ảnh.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="dashboard-content catalog-page">
      <header>
        <div>
          <p className="eyebrow">SẢN PHẨM & SKU</p>
          <h1>Danh mục hàng hóa</h1>
        </div>
        <div className="header-actions">
          {canWrite && (
            <button className="ghost" onClick={() => setShowImport((current) => !current)}>
              {showImport ? 'Đóng nhập Excel' : 'Nhập Excel Shopee'}
            </button>
          )}
          {canWrite && (
            <button className="ghost" onClick={() => setShowCreate((current) => !current)}>
              {showCreate ? 'Đóng biểu mẫu' : '+ Thêm sản phẩm'}
            </button>
          )}
          <button className="ghost" onClick={onLogout} disabled={loggingOut}>
            Đăng xuất
          </button>
        </div>
      </header>

      <div className="assumption-note">
        Đang dùng giả định tạm: đơn vị cái/hộp/thùng, chưa quản lý lô, hạn dùng hoặc serial.
      </div>
      {message && <div className="success-message">{message}</div>}
      {error && <div className="error-message">{error}</div>}

      {showImport && canWrite && (
        <section className="panel-form" style={{ display: 'grid', gap: 16 }}>
          <div className="section-heading">
            <div>
              <p className="eyebrow">NHẬP DANH MỤC</p>
              <h2>Nhập sản phẩm từ Excel Shopee</h2>
            </div>
            <span>Chỉ hỗ trợ .xlsx, tối đa 10 MiB</span>
          </div>
          <p className="form-warning">
            Nhập sản phẩm và SKU mới. Giá bán, tồn kho, phí và dữ liệu đơn hàng trong file sẽ không
            được ghi vào CRM. Hãy xác nhận đơn vị gốc trước khi nhập dữ liệu vận hành.
          </p>
          <label>
            File Excel Shopee (.xlsx)
            <input
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(event) => void inspectImportFile(event.currentTarget.files?.[0] ?? null)}
            />
          </label>

          {importSheets.length > 0 && selectedImportSheet && (
            <>
              <div className="form-grid three" style={{ alignItems: 'end' }}>
                <label>
                  Sheet
                  <select
                    value={importSheetName}
                    onChange={(event) => {
                      const sheet = importSheets.find((item) => item.name === event.target.value);
                      const row = sheet?.headerCandidates[0]?.rowNumber ?? 1;
                      setImportSheetName(event.target.value);
                      setImportHeaderRow(row);
                      applySuggestedMapping(sheet, row);
                    }}
                  >
                    {importSheets.map((sheet) => (
                      <option key={sheet.name} value={sheet.name}>
                        {sheet.name} ({sheet.rowCount} dòng)
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Hàng tiêu đề
                  <select
                    value={importHeaderRow}
                    onChange={(event) => {
                      const row = Number(event.target.value);
                      setImportHeaderRow(row);
                      applySuggestedMapping(selectedImportSheet, row);
                    }}
                  >
                    {selectedImportSheet.rows.map((row) => (
                      <option key={row.rowNumber} value={row.rowNumber}>
                        {row.rowNumber}:{' '}
                        {row.values.filter(Boolean).slice(0, 4).join(' · ') || '(trống)'}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="assumption-note">
                  Nếu file không có đơn vị gốc, điền cả mã và tên đơn vị mặc định bên dưới.
                </div>
              </div>
              <div
                className="form-grid three"
                style={{ maxHeight: 420, overflow: 'auto', padding: '4px 2px' }}
              >
                {PRODUCT_IMPORT_FIELDS.map((fieldName) => (
                  <label key={fieldName}>
                    {PRODUCT_IMPORT_LABELS[fieldName]}
                    <select
                      value={importColumns[fieldName] ?? ''}
                      onChange={(event) => {
                        const value = event.target.value;
                        setImportColumns((current) => {
                          const next = { ...current };
                          if (value === '') delete next[fieldName];
                          else next[fieldName] = Number(value);
                          return next;
                        });
                        setImportPreview(null);
                        setImportIdempotencyKey('');
                      }}
                    >
                      <option value="">Không ánh xạ</option>
                      {selectedImportHeader?.values.map((heading, index) => (
                        <option key={index} value={index}>
                          Cột {index + 1}: {heading || '(không có tên)'}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
              <div className="form-grid three" style={{ alignItems: 'end' }}>
                <label>
                  Mã đơn vị gốc mặc định
                  <input
                    value={importDefaultUnitCode}
                    onChange={(event) => {
                      setImportDefaultUnitCode(event.target.value);
                      setImportPreview(null);
                      setImportIdempotencyKey('');
                    }}
                    placeholder="VD: CAI"
                  />
                </label>
                <label>
                  Tên đơn vị gốc mặc định
                  <input
                    value={importDefaultUnitName}
                    onChange={(event) => {
                      setImportDefaultUnitName(event.target.value);
                      setImportPreview(null);
                      setImportIdempotencyKey('');
                    }}
                    placeholder="VD: Cái"
                  />
                </label>
                <div className="assumption-note">
                  Không tạo quy đổi từ dữ liệu Shopee. Đơn vị bán ban đầu được đặt bằng đơn vị gốc.
                </div>
              </div>
              <div className="header-actions" style={{ justifyContent: 'flex-start' }}>
                <button
                  className="ghost"
                  type="button"
                  onClick={() => void previewProductImport()}
                  disabled={importing}
                >
                  {importing ? 'Đang kiểm tra…' : 'Kiểm tra dữ liệu'}
                </button>
                {importPreview && importPreview.issues.length === 0 && (
                  <button
                    className="primary compact"
                    type="button"
                    onClick={() => void applyProductImport()}
                    disabled={importing}
                  >
                    {importing ? 'Đang nhập…' : `Xác nhận nhập ${importPreview.variantCount} SKU`}
                  </button>
                )}
              </div>
            </>
          )}
          {importing && importSheets.length === 0 && (
            <div className="empty-state">Đang đọc cấu trúc file…</div>
          )}
          {importPreview && (
            <div style={{ display: 'grid', gap: 8 }}>
              <b>
                Xem trước: {importPreview.productCount} sản phẩm, {importPreview.variantCount} SKU
              </b>
              {importPreview.ignoredRows.length > 0 && (
                <span>Bỏ qua dòng hướng dẫn: {importPreview.ignoredRows.join(', ')}</span>
              )}
              {importPreview.warnings.map((warning) => (
                <p className="assumption-note" key={warning}>
                  {warning}
                </p>
              ))}
              {importPreview.issues.length > 0 && (
                <div className="error-message" role="alert">
                  <b>Cần sửa {importPreview.issues.length} lỗi trước khi nhập:</b>
                  {importPreview.issues.map((issue, index) => (
                    <div key={`${issue.row}-${issue.field}-${index}`}>
                      Dòng {issue.row} · {issue.field}: {issue.message}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {showCreate && canWrite && (
        <form className="panel-form create-catalog" onSubmit={createProduct}>
          <div className="section-heading">
            <div>
              <p className="eyebrow">SẢN PHẨM MỚI</p>
              <h2>Tạo sản phẩm và SKU đầu tiên</h2>
            </div>
            <span>SKU là duy nhất trong toàn business</span>
          </div>
          <div className="form-grid three">
            <label>
              Tên sản phẩm *<input name="productName" required />
            </label>
            <label>
              Danh mục
              <input name="category" />
            </label>
            <label>
              Thương hiệu
              <input name="brand" />
            </label>
            <label className="wide">
              Mô tả
              <textarea name="description" rows={2} />
            </label>
          </div>
          <VariantFields />
          <button className="primary compact" disabled={saving}>
            {saving ? 'Đang lưu…' : 'Tạo sản phẩm'}
          </button>
        </form>
      )}

      <div className="catalog-layout">
        <section className="customer-list-panel catalog-list-panel">
          <form
            className="search-row"
            onSubmit={(event) => {
              event.preventDefault();
              void loadProducts(query);
            }}
          >
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Tên, danh mục, SKU hoặc barcode"
            />
            <button className="ghost">Tìm</button>
          </form>
          <div className="list-caption">
            <span>{products.length} sản phẩm</span>
            {query && (
              <button
                onClick={() => {
                  setQuery('');
                  void loadProducts('');
                }}
              >
                Xóa lọc
              </button>
            )}
          </div>
          {loading ? (
            <div className="empty-state">Đang tải danh mục…</div>
          ) : products.length === 0 ? (
            <div className="empty-state">
              <b>Chưa có sản phẩm.</b>
              <span>Người có quyền catalog.write có thể tạo sản phẩm đầu tiên.</span>
            </div>
          ) : (
            <div className="catalog-list">
              {products.map((product) => (
                <button
                  key={product.id}
                  className={selected?.id === product.id ? 'selected' : ''}
                  onClick={() => selectProduct(product.id)}
                >
                  <span className={`catalog-icon ${product.status.toLowerCase()}`}>SP</span>
                  <span>
                    <b>{product.name}</b>
                    <small>{product.category || 'Chưa phân loại'}</small>
                    <small>{product.variants.map(({ sku }) => sku).join(', ')}</small>
                  </span>
                  <i>{product._count.variants}</i>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="customer-detail-panel catalog-detail-panel">
          {!selected ? (
            <div className="empty-state large">
              <b>Chọn một sản phẩm</b>
              <span>SKU, đơn vị và ảnh metadata sẽ hiển thị tại đây.</span>
            </div>
          ) : editingProduct ? (
            <form className="panel-form" onSubmit={updateProduct}>
              <div className="section-heading">
                <div>
                  <p className="eyebrow">CHỈNH SỬA · VERSION {selected.version}</p>
                  <h2>{selected.name}</h2>
                </div>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => setEditingProduct(false)}
                >
                  Hủy
                </button>
              </div>
              <div className="form-grid two">
                <label>
                  Tên
                  <input name="name" defaultValue={selected.name} required />
                </label>
                <label>
                  Danh mục
                  <input name="category" defaultValue={selected.category ?? ''} />
                </label>
                <label>
                  Thương hiệu
                  <input name="brand" defaultValue={selected.brand ?? ''} />
                </label>
                <label className="wide">
                  Mô tả
                  <textarea name="description" defaultValue={selected.description ?? ''} />
                </label>
              </div>
              <button className="primary compact" disabled={saving}>
                Lưu sản phẩm
              </button>
            </form>
          ) : (
            <>
              <div className="catalog-head">
                <span className={`catalog-icon large ${selected.status.toLowerCase()}`}>SP</span>
                <div>
                  <p className="eyebrow">{selected.category || 'CHƯA PHÂN LOẠI'}</p>
                  <h2>{selected.name}</h2>
                  <div className="profile-tags">
                    <span>{selected.brand || 'Chưa có thương hiệu'}</span>
                    <span>{selected.status === 'ACTIVE' ? 'Đang bán' : 'Ngừng bán'}</span>
                    <span>{selected.variants.length} SKU</span>
                  </div>
                </div>
                {canWrite && (
                  <div className="catalog-actions">
                    <button className="ghost" onClick={() => setEditingProduct(true)}>
                      Chỉnh sửa
                    </button>
                    <button className="ghost" disabled={saving} onClick={toggleProduct}>
                      {selected.status === 'ACTIVE' ? 'Ngừng bán' : 'Mở bán'}
                    </button>
                  </div>
                )}
              </div>
              {selected.description && <div className="profile-note">{selected.description}</div>}

              <div className="detail-section">
                <p className="eyebrow">BIẾN THỂ & ĐƠN VỊ</p>
                <h3>SKU</h3>
                <div className="variant-list">
                  {selected.variants.map((variant) => (
                    <article
                      key={variant.id}
                      className={variant.status === 'INACTIVE' ? 'inactive' : ''}
                    >
                      <div className="variant-main">
                        <div>
                          <code>{variant.sku}</code>
                          <h4>{variant.name}</h4>
                          <small>
                            Gốc: 1 {variant.baseUnitName} ({variant.baseUnitCode})
                            {` · Bán: ${variant.sellingUnitName} (${variant.sellingUnitCode})`}
                            {variant.barcode ? ` · Barcode ${variant.barcode}` : ''}
                          </small>
                        </div>
                        {canWrite && (
                          <button
                            className="ghost"
                            disabled={saving}
                            onClick={() => toggleVariant(variant)}
                          >
                            {variant.status === 'ACTIVE' ? 'Ngừng SKU' : 'Mở SKU'}
                          </button>
                        )}
                      </div>
                      {variant.attributes && Object.keys(variant.attributes).length > 0 && (
                        <div className="attribute-row">
                          {Object.entries(variant.attributes).map(([key, value]) => (
                            <span key={key}>
                              {key}: {value}
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="conversion-row">
                        <span className="base-unit">1 {variant.baseUnitName} = đơn vị gốc</span>
                        {variant.conversions.map((conversion) => (
                          <span key={conversion.id}>
                            1 {conversion.unitName} = {String(conversion.factor)}{' '}
                            {variant.baseUnitName}
                          </span>
                        ))}
                      </div>
                      {canWrite && (
                        <div className="variant-settings">
                          <details className="inline-create compact-details">
                            <summary>Sửa quy đổi</summary>
                            <form onSubmit={(event) => replaceConversions(event, variant)}>
                              <ConversionFields conversions={variant.conversions} />
                              <button className="primary compact" disabled={saving}>
                                Lưu quy đổi
                              </button>
                            </form>
                          </details>
                          <details className="inline-create compact-details">
                            <summary>Đổi đơn vị bán cố định</summary>
                            <form onSubmit={(event) => setSellingUnit(event, variant)}>
                              <label>
                                Đơn vị bán
                                <select
                                  name="sellingUnitCode"
                                  defaultValue={variant.sellingUnitCode}
                                >
                                  <option value={variant.baseUnitCode}>
                                    {variant.baseUnitName} ({variant.baseUnitCode})
                                  </option>
                                  {variant.conversions.map((conversion) => (
                                    <option key={conversion.id} value={conversion.unitCode}>
                                      {conversion.unitName} ({conversion.unitCode})
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <p className="section-help">
                                Chỉ đổi được trước khi SKU có giá để không thay đổi ý nghĩa bảng
                                giá.
                              </p>
                              <button className="primary compact" disabled={saving}>
                                Lưu đơn vị bán
                              </button>
                            </form>
                          </details>
                        </div>
                      )}
                    </article>
                  ))}
                </div>
                {canWrite && (
                  <details className="inline-create">
                    <summary>+ Thêm SKU</summary>
                    <form onSubmit={addVariant}>
                      <VariantFields />
                      <button className="primary compact" disabled={saving}>
                        Thêm SKU
                      </button>
                    </form>
                  </details>
                )}
              </div>

              <div className="detail-section">
                <p className="eyebrow">ẢNH SẢN PHẨM</p>
                <h3>Media metadata</h3>
                <p className="section-help">
                  Ảnh hiện được lưu dưới dạng URL HTTPS và mô tả; chưa có chức năng tải tệp lên.
                </p>
                <div className="media-list">
                  {selected.media
                    .filter((media) => media.status === 'ACTIVE')
                    .map((media) => (
                      <article key={media.id}>
                        <div>
                          <b>{media.altText || 'Ảnh chưa có mô tả'}</b>
                          <a href={media.url} target="_blank" rel="noreferrer">
                            {media.url}
                          </a>
                        </div>
                        {canManageMedia && (
                          <button disabled={saving} onClick={() => archiveMedia(media.id)}>
                            Lưu trữ
                          </button>
                        )}
                      </article>
                    ))}
                </div>
                {canManageMedia && (
                  <form className="mini-form media-form" onSubmit={addMedia}>
                    <input name="url" type="url" placeholder="https://…" required />
                    <input name="altText" placeholder="Mô tả ảnh" />
                    <select name="variantId" defaultValue="">
                      <option value="">Ảnh chung sản phẩm</option>
                      {selected.variants.map((variant) => (
                        <option key={variant.id} value={variant.id}>
                          {variant.sku}
                        </option>
                      ))}
                    </select>
                    <button className="ghost" disabled={saving}>
                      Thêm ảnh
                    </button>
                  </form>
                )}
              </div>
            </>
          )}
        </section>
      </div>
    </section>
  );
}

function VariantFields() {
  return (
    <div className="variant-fields">
      <div className="subform-title">SKU và đơn vị gốc</div>
      <div className="form-grid three">
        <label>
          SKU *<input name="sku" placeholder="SP-MAU-SIZE" required />
        </label>
        <label>
          Tên biến thể *<input name="variantName" required />
        </label>
        <label>
          Barcode
          <input name="barcode" />
        </label>
        <label>
          Mã đơn vị gốc *<input name="baseUnitCode" defaultValue="CAI" required />
        </label>
        <label>
          Tên đơn vị gốc *<input name="baseUnitName" defaultValue="Cái" required />
        </label>
        <label>
          Màu (tùy chọn)
          <input name="color" />
        </label>
        <label>
          Size/dung tích (tùy chọn)
          <input name="size" />
        </label>
      </div>
      <div className="subform-title">Quy đổi tùy chọn — hệ số theo đơn vị gốc</div>
      <label>
        Mã đơn vị bán cố định (để trống = đơn vị gốc)
        <input
          name="sellingUnitCode"
          placeholder="Ví dụ: THUNG; phải khai báo ở quy đổi bên dưới"
        />
      </label>
      <ConversionFields />
    </div>
  );
}

function ConversionFields({ conversions = [] }: { conversions?: Conversion[] }) {
  return (
    <div className="conversion-fields">
      {[0, 1].map((index) => (
        <div key={index} className="form-grid three">
          <label>
            Mã đơn vị {index + 1}
            <input
              name={`unitCode${index + 1}`}
              defaultValue={conversions[index]?.unitCode ?? ''}
            />
          </label>
          <label>
            Tên đơn vị {index + 1}
            <input
              name={`unitName${index + 1}`}
              defaultValue={conversions[index]?.unitName ?? ''}
            />
          </label>
          <label>
            Hệ số
            <input
              name={`factor${index + 1}`}
              inputMode="decimal"
              defaultValue={conversions[index] ? String(conversions[index].factor) : ''}
              placeholder={index === 0 ? '10' : '100'}
            />
          </label>
        </div>
      ))}
    </div>
  );
}
