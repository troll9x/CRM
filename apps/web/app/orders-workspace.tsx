'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { api, type Staff } from './api-client';

type Customer = { id: string; customerCode: string; displayName: string };
type Product = {
  id: string;
  name: string;
  status: string;
  variants: Array<{
    id: string;
    sku: string;
    name: string;
    sellingUnitName: string;
    status: string;
  }>;
};
type DraftLine = { variantId: string; quantity: string };

type Order = {
  id: string;
  orderNumber: string;
  status: 'DRAFT';
  sourceRevision: number;
  grandTotalVnd: string;
  shippingFeeVnd: string;
  taxVnd: string;
  depositVnd: string;
  paymentNote: string | null;
  createdAt: string;
  updatedAt: string;
  customer: { id: string; customerCode: string; displayName: string };
  createdBy: { id: string; displayName: string };
  sourceQuote: { id: string; quoteNumber: string } | null;
  lines: Array<{
    id: string;
    lineNumber: number;
    productNameSnapshot: string;
    skuSnapshot: string;
    variantNameSnapshot: string;
    unitNameSnapshot: string;
    quantity: string;
    unitPriceVnd: string;
    lineTotalVnd: string;
  }>;
};

function money(value: string) {
  try {
    return `${BigInt(value).toLocaleString('vi-VN')} ₫`;
  } catch {
    return `${value} ₫`;
  }
}

function quantity(value: string) {
  const [integerPart, fractionPart] = value.split('.');
  const groupedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return fractionPart ? `${groupedInteger},${fractionPart}` : groupedInteger;
}

