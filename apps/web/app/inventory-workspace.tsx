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
  version: number;
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
type OpeningStock = {
  id: string;
  documentNumber: string;
  skuSnapshot: string;
  unitNameSnapshot: string;
  quantity: string;
  unitCostVnd?: string;
  postedAt: string;
  warehouse: Warehouse;
};
type StockAdjustment = {
  id: string;
  documentNumber: string;
  skuSnapshot: string;
  unitNameSnapshot: string;
  systemQuantity: string;
  countedQuantity: string;
  quantityDelta: string;
  valueDeltaVnd?: string;
  reasonCode: string;
  postedAt: string;
  warehouse: Warehouse;
};
type CatalogProduct = {
  id: string;
  name: string;
  variants: Array<{
    id: string;
    sku: string;
    name: string;
    status: 'ACTIVE' | 'INACTIVE';
    baseUnitName: string;
  }>;
};
type StockMovement = {
  id: string;
  type: 'PURCHASE_RECEIPT' | 'OPENING_STOCK' | 'STOCK_ADJUSTMENT';
  quantityDelta: string;
  valueDeltaVnd?: string;
  onHandAfter: string;
  occurredAt: string;
  warehouse: Warehouse;
  variant: { sku: string; name: string; baseUnitName: string };
  goodsReceiptLine?: {
    goodsReceipt: { receiptNumber: string; purchaseOrder: { orderNumber: string } };
  } | null;
  openingStock?: { id: string; documentNumber: string } | null;
  stockAdjustment?: { id: string; documentNumber: string } | null;
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
  const canReadPurchasing = staff.permissions.includes('purchasing.read');
  const canReadCatalog = staff.permissions.includes('catalog.read');
  const canReceive = staff.permissions.includes('inventory.receive') && canReadPurchasing;
  const canAdjustStock = staff.permissions.includes('inventory.adjust');
  const canOpenStock = staff.permissions.includes('inventory.adjust') && canReadCatalog;
  const canViewCost = staff.permissions.includes('cost.view');
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [balances, setBalances] = useState<StockBalance[]>([]);
  const [receipts, setReceipts] = useState<GoodsReceipt[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [openings, setOpenings] = useState<OpeningStock[]>([]);
  const [adjustments, setAdjustments] = useState<StockAdjustment[]>([]);
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [productSearch, setProductSearch] = useState('');
  const [productNextCursor, setProductNextCursor] = useState<string | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState('');
  const [showReceiptForm, setShowReceiptForm] = useState(false);
  const [showOpeningForm, setShowOpeningForm] = useState(false);
  const [countingBalance, setCountingBalance] = useState<StockBalance | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const pendingCommand = useRef<{ signature: string; key: string } | null>(null);
  const pendingOpening = useRef<{ signature: string; key: string } | null>(null);
  const pendingAdjustment = useRef<{ signature: string; key: string } | null>(null);
  const loadSequence = useRef(0);

  const selectedOrder = useMemo(
    () => orders.find(({ id }) => id === selectedOrderId) ?? orders[0] ?? null,
    [orders, selectedOrderId],
  );
  const variants = useMemo(
    () =>
      products.flatMap((product) =>
        product.variants
          .filter((variant) => variant.status === 'ACTIVE')
          .map((variant) => ({ ...variant, productName: product.name })),
      ),
    [products],
  );

  const load = useCallback(async () => {
    const sequence = ++loadSequence.current;
    setLoading(true);
    setError('');
    try {
      const [
        warehouseRows,
        orderedRows,
        partialRows,
        balanceRows,
        receiptRows,
        movementRows,
        openingRows,
        adjustmentRows,
        productRows,
      ] = await Promise.all([
        api<Warehouse[]>('/warehouses'),
        canReadPurchasing
          ? api<PurchaseOrder[]>('/purchase-orders?status=ORDERED&limit=50')
          : Promise.resolve([]),
        canReadPurchasing
          ? api<PurchaseOrder[]>('/purchase-orders?status=PARTIALLY_RECEIVED&limit=50')
          : Promise.resolve([]),
        api<StockBalance[]>('/stock-balances?limit=100'),
        api<GoodsReceipt[]>('/goods-receipts?limit=20'),
        api<StockMovement[]>('/stock-movements?limit=30'),
        api<OpeningStock[]>('/stock-openings?limit=20'),
        api<StockAdjustment[]>('/stock-adjustments?limit=20'),
        canReadCatalog
          ? api<{ items: CatalogProduct[]; nextCursor: string | null }>(
              `/products?status=ACTIVE&limit=50&query=${encodeURIComponent(productSearch)}`,
            )
          : Promise.resolve({ items: [], nextCursor: null }),
      ]);
      if (sequence !== loadSequence.current) return;
      const receivable = [...partialRows, ...orderedRows];
      setWarehouses(warehouseRows);
      setOrders(receivable);
      setBalances(balanceRows);
      setReceipts(receiptRows);
      setMovements(movementRows);
      setOpenings(openingRows);
      setAdjustments(adjustmentRows);
      setProducts(productRows.items);
      setProductNextCursor(productRows.nextCursor);
      setSelectedOrderId((current) =>
        receivable.some(({ id }) => id === current) ? current : (receivable[0]?.id ?? ''),
      );
    } catch (caught) {
      if (sequence !== loadSequence.current) return;
      setError(caught instanceof Error ? caught.message : 'Không tải được dữ liệu kho.');
    } finally {
      if (sequence === loadSequence.current) setLoading(false);
    }
  }, [canReadCatalog, canReadPurchasing, productSearch]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 250);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function loadMoreProducts() {
    if (!productNextCursor) return;
    setError('');
    try {
      const page = await api<{ items: CatalogProduct[]; nextCursor: string | null }>(
        `/products?status=ACTIVE&limit=50&query=${encodeURIComponent(productSearch)}&cursor=${encodeURIComponent(productNextCursor)}`,
      );
      setProducts((current) => [...current, ...page.items]);
      setProductNextCursor(page.nextCursor);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không tải được thêm sản phẩm.');
    }
  }

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

  async function createOpening(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');
    const form = new FormData(event.currentTarget);
    const body = {
      warehouseId: field(form, 'warehouseId'),
      variantId: field(form, 'variantId'),
      quantity: field(form, 'quantity'),
      unitCostVnd: field(form, 'unitCostVnd'),
      notes: field(form, 'notes') || undefined,
    };
    const signature = JSON.stringify(body);
    const key =
      pendingOpening.current?.signature === signature
        ? pendingOpening.current.key
        : `web-opening-${crypto.randomUUID()}`;
    pendingOpening.current = { signature, key };
    try {
      const opening = await api<OpeningStock>('/stock-openings', {
        method: 'POST',
        headers: { 'Idempotency-Key': key },
        body: signature,
      });
      pendingOpening.current = null;
      event.currentTarget.reset();
      setShowOpeningForm(false);
      setMessage(`Đã ghi sổ tồn đầu ${opening.documentNumber}.`);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không thể ghi tồn đầu.');
    } finally {
      setSaving(false);
    }
  }

  async function createStockAdjustment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!countingBalance) return;
    setSaving(true);
    setError('');
    setMessage('');
    const form = new FormData(event.currentTarget);
    const body = {
      warehouseId: countingBalance.warehouse.id,
      variantId: countingBalance.variant.id,
      expectedVersion: countingBalance.version,
      countedQuantity: field(form, 'countedQuantity'),
      reasonCode: field(form, 'reasonCode'),
      notes: field(form, 'notes') || undefined,
    };
    const signature = JSON.stringify(body);
    const key =
      pendingAdjustment.current?.signature === signature
        ? pendingAdjustment.current.key
        : `web-adjust-${crypto.randomUUID()}`;
    pendingAdjustment.current = { signature, key };
    try {
      const adjustment = await api<StockAdjustment>('/stock-adjustments', {
        method: 'POST',
        headers: { 'Idempotency-Key': key },
        body: signature,
      });
      pendingAdjustment.current = null;
      event.currentTarget.reset();
      setCountingBalance(null);
      setMessage(
        isZeroQuantity(adjustment.quantityDelta)
          ? `Đã lưu biên bản ${adjustment.documentNumber}; số đếm khớp tồn hệ thống.`
          : `Đã ghi ${adjustment.documentNumber}; tồn kho đã được điều chỉnh theo số đếm.`,
      );
      await load();
    } catch (caught) {
      if (caught instanceof Error && caught.message.startsWith('Tồn kho')) {
        setCountingBalance(null);
        await load();
      }
      setError(caught instanceof Error ? caught.message : 'Không thể lưu kết quả kiểm kê.');
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
          {canOpenStock && (
            <button
              className="ghost"
              onClick={() => setShowOpeningForm((value) => !value)}
              disabled={variants.length === 0}
            >
              + Tồn đầu
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

      {showOpeningForm && (
        <form className="detail-card inventory-receipt-form" onSubmit={createOpening}>
          <label>
            Tìm sản phẩm hoặc SKU
            <input
              value={productSearch}
              onChange={(event) => setProductSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.preventDefault();
              }}
              maxLength={120}
              placeholder="Nhập tên sản phẩm hoặc mã SKU"
            />
          </label>
          <label>
            Kho
            <select name="warehouseId" required defaultValue={warehouses[0]?.id}>
              {warehouses.map((warehouse) => (
                <option key={warehouse.id} value={warehouse.id}>
                  {warehouse.name} · {warehouse.code}
                </option>
              ))}
            </select>
          </label>
          <label>
            SKU
            <select name="variantId" required defaultValue="">
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
          {productNextCursor && (
            <button type="button" className="ghost" onClick={() => void loadMoreProducts()}>
              Tải thêm sản phẩm
            </button>
          )}
          <label>
            Số lượng đơn vị gốc
            <input name="quantity" inputMode="decimal" pattern="[0-9]+([.][0-9]{1,6})?" required />
          </label>
          <label>
            Giá vốn / đơn vị gốc (VND)
            <input name="unitCostVnd" inputMode="numeric" pattern="[0-9]+" required />
          </label>
          <label>
            Ghi chú
            <input name="notes" maxLength={2000} />
          </label>
          <button className="primary" disabled={saving || warehouses.length === 0}>
            {saving ? 'Đang ghi sổ…' : 'Ghi tồn đầu'}
          </button>
          <small className="form-warning">
            Chỉ được ghi một lần cho mỗi SKU/kho trước khi có biến động. Cần đối chiếu số lượng và
            giá trị thực tế trước khi xác nhận.
          </small>
        </form>
      )}

      {countingBalance && (
        <form className="detail-card inventory-receipt-form" onSubmit={createStockAdjustment}>
          <div>
            <p className="eyebrow">KIỂM KÊ THEO TỒN ĐANG HIỂN THỊ</p>
            <h2>
              {countingBalance.variant.sku} · {countingBalance.warehouse.name}
            </h2>
            <p className="muted">
              Hệ thống ghi {countingBalance.onHandQuantity} {countingBalance.variant.baseUnitName}.
              Nếu tồn đổi trong lúc đếm, hệ thống sẽ yêu cầu tải lại.
            </p>
          </div>
          <label>
            Số lượng thực đếm ({countingBalance.variant.baseUnitName})
            <input
              key={`${countingBalance.id}:${countingBalance.version}`}
              name="countedQuantity"
              defaultValue={countingBalance.onHandQuantity}
              inputMode="decimal"
              pattern="[0-9]+([.][0-9]{1,6})?"
              required
            />
          </label>
          <label>
            Lý do
            <select name="reasonCode" defaultValue="COUNT_VARIANCE" required>
              <option value="COUNT_VARIANCE">Chênh lệch kiểm kê</option>
              <option value="DAMAGE">Hư hỏng</option>
              <option value="LOSS">Thất thoát</option>
              <option value="FOUND">Tìm thấy hàng</option>
              <option value="OTHER">Lý do khác</option>
            </select>
          </label>
          <label>
            Ghi chú
            <input name="notes" maxLength={2000} />
          </label>
          <div className="header-actions">
            <button className="primary" disabled={saving}>
              {saving ? 'Đang lưu…' : 'Lưu kết quả kiểm kê'}
            </button>
            <button type="button" className="ghost" onClick={() => setCountingBalance(null)}>
              Đóng
            </button>
          </div>
          <small className="form-warning">
            Giá trị chênh lệch tạm tính theo giá vốn bình quân hiện tại; cần xác nhận chính sách giá
            vốn trước khi dùng dữ liệu thật.
          </small>
        </form>
      )}

      <section className="inventory-kpis">
        <article>
          <span>SKU có tồn trong danh sách</span>
          <strong>{balances.filter((item) => !isZeroQuantity(item.onHandQuantity)).length}</strong>
        </article>
        <article>
          <span>Đơn mua chờ nhận trong danh sách</span>
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
                {canAdjustStock && <th>Thao tác</th>}
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
                  {canAdjustStock && (
                    <td>
                      <button className="ghost" onClick={() => setCountingBalance(balance)}>
                        Kiểm kê
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && balances.length === 0 && (
            <p className="empty-copy">
              Chưa có tồn. Có thể ghi tồn đầu hoặc nhận hàng theo đơn mua.
            </p>
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
                    {movement.goodsReceiptLine?.goodsReceipt.receiptNumber ??
                      movement.openingStock?.documentNumber ??
                      movement.stockAdjustment?.documentNumber ??
                      'Chứng từ kho'}{' '}
                    · tồn sau {movement.onHandAfter}
                  </small>
                </div>
                <strong
                  className={
                    movement.quantityDelta.startsWith('-') ? 'quantity-out' : 'quantity-in'
                  }
                >
                  {movement.quantityDelta.startsWith('-') ? '' : '+'}
                  {movement.quantityDelta} {movement.variant.baseUnitName}
                </strong>
              </article>
            ))}
            {!loading && movements.length === 0 && <p className="empty-copy">Chưa có biến động.</p>}
          </div>
        </section>
      </div>

      <section className="overview-card recent-table">
        <p className="eyebrow">KIỂM KÊ</p>
        <h2>Kết quả kiểm kê gần đây</h2>
        <div className="history-list">
          {adjustments.map((adjustment) => (
            <article key={adjustment.id}>
              <div>
                <b>
                  {adjustment.documentNumber} · {adjustment.skuSnapshot}
                </b>
                <small>
                  {adjustment.warehouse.name} · đếm {adjustment.countedQuantity}{' '}
                  {adjustment.unitNameSnapshot} · {adjustment.reasonCode}
                </small>
              </div>
              <span>{formatTime(adjustment.postedAt)}</span>
            </article>
          ))}
          {!loading && adjustments.length === 0 && (
            <p className="empty-copy">Chưa có lượt kiểm kê.</p>
          )}
        </div>
      </section>

      <section className="overview-card recent-table">
        <p className="eyebrow">TỒN ĐẦU KỲ</p>
        <h2>Chứng từ đã ghi sổ</h2>
        <div className="history-list">
          {openings.map((opening) => (
            <article key={opening.id}>
              <div>
                <b>{opening.documentNumber}</b>
                <small>
                  {opening.skuSnapshot} · {opening.warehouse.name} · {opening.quantity}{' '}
                  {opening.unitNameSnapshot}
                </small>
              </div>
              <span>{formatTime(opening.postedAt)}</span>
            </article>
          ))}
          {!loading && openings.length === 0 && (
            <p className="empty-copy">Chưa có chứng từ tồn đầu.</p>
          )}
        </div>
      </section>
    </section>
  );
}
