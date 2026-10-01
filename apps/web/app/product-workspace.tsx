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
  const [editingProduct, setEditingProduct] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

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
          <p className="eyebrow">ĐỢT 03 · SẢN PHẨM & SKU</p>
          <h1>Danh mục hàng hóa</h1>
        </div>
        <div className="header-actions">
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
                        <details className="inline-create compact-details">
                          <summary>Sửa quy đổi</summary>
                          <form onSubmit={(event) => replaceConversions(event, variant)}>
                            <ConversionFields conversions={variant.conversions} />
                            <button className="primary compact" disabled={saving}>
                              Lưu quy đổi
                            </button>
                          </form>
                        </details>
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
                  Đợt 03 chỉ lưu URL HTTPS và mô tả ảnh; chưa có kho file/upload giả.
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
