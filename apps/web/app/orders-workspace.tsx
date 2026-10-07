'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { api } from './api-client';

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
  sourceQuote: { id: string; quoteNumber: string };
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
  onLogout,
  loggingOut,
}: {
  onLogout: () => void;
  loggingOut: boolean;
}) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
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

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void load(query);
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
            <p className="empty-copy">Đơn nháp sẽ xuất hiện tại đây sau khi chuyển từ báo giá.</p>
          ) : (
            <>
              <div className="section-heading">
                <div>
                  <p className="eyebrow">{selected.orderNumber}</p>
                  <h2>{selected.customer.displayName}</h2>
                  <p className="muted">
                    {selected.customer.customerCode} · Báo giá {selected.sourceQuote.quoteNumber} ·{' '}
                    phiên bản {selected.sourceRevision}
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
