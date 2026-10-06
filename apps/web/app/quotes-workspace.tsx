'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { api, type Staff } from './api-client';

type Customer = { id: string; displayName: string; customerCode: string };
type Variant = { id: string; sku: string; name: string; sellingUnitName: string; status: string };
type Product = { id: string; name: string; status: string; variants: Variant[] };
type QuoteLineDraft = {
  variantId: string;
  quantity: string;
  discountMode: '' | 'PERCENTAGE' | 'FIXED_VND';
  discountValue: string;
};
type Quote = {
  id: string;
  quoteNumber: string;
  customerId: string;
  customer: Customer;
  status: 'DRAFT' | 'SENT' | 'ACCEPTED' | 'EXPIRED' | 'REJECTED';
  version: number;
  lineSubtotalVnd: string;
  lineDiscountVnd: string;
  orderDiscountMode: 'PERCENTAGE' | 'FIXED_VND' | null;
  orderDiscountValue: string | null;
  orderDiscountVnd: string;
  shippingFeeVnd: string;
  taxMode: 'PERCENTAGE' | 'FIXED_VND' | null;
  taxValue: string | null;
  taxVnd: string;
  depositVnd: string;
  grandTotalVnd: string;
  paymentNote: string | null;
  internalNote: string | null;
  receivedAt: string | null;
  expiresAt: string | null;
  lines: Array<{
    variantId: string;
    skuSnapshot: string;
    productNameSnapshot: string;
    variantNameSnapshot: string;
    quantity: string;
    unitNameSnapshot: string;
    unitPriceVnd: string;
    lineSubtotalVnd: string;
    discountMode: 'PERCENTAGE' | 'FIXED_VND' | null;
    discountValue: string | null;
    discountVnd: string;
    lineTotalVnd: string;
  }>;
  revisions: Array<{
    revisionNumber: number;
    sentAt: string;
    receivedAt: string;
    expiresAt: string;
  }>;
};
type QuoteRevision = { revisionNumber: number; snapshot: Quote & { taxPolicy?: string } };

const emptyLine = (): QuoteLineDraft => ({
  variantId: '',
  quantity: '1',
  discountMode: '',
  discountValue: '',
});

function vnd(value: string) {
  try {
    return `${BigInt(value).toLocaleString('vi-VN')} ₫`;
  } catch {
    return `${value} ₫`;
  }
}

