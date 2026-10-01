'use client';

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, type Staff } from './api-client';

type Warehouse = { id: string; code: string; name: string };
type PurchaseOrderLine = {
  id: string;
  skuSnapshot: string;
  variantNameSnapshot: string;
  unitNameSnapshot: string;
  orderedQuantity: string;
  receivedQuantity: string;
  remainingQuantity: string;
};
type PurchaseOrder = {
  id: string;
  orderNumber: string;
  status: 'ORDERED' | 'PARTIALLY_RECEIVED';
  supplier: { name: string };
  lines: PurchaseOrderLine[];
};
type StockBalance = {
  id: string;
  onHandQuantity: string;
  reservedQuantity: string;
  unavailableQuantity: string;
  availableQuantity: string;
  averageCostVnd?: string;
  warehouse: Warehouse;
  variant: {
    id: string;
    sku: string;
    name: string;
    baseUnitName: string;
    product: { name: string };
  };
};
type GoodsReceipt = {
  id: string;
  receiptNumber: string;
  receivedAt: string;
  warehouse: Warehouse;
  purchaseOrder: { orderNumber: string; supplier: { name: string } };
  lines: Array<{ id: string; skuSnapshot: string; receivedQuantity: string }>;
};
type StockMovement = {
  id: string;
  type: 'PURCHASE_RECEIPT';
  quantityDelta: string;
  valueDeltaVnd?: string;
  onHandAfter: string;
  occurredAt: string;
  warehouse: Warehouse;
  variant: { sku: string; name: string; baseUnitName: string };
  goodsReceiptLine: {
    goodsReceipt: { receiptNumber: string; purchaseOrder: { orderNumber: string } };
  };
};

function field(form: FormData, name: string) {
  return String(form.get(name) ?? '').trim();
}

function formatVnd(value: string) {
  const [whole, fraction = ''] = value.split('.');
  const tail = fraction.replace(/0+$/, '');
  return `${BigInt(whole).toLocaleString('vi-VN')}${tail ? `,${tail}` : ''} ₫`;
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
}

function isZeroQuantity(value: string) {
  return /^0+(?:\.0+)?$/.test(value);
}