export function OrdersWorkspace({
  staff,
  onLogout,
  loggingOut,
}: {
  staff: Staff;
  onLogout: () => void;
  loggingOut: boolean;
}) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [draftLines, setDraftLines] = useState<DraftLine[]>([{ variantId: '', quantity: '1' }]);
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const canCreate = staff.permissions.includes('orders.create');
  const variants = useMemo(
    () =>
      products.flatMap((product) =>
        product.status === 'ACTIVE'
          ? product.variants
              .filter((variant) => variant.status === 'ACTIVE')
              .map((variant) => ({ ...variant, productName: product.name }))
          : [],
      ),
    [products],
  );
  const selected = orders.find((order) => order.id === selectedId) ?? orders[0] ?? null;

  const load = useCallback(async (search = '') => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ limit: '50' });
      if (search.trim()) params.set('query', search.trim());
      const result = await api<{ items: Order[] }>(`/orders?${params.toString()}`);
      setOrders(result.items);
      setSelectedId((current) =>
        result.items.some((order) => order.id === current) ? current : (result.items[0]?.id ?? ''),
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không tải được danh sách đơn bán.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    if (!canCreate) return;
    let active = true;
    Promise.all([api<{ items: Customer[] }>('/customers'), api<{ items: Product[] }>('/products')])
      .then(([customerResult, productResult]) => {
        if (!active) return;
        setCustomers(customerResult.items);
        setProducts(productResult.items);
        setCustomerId(customerResult.items[0]?.id ?? '');
        setDraftLines([
          { variantId: productResult.items.flatMap((p) => p.variants)[0]?.id ?? '', quantity: '1' },
        ]);
      })
      .catch((caught) =>
        setError(caught instanceof Error ? caught.message : 'Không tải được khách hàng và SKU.'),
      );
    return () => {
      active = false;
    };
  }, [canCreate]);

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void load(query);
  }

  async function createDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreating(true);
    setError('');
    setMessage('');
    try {
      await api<Order>('/orders', {
        method: 'POST',
        headers: { 'Idempotency-Key': crypto.randomUUID() },
        body: JSON.stringify({ customerId, lines: draftLines }),
      });
      setMessage(
        'Đã tạo đơn nháp. Giá được phân giải từ bảng giá; chưa giữ kho, ghi nợ hoặc thu tiền.',
      );
      setShowCreate(false);
      setDraftLines([{ variantId: variants[0]?.id ?? '', quantity: '1' }]);
      await load(query);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không tạo được đơn nháp.');
    } finally {
      setCreating(false);
    }
  }

  return (
    <section className="dashboard-content orders-workspace">
      <header>
        <div>
          <p className="eyebrow">ĐỢT 06 · ĐƠN BÁN</p>
          <h1>Đơn hàng</h1>
          <p className="muted">Tra cứu đơn nháp được tạo từ báo giá đã chấp nhận.</p>
        </div>
        <div className="header-actions">
          <button className="ghost" onClick={() => void load(query)} disabled={loading}>
            Làm mới
          </button>
          <button className="ghost" onClick={onLogout} disabled={loggingOut}>
            Đăng xuất
          </button>
        </div>
      </header>

      <div className="notice purchase-warning">
        <b>Đơn đang ở trạng thái nháp.</b>
        <span>
          Chưa xác nhận đơn, giữ/trừ tồn, ghi nhận công nợ hay thu tiền. Các thao tác này chờ chốt
          chính sách nghiệp vụ.
        </span>
      </div>
      {error && (
        <div className="error-message" role="alert">
          {error}
        </div>
      )}
      {message && (
        <div className="notice purchase-warning" role="status">
          {message}
        </div>
      )}

      <div className="orders-layout">
        <section className="customer-list-panel">
          <form className="search-row" onSubmit={search}>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Tìm mã đơn, báo giá, khách hoặc SKU"
              aria-label="Tìm đơn hàng"
            />
            <button type="submit" disabled={loading}>
              Tìm
            </button>
          </form>
          <div className="panel-title">
            <b>Đơn bán</b>
            <span>{orders.length}</span>
          </div>
          {canCreate && (
            <button
              type="button"
              className="primary order-create-toggle"
              onClick={() => setShowCreate((value) => !value)}
            >
              {showCreate ? 'Đóng biểu mẫu' : 'Tạo đơn nháp thủ công'}
            </button>
          )}
          {showCreate && canCreate && (
            <form className="order-create-form" onSubmit={createDraft}>
              <label>
                Khách hàng
                <select
                  value={customerId}
                  onChange={(event) => setCustomerId(event.target.value)}
                  required
                >
                  {customers.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.customerCode} · {customer.displayName}
                    </option>
                  ))}
                </select>
              </label>
              {draftLines.map((line, index) => (
                <div className="order-draft-line" key={index}>
                  <label>
                    Sản phẩm / SKU
                    <select
                      value={line.variantId}
                      onChange={(event) =>
                        setDraftLines((current) =>
                          current.map((row, rowIndex) =>
                            rowIndex === index ? { ...row, variantId: event.target.value } : row,
                          ),
                        )
                      }
                      required
                    >
                      <option value="">Chọn SKU</option>
                      {variants.map((variant) => (
                        <option key={variant.id} value={variant.id}>
                          {variant.productName} · {variant.sku} · {variant.sellingUnitName}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Số lượng
                    <input
                      inputMode="decimal"
                      pattern="[0-9]+([.][0-9]{1,6})?"
                      value={line.quantity}
                      onChange={(event) =>
                        setDraftLines((current) =>
                          current.map((row, rowIndex) =>
                            rowIndex === index ? { ...row, quantity: event.target.value } : row,
                          ),
                        )
                      }
                      required
                    />
                  </label>
                  {draftLines.length > 1 && (
                    <button
                      type="button"
                      className="ghost"
                      onClick={() =>
                        setDraftLines((current) =>
                          current.filter((_, rowIndex) => rowIndex !== index),
                        )
                      }
                    >
                      Bỏ dòng
                    </button>
                  )}
                </div>
              ))}
              <button
                type="button"
                className="ghost"
                disabled={draftLines.length >= 100}
                onClick={() =>
                  setDraftLines((current) => [
                    ...current,
                    { variantId: variants[0]?.id ?? '', quantity: '1' },
                  ])
                }
              >
                Thêm dòng hàng
              </button>
              <p className="section-help">
                Thành tiền dùng giá hiện tại trên server, làm tròn từng dòng. Thuế, phí giao và giảm
                giá chưa nhập ở luồng này.
              </p>
              <button type="submit" disabled={creating || !customerId || variants.length === 0}>
                {creating ? 'Đang tạo…' : 'Tạo đơn nháp'}
              </button>
            </form>
          )}
          <div className="catalog-list">
            {loading ? (
              <p className="empty-copy">Đang tải…</p>
            ) : orders.length === 0 ? (
              <p className="empty-copy">Chưa có đơn phù hợp.</p>
            ) : (
              orders.map((order) => (
                <button
                  key={order.id}
                  className={selected?.id === order.id ? 'selected' : ''}
                  onClick={() => setSelectedId(order.id)}
                >
                  <div>
                    <b>{order.orderNumber}</b>
                    <small>
                      {order.customer.displayName} · {order.lines.length} dòng
                    </small>
                  </div>
                  <i>Nháp · {money(order.grandTotalVnd)}</i>
                </button>
              ))
            )}
          </div>
        </section>

        <section className="detail-card purchase-detail">
          {!selected ? (
            <p className="empty-copy">Chọn đơn nháp hoặc tạo đơn mới từ báo giá / nhập thủ công.</p>
          ) : (
            <>
              <div className="section-heading">
                <div>
                  <p className="eyebrow">{selected.orderNumber}</p>
                  <h2>{selected.customer.displayName}</h2>
                  <p className="muted">
                    {selected.customer.customerCode} ·{' '}
                    {selected.sourceQuote
                      ? `Báo giá ${selected.sourceQuote.quoteNumber} · phiên bản ${selected.sourceRevision}`
                      : 'Tạo thủ công'}
                  </p>
                </div>
                <span className="status-pill">Đơn nháp</span>
              </div>
              <div className="order-summary-grid">
                <div>
                  <span>Tổng thanh toán dự kiến</span>
                  <b>{money(selected.grandTotalVnd)}</b>
                </div>
                <div>
                  <span>Phí giao</span>
                  <b>{money(selected.shippingFeeVnd)}</b>
                </div>
                <div>
                  <span>Thuế theo báo giá</span>
                  <b>{money(selected.taxVnd)}</b>
                </div>
                <div>
                  <span>Cọc dự kiến</span>
                  <b>{money(selected.depositVnd)}</b>
                </div>
              </div>
              <div className="purchase-lines">
                {selected.lines.map((line) => (
                  <article key={line.id}>
                    <div>
                      <b>
                        {line.productNameSnapshot} · {line.variantNameSnapshot}
                      </b>
                      <small>{line.skuSnapshot}</small>
                    </div>
                    <span>
                      {quantity(line.quantity)} {line.unitNameSnapshot}
                    </span>
                    <span>{money(line.unitPriceVnd)} / đơn vị</span>
                    <b>{money(line.lineTotalVnd)}</b>
                  </article>
                ))}
              </div>
              {selected.paymentNote && (
                <p className="muted order-payment-note">
                  Ghi chú thanh toán: {selected.paymentNote}
                </p>
              )}
              <p className="section-help">
                Tạo bởi {selected.createdBy.displayName} · Cập nhật{' '}
                {new Date(selected.updatedAt).toLocaleString('vi-VN')}
              </p>
            </>
          )}
        </section>
      </div>
    </section>
  );
}
