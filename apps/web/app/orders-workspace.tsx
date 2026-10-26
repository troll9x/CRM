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
  status: 'DRAFT' | 'CONFIRMED' | 'CANCELED';
  version: number;
  sourceRevision: number;
  grandTotalVnd: string;
  paidVnd: string;
  cashPaidVnd: string;
  creditAppliedVnd: string;
  remainingVnd: string;
  shippingFeeVnd: string;
  taxVnd: string;
  depositVnd: string;
  paymentNote: string | null;
  createdAt: string;
  updatedAt: string;
  customer: { id: string; customerCode: string; displayName: string };
  createdBy: { id: string; displayName: string };
  sourceQuote: {
    id: string;
    quoteNumber: string;
    sourceConversationId: string | null;
    sourceMessageId: string | null;
    sourceTicketId: string | null;
  } | null;
  shipment: {
    id: string;
    shipmentCode: string;
    status: 'IN_TRANSIT' | 'DELIVERED';
    version: number;
    shippedAt: string;
    deliveredAt: string | null;
    recognizedRevenueVnd: string;
  } | null;
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
type PaymentSuggestion = {
  id: string;
  orderNumber: string;
  createdAt: string;
  totalVnd: string;
  allocatedVnd: string;
  remainingVnd: string;
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
  const [canceling, setCanceling] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [shipping, setShipping] = useState(false);
  const [delivering, setDelivering] = useState(false);
  const [recordingPayment, setRecordingPayment] = useState(false);
  const [applyingCredit, setApplyingCredit] = useState(false);
  const [customerCreditBalance, setCustomerCreditBalance] = useState('0');
  const [creditDraft, setCreditDraft] = useState<{ orderId: string; amount: string } | null>(null);
  const [paymentDraft, setPaymentDraft] = useState<{
    orderId: string;
    amount: string;
    allocation: string;
  } | null>(null);
  const [paymentNote, setPaymentNote] = useState('');
  const [paymentSuggestions, setPaymentSuggestions] = useState<PaymentSuggestion[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const canCreate = staff.permissions.includes('orders.create');
  const canCancel = staff.permissions.includes('orders.cancel');
  const canConfirm = staff.permissions.includes('orders.confirm');
  const canShip = staff.permissions.includes('shipments.create');
  const canDeliver = staff.permissions.includes('shipments.deliver');
  const canReceivePayment = staff.permissions.includes('payments.manage');
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

  const selectedCustomerId = selected?.customer.id;
  const paymentAmount =
    paymentDraft && paymentDraft.orderId === selected?.id
      ? paymentDraft.amount
      : (selected?.remainingVnd ?? '');
  const paymentAllocation =
    paymentDraft && paymentDraft.orderId === selected?.id
      ? paymentDraft.allocation
      : (selected?.remainingVnd ?? '');
  const creditApplicationAmount =
    creditDraft && creditDraft.orderId === selected?.id
      ? creditDraft.amount
      : (() => {
          try {
            const remaining = BigInt(selected?.remainingVnd ?? '0');
            const balance = BigInt(customerCreditBalance);
            return (remaining < balance ? remaining : balance).toString();
          } catch {
            return '0';
          }
        })();

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
    if (!canReceivePayment || !selectedCustomerId) return;
    let active = true;
    api<{ items: PaymentSuggestion[] }>(
      `/payments/suggestions?customerId=${encodeURIComponent(selectedCustomerId)}`,
    )
      .then((result) => {
        if (active) setPaymentSuggestions(result.items);
      })
      .catch(() => {
        if (active) setPaymentSuggestions([]);
      });
    return () => {
      active = false;
    };
  }, [canReceivePayment, selectedCustomerId]);

  useEffect(() => {
    if (!canReceivePayment || !selectedCustomerId) return;
    let active = true;
    api<{ balanceVnd: string }>(`/customer-credit/${encodeURIComponent(selectedCustomerId)}`)
      .then((result) => {
        if (active) setCustomerCreditBalance(result.balanceVnd);
      })
      .catch(() => {
        if (active) setCustomerCreditBalance('0');
      });
    return () => {
      active = false;
    };
  }, [canReceivePayment, selectedCustomerId]);

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
      setMessage('Đã tạo đơn nháp. Giá được phân giải từ bảng giá; đơn nhập tay chưa giữ kho.');
      setShowCreate(false);
      setDraftLines([{ variantId: variants[0]?.id ?? '', quantity: '1' }]);
      await load(query);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không tạo được đơn nháp.');
    } finally {
      setCreating(false);
    }
  }

  async function cancelDraft(order: Order) {
    if (!window.confirm(`Hủy ${order.orderNumber} và giải phóng lượng hàng đang giữ?`)) return;
    setCanceling(true);
    setError('');
    setMessage('');
    try {
      await api<Order>(`/orders/${order.id}/cancel`, {
        method: 'POST',
        headers: { 'Idempotency-Key': crypto.randomUUID() },
        body: JSON.stringify({ expectedVersion: order.version }),
      });
      const credit = await api<{ balanceVnd: string }>(
        `/customer-credit/${encodeURIComponent(order.customer.id)}`,
      );
      setCustomerCreditBalance(credit.balanceVnd);
      setMessage(`Đã hủy ${order.orderNumber}; lượng hàng đang giữ (nếu có) đã được giải phóng.`);
      await load(query);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không hủy được đơn.');
    } finally {
      setCanceling(false);
    }
  }

  async function receivePayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    setRecordingPayment(true);
    setError('');
    setMessage('');
    try {
      const receipt = await api<{ unallocatedVnd: string; customerCreditBalanceVnd: string }>(
        '/payments',
        {
          method: 'POST',
          headers: { 'Idempotency-Key': crypto.randomUUID() },
          body: JSON.stringify({
            customerId: selected.customer.id,
            amountVnd: paymentAmount,
            allocations: [{ orderId: selected.id, amountVnd: paymentAllocation }],
            note: paymentNote.trim() || undefined,
          }),
        },
      );
      setCustomerCreditBalance(receipt.customerCreditBalanceVnd);
      setMessage(
        `Đã ghi nhận khoản thu; ${money(receipt.unallocatedVnd)} chưa phân bổ được cộng vào số dư khách hàng.`,
      );
      setPaymentNote('');
      await load(query);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không ghi nhận được khoản thu.');
    } finally {
      setRecordingPayment(false);
    }
  }

  async function applyCustomerCredit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    setApplyingCredit(true);
    setError('');
    setMessage('');
    try {
      const result = await api<{
        customerCreditBalanceVnd: string;
        application: { amountVnd: string };
      }>(`/customer-credit/${encodeURIComponent(selected.customer.id)}/applications`, {
        method: 'POST',
        headers: { 'Idempotency-Key': crypto.randomUUID() },
        body: JSON.stringify({
          orderId: selected.id,
          amountVnd: creditApplicationAmount,
          expectedVersion: selected.version,
        }),
      });
      setCustomerCreditBalance(result.customerCreditBalanceVnd);
      setCreditDraft(null);
      setMessage(
        `Đã dùng ${money(result.application.amountVnd)} số dư khách cho đơn ${selected.orderNumber}.`,
      );
      await load(query);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không sử dụng được số dư khách hàng.');
    } finally {
      setApplyingCredit(false);
    }
  }

  async function confirmOrder(order: Order) {
    setConfirming(true);
    setError('');
    setMessage('');
    try {
      await api<Order>(`/orders/${order.id}/confirm`, {
        method: 'POST',
        headers: { 'Idempotency-Key': crypto.randomUUID() },
        body: JSON.stringify({ expectedVersion: order.version }),
      });
      setMessage(
        `Đã xác nhận ${order.orderNumber}; phải thu đã ghi nhận và đối trừ đủ tiền đã thu.`,
      );
      await load(query);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không xác nhận được đơn.');
    } finally {
      setConfirming(false);
    }
  }

  async function shipOrder(order: Order) {
    setShipping(true);
    setError('');
    setMessage('');
    try {
      const shipment = await api<{ shipmentCode: string }>('/shipments', {
        method: 'POST',
        headers: { 'Idempotency-Key': crypto.randomUUID() },
        body: JSON.stringify({ orderId: order.id, expectedVersion: order.version }),
      });
      setMessage(`Đã xuất đủ hàng theo phiếu ${shipment.shipmentCode}.`);
      await load(query);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không xuất giao được đơn.');
    } finally {
      setShipping(false);
    }
  }

  async function markDelivered(order: Order) {
    if (!order.shipment) return;
    setDelivering(true);
    setError('');
    setMessage('');
    try {
      const shipment = await api<{ recognizedRevenueVnd: string }>(
        `/shipments/${order.shipment.id}/deliver`,
        {
          method: 'POST',
          headers: { 'Idempotency-Key': crypto.randomUUID() },
          body: JSON.stringify({ expectedVersion: order.shipment.version }),
        },
      );
      setMessage(
        `Đã ghi nhận giao đủ; doanh thu hàng hóa ${money(shipment.recognizedRevenueVnd)}.`,
      );
      await load(query);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Không ghi nhận được trạng thái đã giao.',
      );
    } finally {
      setDelivering(false);
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
        <b>Thu đủ trước khi xác nhận đơn.</b>
        <span>
          Báo giá được giữ hàng khi khách chấp nhận; đơn nhập tay kiểm tra và giữ hàng lúc xác nhận.
          Chỉ giao đủ một lần; COD đang chờ chốt quy tắc đối soát.
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
                  <i>
                    {order.status === 'CANCELED'
                      ? 'Đã hủy'
                      : order.status === 'CONFIRMED'
                        ? 'Đã xác nhận'
                        : 'Nháp'}{' '}
                    · {money(order.grandTotalVnd)}
                  </i>
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
                  {selected.sourceQuote?.sourceConversationId && (
                    <p className="muted">
                      Hội thoại nguồn: {selected.sourceQuote.sourceConversationId}
                      {selected.sourceQuote.sourceMessageId ? ` · Tin ${selected.sourceQuote.sourceMessageId}` : ''}
                      {selected.sourceQuote.sourceTicketId ? ` · Phiếu ${selected.sourceQuote.sourceTicketId}` : ''}
                    </p>
                  )}
                </div>
                <span className={`status-pill${selected.status === 'CANCELED' ? ' canceled' : ''}`}>
                  {selected.status === 'CANCELED'
                    ? 'Đã hủy'
                    : selected.status === 'CONFIRMED'
                      ? 'Đã xác nhận'
                      : 'Đơn nháp'}
                </span>
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
                <div>
                  <span>Tiền thực nhận đã phân bổ</span>
                  <b>{money(selected.cashPaidVnd)}</b>
                </div>
                <div>
                  <span>Số dư khách đã sử dụng</span>
                  <b>{money(selected.creditAppliedVnd)}</b>
                </div>
                <div>
                  <span>Tổng đã thanh toán/đối trừ</span>
                  <b>{money(selected.paidVnd)}</b>
                </div>
                <div>
                  <span>Còn phải thu trước xác nhận</span>
                  <b>{money(selected.remainingVnd)}</b>
                </div>
              </div>
              {canReceivePayment && selected.status === 'DRAFT' && (
                <section className="payment-receipt-panel">
                  <h3>Ghi nhận tiền thực nhận</h3>
                  {paymentSuggestions.length > 0 && (
                    <div className="notice" role="status">
                      Gợi ý khoản cần thu cũ nhất: <b>{paymentSuggestions[0]?.orderNumber}</b> · còn{' '}
                      {money(paymentSuggestions[0]?.remainingVnd ?? '0')}
                      {paymentSuggestions[0]?.id !== selected.id && (
                        <button
                          className="ghost"
                          type="button"
                          onClick={() => setSelectedId(paymentSuggestions[0]!.id)}
                        >
                          Mở đơn được gợi ý
                        </button>
                      )}
                    </div>
                  )}
                  <form className="order-create-form" onSubmit={receivePayment}>
                    <label>
                      Số tiền thực nhận (VND)
                      <input
                        inputMode="numeric"
                        pattern="[0-9]+"
                        value={paymentAmount}
                        onChange={(event) =>
                          setPaymentDraft({
                            orderId: selected.id,
                            amount: event.target.value,
                            allocation: paymentAllocation,
                          })
                        }
                        required
                      />
                    </label>
                    <label>
                      Phân bổ cho đơn này (VND)
                      <input
                        inputMode="numeric"
                        pattern="[0-9]+"
                        value={paymentAllocation}
                        onChange={(event) =>
                          setPaymentDraft({
                            orderId: selected.id,
                            amount: paymentAmount,
                            allocation: event.target.value,
                          })
                        }
                        required
                      />
                    </label>
                    <label>
                      Ghi chú / mã tham chiếu
                      <input
                        value={paymentNote}
                        onChange={(event) => setPaymentNote(event.target.value)}
                        maxLength={500}
                      />
                    </label>
                    <p className="section-help">
                      Có thể thu nhiều lần. Phần nhận vượt mức phân bổ sẽ vào số dư khách hàng; hệ
                      thống không tự chọn đơn để phân bổ.
                    </p>
                    <button
                      type="submit"
                      disabled={recordingPayment || selected.remainingVnd === '0'}
                    >
                      {recordingPayment ? 'Đang ghi nhận…' : 'Ghi nhận khoản thu'}
                    </button>
                  </form>
                  <form className="order-create-form" onSubmit={applyCustomerCredit}>
                    <h4>Sử dụng số dư khách hàng</h4>
                    <p>
                      Số dư có thể dùng: <b>{money(customerCreditBalance)}</b>
                    </p>
                    <label>
                      Số tiền sử dụng (VND)
                      <input
                        inputMode="numeric"
                        pattern="[0-9]+"
                        value={creditApplicationAmount}
                        onChange={(event) =>
                          setCreditDraft({ orderId: selected.id, amount: event.target.value })
                        }
                        required
                      />
                    </label>
                    <p className="section-help">
                      Số dư được trừ khỏi khách và ghi sổ riêng; không được vượt số dư hiện có hoặc
                      phần còn thiếu của đơn.
                    </p>
                    <button
                      type="submit"
                      className="ghost"
                      disabled={
                        applyingCredit ||
                        selected.remainingVnd === '0' ||
                        customerCreditBalance === '0' ||
                        creditApplicationAmount === '' ||
                        creditApplicationAmount === '0'
                      }
                    >
                      {applyingCredit ? 'Đang phân bổ…' : 'Dùng số dư cho đơn này'}
                    </button>
                  </form>
                </section>
              )}
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
              {selected.status === 'CONFIRMED' && !selected.shipment && canShip && (
                <button type="button" disabled={shipping} onClick={() => void shipOrder(selected)}>
                  {shipping ? 'Đang xuất hàng…' : 'Xuất giao đủ toàn bộ đơn'}
                </button>
              )}
              {selected.shipment && (
                <section className="payment-receipt-panel">
                  <h3>Giao hàng · {selected.shipment.shipmentCode}</h3>
                  <p className="section-help">
                    Trạng thái:{' '}
                    {selected.shipment.status === 'DELIVERED' ? 'Đã giao đủ' : 'Đang giao'} · Xuất
                    lúc {new Date(selected.shipment.shippedAt).toLocaleString('vi-VN')}
                  </p>
                  {selected.shipment.status === 'IN_TRANSIT' && canDeliver && (
                    <button
                      type="button"
                      disabled={delivering}
                      onClick={() => void markDelivered(selected)}
                    >
                      {delivering ? 'Đang cập nhật…' : 'Xác nhận đã giao đủ đơn'}
                    </button>
                  )}
                  {selected.shipment.status === 'DELIVERED' && (
                    <p>Doanh thu hàng hóa: {money(selected.shipment.recognizedRevenueVnd)}</p>
                  )}
                </section>
              )}
              {selected.status === 'DRAFT' && (
                <div className="header-actions">
                  {canConfirm && selected.remainingVnd === '0' && (
                    <button
                      type="button"
                      disabled={confirming}
                      onClick={() => void confirmOrder(selected)}
                    >
                      {confirming ? 'Đang xác nhận…' : 'Xác nhận đơn đã thu đủ'}
                    </button>
                  )}
                  {canCancel &&
                    (selected.cashPaidVnd === '0' ? (
                      <button
                        className="ghost"
                        type="button"
                        disabled={canceling}
                        onClick={() => void cancelDraft(selected)}
                      >
                        {canceling
                          ? 'Đang hủy…'
                          : selected.creditAppliedVnd !== '0'
                            ? 'Hủy đơn và hoàn số dư khách'
                            : 'Hủy đơn và nhả hàng giữ'}
                      </button>
                    ) : (
                      <p className="section-help">
                        Đơn đã nhận tiền; cần hoàn/đối trừ trước khi hủy.
                      </p>
                    ))}
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </section>
  );
}