export function InventoryWorkspace({
  staff,
  onLogout,
  loggingOut,
}: {
  staff: Staff;
  onLogout: () => void;
  loggingOut: boolean;
}) {
  const canReceive = staff.permissions.includes('inventory.receive');
  const canViewCost = staff.permissions.includes('cost.view');
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [balances, setBalances] = useState<StockBalance[]>([]);
  const [receipts, setReceipts] = useState<GoodsReceipt[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState('');
  const [showReceiptForm, setShowReceiptForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const pendingCommand = useRef<{ signature: string; key: string } | null>(null);

  const selectedOrder = useMemo(
    () => orders.find(({ id }) => id === selectedOrderId) ?? orders[0] ?? null,
    [orders, selectedOrderId],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [warehouseRows, orderedRows, partialRows, balanceRows, receiptRows, movementRows] =
        await Promise.all([
          api<Warehouse[]>('/warehouses'),
          api<PurchaseOrder[]>('/purchase-orders?status=ORDERED&limit=50'),
          api<PurchaseOrder[]>('/purchase-orders?status=PARTIALLY_RECEIVED&limit=50'),
          api<StockBalance[]>('/stock-balances?limit=100'),
          api<GoodsReceipt[]>('/goods-receipts?limit=20'),
          api<StockMovement[]>('/stock-movements?limit=30'),
        ]);
      const receivable = [...partialRows, ...orderedRows];
      setWarehouses(warehouseRows);
      setOrders(receivable);
      setBalances(balanceRows);
      setReceipts(receiptRows);
      setMovements(movementRows);
      setSelectedOrderId((current) =>
        receivable.some(({ id }) => id === current) ? current : (receivable[0]?.id ?? ''),
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không tải được dữ liệu kho.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function createReceipt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');
    const form = new FormData(event.currentTarget);
    const body = {
      purchaseOrderId: field(form, 'purchaseOrderId'),
      warehouseId: field(form, 'warehouseId'),
      notes: field(form, 'notes') || undefined,
      lines: [
        {
          purchaseOrderLineId: field(form, 'purchaseOrderLineId'),
          receivedQuantity: field(form, 'receivedQuantity'),
          actualUnitCostVnd: field(form, 'actualUnitCostVnd'),
        },
      ],
    };
    const signature = JSON.stringify(body);
    const key =
      pendingCommand.current?.signature === signature
        ? pendingCommand.current.key
        : `web-receipt-${crypto.randomUUID()}`;
    pendingCommand.current = { signature, key };
    try {
      const receipt = await api<GoodsReceipt>('/goods-receipts', {
        method: 'POST',
        headers: { 'Idempotency-Key': key },
        body: signature,
      });
      pendingCommand.current = null;
      event.currentTarget.reset();
      setShowReceiptForm(false);
      setMessage(`Đã ghi sổ phiếu ${receipt.receiptNumber}; tồn kho đã được cập nhật.`);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không thể ghi nhận phiếu nhập kho.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="dashboard-content inventory-workspace">
      <header>
        <div>
          <p className="eyebrow">KHO HÀNG</p>
          <h1>Tồn kho & nhận hàng</h1>
          <p className="muted">Số liệu lấy từ phiếu nhận và sổ kho bất biến theo đơn vị gốc.</p>
        </div>
        <div className="header-actions">
          {canReceive && (
            <button
              className="primary"
              onClick={() => setShowReceiptForm((value) => !value)}
              disabled={orders.length === 0}
            >
              + Nhận hàng
            </button>
          )}
          <button className="ghost" onClick={() => void load()} disabled={loading}>
            Làm mới
          </button>
          <button className="ghost" onClick={onLogout} disabled={loggingOut}>
            Đăng xuất
          </button>
        </div>
      </header>

      {message && <div className="success-message">{message}</div>}
      {error && (
        <div className="error-message" role="alert">
          {error}
        </div>
      )}

      {showReceiptForm && selectedOrder && (
        <form className="detail-card inventory-receipt-form" onSubmit={createReceipt}>
          <label>
            Đơn mua còn phải nhận
            <select
              name="purchaseOrderId"
              required
              value={selectedOrder.id}
              onChange={(event) => setSelectedOrderId(event.target.value)}
            >
              {orders.map((order) => (
                <option key={order.id} value={order.id}>
                  {order.orderNumber} · {order.supplier.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Kho nhận
            <select name="warehouseId" required defaultValue={warehouses[0]?.id}>
              {warehouses.map((warehouse) => (
                <option key={warehouse.id} value={warehouse.id}>
                  {warehouse.name} · {warehouse.code}
                </option>
              ))}
            </select>
          </label>
          <label>
            Dòng hàng
            <select name="purchaseOrderLineId" required defaultValue="">
              <option value="" disabled>
                Chọn SKU
              </option>
              {selectedOrder.lines
                .filter((line) => !isZeroQuantity(line.remainingQuantity))
                .map((line) => (
                  <option key={line.id} value={line.id}>
                    {line.skuSnapshot} · còn {line.remainingQuantity} {line.unitNameSnapshot}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Số lượng thực nhận
            <input
              name="receivedQuantity"
              inputMode="decimal"
              pattern="[0-9]+([.][0-9]{1,6})?"
              required
            />
          </label>
          <label>
            Giá thực tế / đơn vị (VND){canViewCost ? '' : ' · không hiển thị lại'}
            <input name="actualUnitCostVnd" inputMode="numeric" pattern="[0-9]+" required />
          </label>
          <label>
            Ghi chú
            <input name="notes" maxLength={2000} />
          </label>
          <button className="primary" disabled={saving || warehouses.length === 0}>
            {saving ? 'Đang ghi sổ…' : 'Xác nhận nhận hàng'}
          </button>
          <small className="form-warning">
            Thao tác này tăng tồn và không thể sửa trực tiếp; gửi lại cùng nội dung sẽ không nhập
            trùng.
          </small>
        </form>
      )}

      <section className="inventory-kpis">
        <article>
          <span>SKU đang có tồn</span>
          <strong>{balances.filter((item) => !isZeroQuantity(item.onHandQuantity)).length}</strong>
        </article>
        <article>
          <span>Đơn mua chờ nhận</span>
          <strong>{orders.length}</strong>
        </article>
        <article>
          <span>Phiếu nhận gần đây</span>
          <strong>{receipts.length}</strong>
        </article>
        <article>
          <span>Kho hoạt động</span>
          <strong>{warehouses.length}</strong>
        </article>
      </section>

      <section className="overview-card inventory-table">
        <div className="overview-card-head">
          <div>
            <p className="eyebrow">TỒN HIỆN TẠI</p>
            <h2>Theo SKU và kho</h2>
          </div>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>SKU / sản phẩm</th>
                <th>Kho</th>
                <th>Thực tế</th>
                <th>Giữ</th>
                <th>Có thể bán</th>
                {canViewCost && <th>Giá vốn bình quân</th>}
              </tr>
            </thead>
            <tbody>
              {balances.map((balance) => (
                <tr key={balance.id}>
                  <td>
                    <b>{balance.variant.sku}</b>
                    <small>
                      {balance.variant.product.name} · {balance.variant.name}
                    </small>
                  </td>
                  <td>{balance.warehouse.name}</td>
                  <td>
                    {balance.onHandQuantity} {balance.variant.baseUnitName}
                  </td>
                  <td>{balance.reservedQuantity}</td>
                  <td>
                    <strong>{balance.availableQuantity}</strong>
                  </td>
                  {canViewCost && <td>{formatVnd(balance.averageCostVnd ?? '0')}</td>}
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && balances.length === 0 && (
            <p className="empty-copy">Chưa có tồn. Hãy phát hành đơn mua và tạo phiếu nhận.</p>
          )}
        </div>
      </section>

      <div className="inventory-history-grid">
        <section className="overview-card">
          <p className="eyebrow">CHỨNG TỪ</p>
          <h2>Phiếu nhận gần đây</h2>
          <div className="history-list">
            {receipts.map((receipt) => (
              <article key={receipt.id}>
                <div>
                  <b>{receipt.receiptNumber}</b>
                  <small>
                    {receipt.purchaseOrder.orderNumber} · {receipt.purchaseOrder.supplier.name}
                  </small>
                </div>
                <span>{formatTime(receipt.receivedAt)}</span>
              </article>
            ))}
            {!loading && receipts.length === 0 && <p className="empty-copy">Chưa có phiếu nhận.</p>}
          </div>
        </section>
        <section className="overview-card">
          <p className="eyebrow">SỔ KHO</p>
          <h2>Biến động mới nhất</h2>
          <div className="history-list">
            {movements.map((movement) => (
              <article key={movement.id}>
                <div>
                  <b>{movement.variant.sku}</b>
                  <small>
                    {movement.goodsReceiptLine.goodsReceipt.receiptNumber} · tồn sau{' '}
                    {movement.onHandAfter}
                  </small>
                </div>
                <strong className="quantity-in">
                  +{movement.quantityDelta} {movement.variant.baseUnitName}
                </strong>
              </article>
            ))}
            {!loading && movements.length === 0 && <p className="empty-copy">Chưa có biến động.</p>}
          </div>
        </section>
      </div>
    </section>
  );
}
