'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { api, type Staff } from './api-client';

type Supplier = {
  id: string;
  supplierCode: string;
  name: string;
  contactName?: string | null;
  phone?: string | null;
  email?: string | null;
  status: 'ACTIVE' | 'ARCHIVED';
  version: number;
  _count?: { purchaseOrders: number };
};
type Unit = { unitCode: string; unitName: string; factor: string };
type Variant = {
  id: string;
  sku: string;
  name: string;
  baseUnitCode: string;
  baseUnitName: string;
  status: 'ACTIVE' | 'INACTIVE';
  conversions?: Unit[];
};
type Product = { id: string; name: string; status: 'ACTIVE' | 'INACTIVE'; variants: Variant[] };
type PurchaseLine = {
  id: string;
  variantId: string;
  skuSnapshot: string;
  variantNameSnapshot: string;
  unitCodeSnapshot: string;
  unitNameSnapshot: string;
  conversionFactorSnapshot: string;
  orderedQuantity: string;
  baseQuantity: string;
  expectedUnitCostVnd?: string | null;
  receivedQuantity: string;
  remainingQuantity: string;
};
type PurchaseOrder = {
  id: string;
  orderNumber: string;
  status: 'DRAFT' | 'ORDERED' | 'PARTIALLY_RECEIVED' | 'RECEIVED' | 'CANCELED';
  expectedAt?: string | null;
  notes?: string | null;
  version: number;
  updatedAt: string;
  supplier: Pick<Supplier, 'id' | 'supplierCode' | 'name' | 'status'>;
  lines: PurchaseLine[];
};

function field(form: FormData, name: string) {
  return String(form.get(name) ?? '').trim();
}

const statusLabel = {
  DRAFT: 'Nháp',
  ORDERED: 'Đã phát hành',
  PARTIALLY_RECEIVED: 'Đã nhận một phần',
  RECEIVED: 'Đã nhận đủ',
  CANCELED: 'Đã hủy',
};

function formatVnd(value: string) {
  return `${BigInt(value).toLocaleString('vi-VN')} ₫`;
}