function localDateTimeNow() {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

function modeLabel(mode: 'PERCENTAGE' | 'FIXED_VND' | null) {
  return mode === 'PERCENTAGE' ? '%' : mode === 'FIXED_VND' ? 'VND' : '';
}

export function QuotesWorkspace({
  staff,
  onLogout,
  loggingOut,
}: {
  staff: Staff;
  onLogout: () => void;
  loggingOut: boolean;
}) {
  const canManagePrice = staff.permissions.includes('price.edit');
  const canWrite = staff.permissions.includes('quotes.write');
  const canSend = staff.permissions.includes('quotes.send');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [selected, setSelected] = useState<Quote | null>(null);
  const [revision, setRevision] = useState<QuoteRevision | null>(null);
  const [customerId, setCustomerId] = useState('');
  const [lines, setLines] = useState<QuoteLineDraft[]>([emptyLine()]);
  const [orderDiscountMode, setOrderDiscountMode] = useState<'' | 'PERCENTAGE' | 'FIXED_VND'>('');
  const [orderDiscountValue, setOrderDiscountValue] = useState('');
  const [shippingFeeVnd, setShippingFeeVnd] = useState('0');
  const [taxMode, setTaxMode] = useState<'' | 'PERCENTAGE' | 'FIXED_VND'>('');
  const [taxValue, setTaxValue] = useState('');
  const [depositVnd, setDepositVnd] = useState('0');
  const [paymentNote, setPaymentNote] = useState('');
  const [receivedAt, setReceivedAt] = useState(localDateTimeNow());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

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

  async function loadQuotes(selectId?: string) {
    const result = await api<{ items: Quote[] }>('/quotes');
    setQuotes(result.items);
    const id = selectId ?? selected?.id;
    if (id) {
      const detail = await api<Quote>(`/quotes/${id}`);
      setSelected(detail);
      if (detail.revisions[0]) {
        setRevision(
          await api<QuoteRevision>(`/quotes/${id}/revisions/${detail.revisions[0].revisionNumber}`),
        );
      } else setRevision(null);
    }
  }

  useEffect(() => {
    let active = true;
    Promise.all([
      api<{ items: Customer[] }>('/customers'),
      api<{ items: Product[] }>('/products'),
      api<{ items: Quote[] }>('/quotes'),
    ])
      .then(([customerResult, productResult, quoteResult]) => {
        if (!active) return;
        setCustomers(customerResult.items);
        setProducts(productResult.items);
        setQuotes(quoteResult.items);
        setCustomerId(customerResult.items[0]?.id ?? '');
      })
      .catch((caught) => {
        if (active)
          setError(caught instanceof Error ? caught.message : 'Không tải được dữ liệu báo giá.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  function startNew() {
    setSelected(null);
    setRevision(null);
    setCustomerId(customers[0]?.id ?? '');
    setLines([emptyLine()]);
    setOrderDiscountMode('');
    setOrderDiscountValue('');
    setShippingFeeVnd('0');
    setTaxMode('');
    setTaxValue('');
    setDepositVnd('0');
    setPaymentNote('');
    setError('');
    setMessage('');
  }

  async function selectQuote(id: string) {
    setError('');
    try {
      const quote = await api<Quote>(`/quotes/${id}`);
      setSelected(quote);
      setRevision(
        quote.revisions[0]
          ? await api<QuoteRevision>(`/quotes/${id}/revisions/${quote.revisions[0].revisionNumber}`)
          : null,
      );
      setCustomerId(quote.customerId);
      setLines(
        quote.lines.map((line) => ({
          variantId: line.variantId,
          quantity: line.quantity,
          discountMode: line.discountMode ?? '',
          discountValue: line.discountValue ?? '',
        })),
      );
      setOrderDiscountMode(quote.orderDiscountMode ?? '');
      setOrderDiscountValue(quote.orderDiscountValue ?? '');
      setShippingFeeVnd(quote.shippingFeeVnd);
      setTaxMode(quote.taxMode ?? '');
      setTaxValue(quote.taxValue ?? '');
      setDepositVnd(quote.depositVnd);
      setPaymentNote(quote.paymentNote ?? '');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không tải được báo giá.');
    }
  }

  function updateLine(index: number, patch: Partial<QuoteLineDraft>) {
    setLines((current) =>
      current.map((line, lineIndex) => (lineIndex === index ? { ...line, ...patch } : line)),
    );
  }

  function requestBody() {
    return {
      customerId,
      lines: lines.map((line) => ({
        variantId: line.variantId,
        quantity: line.quantity,
        ...(line.discountMode
          ? { discountMode: line.discountMode, discountValue: line.discountValue }
          : {}),
      })),
      ...(orderDiscountMode
        ? { orderDiscountMode, orderDiscountValue }
        : selected
          ? { orderDiscountMode: null, orderDiscountValue: null }
          : {}),
      shippingFeeVnd,
      ...(taxMode ? { taxMode, taxValue } : selected ? { taxMode: null, taxValue: null } : {}),
      depositVnd,
      paymentNote,
    };
  }

  async function saveQuote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const saved = await api<Quote>(selected ? `/quotes/${selected.id}` : '/quotes', {
        method: selected ? 'PATCH' : 'POST',
        headers: { 'Idempotency-Key': crypto.randomUUID() },
        body: JSON.stringify(
          selected ? { ...requestBody(), expectedVersion: selected.version } : requestBody(),
        ),
      });
      setSelected(saved);
      setRevision(null);
      await loadQuotes(saved.id);
      setMessage(
        selected
          ? 'Đã lưu thay đổi báo giá nháp.'
          : 'Đã tạo báo giá nháp. Giá và thành tiền do hệ thống tính.',
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không lưu được báo giá.');
    } finally {
      setSaving(false);
    }
  }

  async function sendQuote() {
    if (!selected) return;
    const receivedDate = new Date(receivedAt);
    if (!Number.isFinite(receivedDate.getTime())) {
      setError('Nhập thời điểm khách nhận hợp lệ.');
      return;
    }
    setSaving(true);
    setError('');
    setMessage('');
    try {
      await api(`/quotes/${selected.id}/send`, {
        method: 'POST',
        headers: { 'Idempotency-Key': crypto.randomUUID() },
        body: JSON.stringify({
          expectedVersion: selected.version,
          receivedAt: receivedDate.toISOString(),
        }),
      });
      await loadQuotes(selected.id);
      setMessage('Đã đóng băng revision. Hãy in hoặc lưu thành PDF để chia sẻ thủ công.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không phát hành được báo giá.');
    } finally {
      setSaving(false);
    }
  }

  const printed = revision?.snapshot;

  return (
    <section className="dashboard-content quotes-page">
      <header className="no-print">
        <div>
          <p className="eyebrow">ĐỢT 05B · BÁO GIÁ</p>
          <h1>Báo giá khách hàng</h1>
          <p className="muted">
            Giá, giảm giá và tổng tiền được tính ở backend. Gửi hiện là ghi nhận chia sẻ thủ công.
          </p>
        </div>
        <div className="header-actions">
          <span className="user-pill">{staff.displayName}</span>
          <button className="ghost" onClick={onLogout} disabled={loggingOut}>
            {loggingOut ? 'Đang thoát…' : 'Đăng xuất'}
          </button>
        </div>
      </header>
      <div className="quotes-layout no-print">
        <aside className="quotes-list">
          <div className="section-heading">
            <div>
              <h2>Danh sách</h2>
              <p>{quotes.length} báo giá gần nhất</p>
            </div>
            {canWrite && (
              <button className="primary" onClick={startNew}>
                Tạo mới
              </button>
            )}
          </div>
          {loading ? (
            <div className="loading">Đang tải…</div>
          ) : quotes.length === 0 ? (
            <div className="empty-state">Chưa có báo giá.</div>
          ) : (
            quotes.map((quote) => (
              <button
                key={quote.id}
                className={`quote-list-item ${selected?.id === quote.id ? 'active' : ''}`}
                onClick={() => void selectQuote(quote.id)}
              >
                <b>{quote.quoteNumber}</b>
                <span>{quote.customer.displayName}</span>
                <span>
                  {quote.status} · {vnd(quote.grandTotalVnd)}
                </span>
              </button>
            ))
          )}
        </aside>
        <div className="quotes-editor">
          {error && (
            <div className="error-message" role="alert">
              {error}
            </div>
          )}
          {message && (
            <div className="success-message" role="status">
              {message}
            </div>
          )}
          {loading ? (
            <div className="loading">Đang chuẩn bị báo giá…</div>
          ) : customers.length === 0 || variants.length === 0 ? (
            <div className="empty-state">
              Cần có khách hàng và SKU đang bán trước khi lập báo giá.
            </div>
          ) : (
            <form className="quote-card" onSubmit={saveQuote}>
              <div className="section-heading">
                <div>
                  <p className="eyebrow">{selected?.quoteNumber ?? 'BẢN NHÁP MỚI'}</p>
                  <h2>
                    {selected
                      ? selected.status === 'DRAFT'
                        ? 'Sửa báo giá nháp'
                        : 'Bản đã phát hành'
                      : 'Thông tin báo giá'}
                  </h2>
                </div>
                {selected && <span className="status-pill">{selected.status}</span>}
              </div>
              <label>
                Khách hàng
                <select
                  value={customerId}
                  onChange={(event) => setCustomerId(event.target.value)}
                  disabled={!!selected && selected.status !== 'DRAFT'}
                >
                  {customers.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.displayName} · {customer.customerCode}
                    </option>
                  ))}
                </select>
              </label>
              <div className="quote-lines-heading">
                <h3>Sản phẩm</h3>
                {!selected || selected.status === 'DRAFT' ? (
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => setLines((current) => [...current, emptyLine()])}
                  >
                    + Thêm dòng
                  </button>
                ) : null}
              </div>
              {lines.map((line, index) => (
                <div className="quote-line-editor" key={`${selected?.id ?? 'new'}-${index}`}>
                  <label>
                    Sản phẩm / SKU
                    <select
                      value={line.variantId}
                      onChange={(event) => updateLine(index, { variantId: event.target.value })}
                      disabled={!!selected && selected.status !== 'DRAFT'}
                      required
                    >
                      <option value="">Chọn SKU</option>
                      {variants.map((variant) => (
                        <option key={variant.id} value={variant.id}>
                          {variant.productName} · {variant.sku} ({variant.sellingUnitName})
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Số lượng
                    <input
                      value={line.quantity}
                      onChange={(event) => updateLine(index, { quantity: event.target.value })}
                      inputMode="decimal"
                      disabled={!!selected && selected.status !== 'DRAFT'}
                      required
                    />
                  </label>
                  {canManagePrice && (
                    <>
                      <label>
                        Giảm dòng
                        <select
                          value={line.discountMode}
                          onChange={(event) =>
                            updateLine(index, {
                              discountMode: event.target.value as QuoteLineDraft['discountMode'],
                            })
                          }
                          disabled={!!selected && selected.status !== 'DRAFT'}
                        >
                          <option value="">Không giảm</option>
                          <option value="PERCENTAGE">Phần trăm</option>
                          <option value="FIXED_VND">VND</option>
                        </select>
                      </label>
                      <label>
                        Mức giảm
                        <input
                          value={line.discountValue}
                          onChange={(event) =>
                            updateLine(index, { discountValue: event.target.value })
                          }
                          disabled={
                            !line.discountMode || (!!selected && selected.status !== 'DRAFT')
                          }
                          inputMode="decimal"
                        />
                      </label>
                    </>
                  )}
                  {!selected || selected.status === 'DRAFT' ? (
                    <button
                      type="button"
                      className="remove-line"
                      aria-label="Xóa dòng"
                      onClick={() =>
                        setLines((current) =>
                          current.length > 1
                            ? current.filter((_, lineIndex) => lineIndex !== index)
                            : [emptyLine()],
                        )
                      }
                    >
                      ×
                    </button>
                  ) : null}
                  {selected && (
                    <p className="quote-line-snapshot">
                      {selected.lines[index]
                        ? `${selected.lines[index].skuSnapshot} · ${selected.lines[index].quantity} ${selected.lines[index].unitNameSnapshot} × ${vnd(selected.lines[index].unitPriceVnd)} = ${vnd(selected.lines[index].lineTotalVnd)}`
                        : ''}
                    </p>
                  )}
                </div>
              ))}
              <div className="quote-charges">
                {canManagePrice && (
                  <div className="form-pair">
                    <label>
                      Giảm toàn báo giá
                      <select
                        value={orderDiscountMode}
                        onChange={(event) =>
                          setOrderDiscountMode(event.target.value as typeof orderDiscountMode)
                        }
                        disabled={!!selected && selected.status !== 'DRAFT'}
                      >
                        <option value="">Không giảm</option>
                        <option value="PERCENTAGE">Phần trăm</option>
                        <option value="FIXED_VND">VND</option>
                      </select>
                    </label>
                    <label>
                      Mức giảm
                      <input
                        value={orderDiscountValue}
                        onChange={(event) => setOrderDiscountValue(event.target.value)}
                        disabled={!orderDiscountMode || (!!selected && selected.status !== 'DRAFT')}
                        inputMode="decimal"
                      />
                    </label>
                  </div>
                )}
                <div className="form-pair">
                  <label>
                    Phí giao (VND)
                    <input
                      value={shippingFeeVnd}
                      onChange={(event) => setShippingFeeVnd(event.target.value)}
                      disabled={!!selected && selected.status !== 'DRAFT'}
                      inputMode="numeric"
                    />
                  </label>
                  <label>
                    Đặt cọc dự kiến (VND)
                    <input
                      value={depositVnd}
                      onChange={(event) => setDepositVnd(event.target.value)}
                      disabled={!!selected && selected.status !== 'DRAFT'}
                      inputMode="numeric"
                    />
                  </label>
                </div>
                {canManagePrice && (
                  <div className="form-pair">
                    <label>
                      Thuế
                      <select
                        value={taxMode}
                        onChange={(event) => setTaxMode(event.target.value as typeof taxMode)}
                        disabled={!!selected && selected.status !== 'DRAFT'}
                      >
                        <option value="">Không thuế</option>
                        <option value="PERCENTAGE">Phần trăm</option>
                        <option value="FIXED_VND">Số tiền VND</option>
                      </select>
                    </label>
                    <label>
                      Mức thuế
                      <input
                        value={taxValue}
                        onChange={(event) => setTaxValue(event.target.value)}
                        disabled={!taxMode || (!!selected && selected.status !== 'DRAFT')}
                        inputMode="decimal"
                      />
                    </label>
                  </div>
                )}
                {taxMode === 'PERCENTAGE' && (
                  <p className="muted">
                    Tạm tính thuế trên tiền hàng sau giảm cộng phí giao; tiền cọc không tính vào cơ
                    sở thuế.
                  </p>
                )}
                <label>
                  Ghi chú thanh toán
                  <textarea
                    value={paymentNote}
                    onChange={(event) => setPaymentNote(event.target.value)}
                    disabled={!!selected && selected.status !== 'DRAFT'}
                    rows={2}
                  />
                </label>
              </div>
              {selected && (
                <div className="quote-totals">
                  <span>Tạm tính: {vnd(selected.lineSubtotalVnd)}</span>
                  <span>
                    Giảm giá:{' '}
                    {vnd(
                      (
                        BigInt(selected.lineDiscountVnd) + BigInt(selected.orderDiscountVnd)
                      ).toString(),
                    )}
                  </span>
                  <b>Tổng: {vnd(selected.grandTotalVnd)}</b>
                </div>
              )}
              {canWrite && (!selected || selected.status === 'DRAFT') && (
                <button className="primary" disabled={saving}>
                  {saving ? 'Đang lưu…' : selected ? 'Lưu bản nháp' : 'Tạo báo giá nháp'}
                </button>
              )}
              {canSend && selected?.status === 'DRAFT' && (
                <div className="send-quote-box">
                  <label>
                    Thời điểm khách nhận báo giá
                    <input
                      type="datetime-local"
                      value={receivedAt}
                      onChange={(event) => setReceivedAt(event.target.value)}
                    />
                  </label>
                  <button
                    type="button"
                    className="secondary"
                    disabled={saving}
                    onClick={() => void sendQuote()}
                  >
                    {saving ? 'Đang phát hành…' : 'Ghi nhận đã gửi'}
                  </button>
                </div>
              )}
              {selected?.status === 'SENT' && selected.expiresAt && (
                <div className="notice">
                  Khách nhận: {new Date(selected.receivedAt ?? '').toLocaleString('vi-VN')} · Hết
                  hạn: {new Date(selected.expiresAt).toLocaleString('vi-VN')}
                </div>
              )}
            </form>
          )}
        </div>
      </div>
      {printed && (
        <section className="quote-print-sheet print-only">
          <p className="eyebrow">SƠN CRM · BÁO GIÁ</p>
          <h1>{printed.quoteNumber}</h1>
          <p>
            Kính gửi: <b>{printed.customer.displayName}</b>
          </p>
          <p>Mã khách: {printed.customer.customerCode}</p>
          <table>
            <thead>
              <tr>
                <th>Sản phẩm</th>
                <th>SKU</th>
                <th>Số lượng</th>
                <th>Đơn giá</th>
                <th>Giảm</th>
                <th>Thành tiền</th>
              </tr>
            </thead>
            <tbody>
              {printed.lines.map((line, index) => (
                <tr key={`${line.variantId}-${index}`}>
                  <td>
                    {line.productNameSnapshot} · {line.variantNameSnapshot}
                  </td>
                  <td>{line.skuSnapshot}</td>
                  <td>
                    {line.quantity} {line.unitNameSnapshot}
                  </td>
                  <td>{vnd(line.unitPriceVnd)}</td>
                  <td>{vnd(line.discountVnd)}</td>
                  <td>{vnd(line.lineTotalVnd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p>Tạm tính: {vnd(printed.lineSubtotalVnd)}</p>
          <p>
            Giảm dòng: {vnd(printed.lineDiscountVnd)} · Giảm báo giá:{' '}
            {vnd(printed.orderDiscountVnd)}
          </p>
          <p>
            Phí giao: {vnd(printed.shippingFeeVnd)} · Thuế ({modeLabel(printed.taxMode)}):{' '}
            {vnd(printed.taxVnd)}
          </p>
          <h2>Tổng thanh toán: {vnd(printed.grandTotalVnd)}</h2>
          <p>Đặt cọc dự kiến: {vnd(printed.depositVnd)}</p>
          {printed.paymentNote && <p>Ghi chú thanh toán: {printed.paymentNote}</p>}
          <p>
            Báo giá nhận ngày{' '}
            {new Date(printed.receivedAt ?? '').toLocaleString('vi-VN', {
              timeZone: 'Asia/Ho_Chi_Minh',
            })}{' '}
            và hết hạn{' '}
            {new Date(printed.expiresAt ?? '').toLocaleString('vi-VN', {
              timeZone: 'Asia/Ho_Chi_Minh',
            })}
            .
          </p>
          <button className="no-print primary" onClick={() => window.print()}>
            In / Lưu PDF
          </button>
        </section>
      )}
    </section>
  );
}