export function PurchasingWorkspace({
  staff,
  onLogout,
  loggingOut,
}: {
  staff: Staff;
  onLogout: () => void;
  loggingOut: boolean;
}) {
  const canWrite = staff.permissions.includes('purchasing.write');
  const canViewCost = staff.permissions.includes('cost.view');
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selected, setSelected] = useState<PurchaseOrder | null>(null);
  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showSupplierForm, setShowSupplierForm] = useState(false);
  const [showOrderForm, setShowOrderForm] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const variants = useMemo(
    () =>
      products.flatMap((product) =>
        product.variants
          .filter((variant) => variant.status === 'ACTIVE')
          .map((variant) => ({ ...variant, productId: product.id, productName: product.name })),
      ),
    [products],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [supplierRows, orderRows, productRows] = await Promise.all([
        api<Supplier[]>('/suppliers?limit=100'),
        api<PurchaseOrder[]>('/purchase-orders?limit=50'),
        api<{ items: Product[] }>('/products?status=ACTIVE&limit=50'),
      ]);
      setSuppliers(supplierRows);
      setOrders(orderRows);
      setProducts(productRows.items);
      setSelected((current) =>
        current
          ? (orderRows.find((order) => order.id === current.id) ?? orderRows[0] ?? null)
          : (orderRows[0] ?? null),
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không tải được dữ liệu mua hàng.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function chooseVariant(variantId: string) {
    const variant = variants.find((item) => item.id === variantId);
    if (!variant) {
      setUnits([]);
      return;
    }
    try {
      const product = await api<{ variants: Variant[] }>(`/products/${variant.productId}`);
      const detail = product.variants.find((item) => item.id === variantId);
      setUnits(
        detail
          ? [
              { unitCode: detail.baseUnitCode, unitName: detail.baseUnitName, factor: '1' },
              ...(detail.conversions ?? []),
            ]
          : [],
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không tải được đơn vị của SKU.');
    }
  }

  async function createSupplier(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');
    const form = new FormData(event.currentTarget);
    try {
      await api('/suppliers', {
        method: 'POST',
        body: JSON.stringify({
          name: field(form, 'name'),
          contactName: field(form, 'contactName') || undefined,
          phone: field(form, 'phone') || undefined,
          email: field(form, 'email') || undefined,
          taxCode: field(form, 'taxCode') || undefined,
          address: field(form, 'address') || undefined,
        }),
      });
      event.currentTarget.reset();
      setShowSupplierForm(false);
      setMessage('Đã tạo nhà cung cấp.');
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không tạo được nhà cung cấp.');
    } finally {
      setSaving(false);
    }
  }

  async function archiveSupplier(supplier: Supplier) {
    setSaving(true);
    setError('');
    try {
      await api(`/suppliers/${supplier.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ version: supplier.version, status: 'ARCHIVED' }),
      });
      setMessage('Đã lưu trữ nhà cung cấp; chứng từ cũ vẫn được giữ nguyên.');
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không lưu trữ được nhà cung cấp.');
    } finally {
      setSaving(false);
    }
  }

  async function createOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');
    const form = new FormData(event.currentTarget);
    try {
      const order = await api<PurchaseOrder>('/purchase-orders', {
        method: 'POST',
        body: JSON.stringify({
          supplierId: field(form, 'supplierId'),
          expectedAt: field(form, 'expectedAt')
            ? new Date(`${field(form, 'expectedAt')}T00:00:00+07:00`).toISOString()
            : undefined,
          notes: field(form, 'notes') || undefined,
          lines: [
            {
              variantId: field(form, 'variantId'),
              unitCode: field(form, 'unitCode'),
              quantity: field(form, 'quantity'),
              expectedUnitCostVnd: field(form, 'expectedUnitCostVnd') || undefined,
            },
          ],
        }),
      });
      event.currentTarget.reset();
      setUnits([]);
      setShowOrderForm(false);
      setSelected(order);
      setMessage('Đã tạo đơn mua nháp. Tồn kho chưa thay đổi.');
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không tạo được đơn mua.');
    } finally {
      setSaving(false);
    }
  }

  async function command(order: PurchaseOrder, action: 'order' | 'cancel') {
    setSaving(true);
    setError('');
    try {
      const updated = await api<PurchaseOrder>(`/purchase-orders/${order.id}/${action}`, {
        method: 'POST',
        body: JSON.stringify({ version: order.version }),
      });
      setSelected(updated);
      setMessage(
        action === 'order'
          ? 'Đã phát hành đơn mua. Tồn chỉ tăng khi ghi nhận phiếu nhận hàng.'
          : 'Đã hủy đơn mua; không có biến động tồn.',
      );
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không cập nhật được đơn mua.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="dashboard-content purchasing-workspace">
      <header>
        <div>
          <p className="eyebrow">MUA HÀNG</p>
          <h1>Nhà cung cấp & đơn mua</h1>
          <p className="muted">Đơn mua chỉ ghi nhu cầu đặt hàng; chưa làm tăng tồn hoặc giá vốn.</p>
        </div>
        <div className="header-actions">
          {canWrite && (
            <>
              <button className="ghost" onClick={() => setShowSupplierForm((value) => !value)}>
                + Nhà cung cấp
              </button>
              <button className="primary" onClick={() => setShowOrderForm((value) => !value)}>
                + Đơn mua
              </button>
            </>
          )}
          <button className="ghost" onClick={onLogout} disabled={loggingOut}>
            Đăng xuất
          </button>
        </div>
      </header>

      <div className="notice purchase-warning">
        <b>Chưa phải phiếu nhập kho.</b>
        <span>Phát hành hoặc hủy đơn mua không tạo sổ kho và không thay đổi tồn.</span>
      </div>
      {message && <div className="success-message">{message}</div>}
      {error && <div className="error-message">{error}</div>}

      {showSupplierForm && (
        <form className="detail-card form-grid three" onSubmit={createSupplier}>
          <label>
            Tên nhà cung cấp
            <input name="name" minLength={2} maxLength={180} required />
          </label>
          <label>
            Người liên hệ
            <input name="contactName" maxLength={120} />
          </label>
          <label>
            Điện thoại
            <input name="phone" maxLength={40} />
          </label>
          <label>
            Email
            <input name="email" type="email" />
          </label>
          <label>
            Mã số thuế
            <input name="taxCode" maxLength={40} />
          </label>
          <label>
            Địa chỉ
            <input name="address" maxLength={500} />
          </label>
          <button className="primary" disabled={saving}>
            Lưu nhà cung cấp
          </button>
        </form>
      )}

      {showOrderForm && (
        <form className="detail-card purchase-form" onSubmit={createOrder}>
          <label>
            Nhà cung cấp
            <select name="supplierId" required defaultValue="">
              <option value="" disabled>
                Chọn nhà cung cấp
              </option>
              {suppliers
                .filter((item) => item.status === 'ACTIVE')
                .map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name} · {supplier.supplierCode}
                  </option>
                ))}
            </select>
          </label>
          <label>
            SKU
            <select
              name="variantId"
              required
              defaultValue=""
              onChange={(event) => void chooseVariant(event.target.value)}
            >
              <option value="" disabled>
                Chọn SKU
              </option>
              {variants.map((variant) => (
                <option key={variant.id} value={variant.id}>
                  {variant.sku} · {variant.productName} / {variant.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Đơn vị đặt
            <select name="unitCode" required defaultValue="">
              <option value="" disabled>
                Chọn đơn vị
              </option>
              {units.map((unit) => (
                <option key={unit.unitCode} value={unit.unitCode}>
                  {unit.unitName} ({unit.unitCode}) × {unit.factor}
                </option>
              ))}
            </select>
          </label>
          <label>
            Số lượng
            <input name="quantity" inputMode="decimal" pattern="[0-9]+([.][0-9]{1,6})?" required />
          </label>
          <label>
            Giá dự kiến / đơn vị (VND)
            <input name="expectedUnitCostVnd" inputMode="numeric" pattern="[0-9]+" />
          </label>
          <label>
            Ngày dự kiến
            <input name="expectedAt" type="date" />
          </label>
          <label className="purchase-notes">
            Ghi chú
            <input name="notes" maxLength={2000} />
          </label>
          <button
            className="primary"
            disabled={saving || !suppliers.some((item) => item.status === 'ACTIVE')}
          >
            Tạo đơn mua nháp
          </button>
        </form>
      )}

      <div className="purchase-layout">
        <section className="customer-list-panel">
          <div className="panel-title">
            <b>Nhà cung cấp</b>
            <span>{suppliers.length}</span>
          </div>
          <div className="supplier-list">
            {suppliers.length === 0 ? (
              <p className="empty-copy">Chưa có nhà cung cấp.</p>
            ) : (
              suppliers.map((supplier) => (
                <article
                  key={supplier.id}
                  className={supplier.status === 'ARCHIVED' ? 'inactive' : ''}
                >
                  <div>
                    <b>{supplier.name}</b>
                    <small>
                      {supplier.supplierCode} · {supplier.phone || 'Chưa có SĐT'}
                    </small>
                  </div>
                  {canWrite && supplier.status === 'ACTIVE' && (
                    <button onClick={() => void archiveSupplier(supplier)} disabled={saving}>
                      Lưu trữ
                    </button>
                  )}
                </article>
              ))
            )}
          </div>
        </section>

        <section className="customer-list-panel">
          <div className="panel-title">
            <b>Đơn mua</b>
            <span>{orders.length}</span>
          </div>
          <div className="catalog-list">
            {loading ? (
              <p className="empty-copy">Đang tải…</p>
            ) : orders.length === 0 ? (
              <p className="empty-copy">Chưa có đơn mua.</p>
            ) : (
              orders.map((order) => (
                <button
                  key={order.id}
                  className={selected?.id === order.id ? 'selected' : ''}
                  onClick={() => setSelected(order)}
                >
                  <div>
                    <b>{order.orderNumber}</b>
                    <small>
                      {order.supplier.name} · {order.lines.length} dòng
                    </small>
                  </div>
                  <i>{statusLabel[order.status]}</i>
                </button>
              ))
            )}
          </div>
        </section>

        <section className="detail-card purchase-detail">
          {!selected ? (
            <p className="empty-copy">Chọn hoặc tạo một đơn mua để xem chi tiết.</p>
          ) : (
            <>
              <div className="catalog-head">
                <div className="catalog-icon large">PO</div>
                <div>
                  <p className="eyebrow">{statusLabel[selected.status]}</p>
                  <h2>{selected.orderNumber}</h2>
                  <p className="muted">{selected.supplier.name}</p>
                </div>
                {canWrite && ['DRAFT', 'ORDERED'].includes(selected.status) && (
                  <div className="catalog-actions">
                    {selected.status === 'DRAFT' && (
                      <button
                        className="primary"
                        onClick={() => void command(selected, 'order')}
                        disabled={saving}
                      >
                        Phát hành
                      </button>
                    )}
                    <button
                      className="ghost danger"
                      onClick={() => void command(selected, 'cancel')}
                      disabled={saving}
                    >
                      Hủy đơn
                    </button>
                  </div>
                )}
              </div>
              <div className="purchase-lines">
                {selected.lines.map((line) => (
                  <article key={line.id}>
                    <div>
                      <code>{line.skuSnapshot}</code>
                      <b>{line.variantNameSnapshot}</b>
                    </div>
                    <strong>
                      {line.orderedQuantity} {line.unitNameSnapshot}
                    </strong>
                    <small>
                      = {line.baseQuantity} đơn vị gốc · đã nhận {line.receivedQuantity} · còn{' '}
                      {line.remainingQuantity} {line.unitNameSnapshot}
                    </small>
                    <span>
                      {!canViewCost
                        ? 'Chi phí được ẩn theo quyền'
                        : line.expectedUnitCostVnd
                          ? `${formatVnd(line.expectedUnitCostVnd)} / ${line.unitNameSnapshot}`
                          : 'Chưa nhập giá dự kiến'}
                    </span>
                  </article>
                ))}
              </div>
              {selected.notes && <p className="section-help">Ghi chú: {selected.notes}</p>}
            </>
          )}
        </section>
      </div>
    </section>
  );
}
