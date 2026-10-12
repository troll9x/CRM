'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, type Staff } from './api-client';

type ReadyOrder = {
  id: string;
  orderNumber: string;
  version: number;
  confirmedAt: string | null;
  customerName: string;
  lines: Array<{
    id: string;
    productNameSnapshot: string;
    skuSnapshot: string;
    variantNameSnapshot: string;
    unitNameSnapshot: string;
    quantity: string;
  }>;
};
type Shipment = {
  id: string;
  shipmentCode: string;
  orderId: string;
  orderNumber: string;
  customerName: string;
  warehouseName: string;
  status: 'IN_TRANSIT' | 'DELIVERED';
  version: number;
  shippedAt: string;
  deliveredAt: string | null;
  lines: ReadyOrder['lines'];
};

function idempotencyKey(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

export function ShipmentsWorkspace({
  staff,
  onLogout,
  loggingOut,
}: {
  staff: Staff;
  onLogout: () => void;
  loggingOut: boolean;
}) {
  const [readyOrders, setReadyOrders] = useState<ReadyOrder[]>([]);
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const canRead = staff.permissions.includes('shipments.read');
  const canCreate = staff.permissions.includes('shipments.create');
  const canDeliver = staff.permissions.includes('shipments.deliver');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [ready, shipped] = await Promise.all([
        api<{ items: ReadyOrder[] }>('/shipments/ready-orders'),
        api<{ items: Shipment[] }>('/shipments?status=IN_TRANSIT'),
      ]);
      setReadyOrders(ready.items);
      setShipments(shipped.items);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không tải được hàng chờ giao.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function createShipment(order: ReadyOrder) {
    setBusyId(order.id);
    setError('');
    setMessage('');
    try {
      await api('/shipments', {
        method: 'POST',
        headers: { 'Idempotency-Key': idempotencyKey('shipment-create') },
        body: JSON.stringify({ orderId: order.id, expectedVersion: order.version }),
      });
      setMessage(`Đã xuất phiếu giao cho đơn ${order.orderNumber}.`);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không tạo được phiếu giao.');
    } finally {
      setBusyId('');
    }
  }

  async function markDelivered(shipment: Shipment) {
    setBusyId(shipment.id);
    setError('');
    setMessage('');
    try {
      await api(`/shipments/${shipment.id}/deliver`, {
        method: 'POST',
        headers: { 'Idempotency-Key': idempotencyKey('shipment-deliver') },
        body: JSON.stringify({ expectedVersion: shipment.version }),
      });
      setMessage(`Đã ghi nhận giao đủ đơn ${shipment.orderNumber}.`);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không ghi nhận giao hàng được.');
    } finally {
      setBusyId('');
    }
  }

  return (
    <main className="dashboard-content shipments-workspace">
      <header className="workspace-header">
        <div>
          <p className="eyebrow">TÁC NGHIỆP KHO</p>
          <h1>Xuất kho & giao hàng</h1>
          <p className="muted">
            Danh sách chỉ gồm đơn đã xác nhận trong đơn vị kinh doanh hiện tại. Hệ thống chỉ xuất và
            ghi nhận giao đủ toàn bộ đơn.
          </p>
        </div>
        <button className="secondary" onClick={onLogout} disabled={loggingOut}>
          Đăng xuất
        </button>
      </header>
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
      {!canRead ? (
        <section className="panel">
          <p className="empty-state">Tài khoản không có quyền xem hàng chờ giao.</p>
        </section>
      ) : loading ? (
        <section className="panel">
          <p>Đang tải…</p>
        </section>
      ) : (
        <>
          <section className="panel">
            <div className="panel-heading">
              <div>
                <h2>Đơn đã xác nhận, chưa xuất kho</h2>
                <p>{readyOrders.length} đơn trong danh sách gần nhất</p>
              </div>
              <button className="secondary" onClick={() => void load()} disabled={loading}>
                Tải lại
              </button>
            </div>
            {readyOrders.length ? (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Đơn / khách</th>
                      <th>Hàng</th>
                      <th>Xác nhận lúc</th>
                      <th>Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {readyOrders.map((order) => (
                      <tr key={order.id}>
                        <td>
                          {order.orderNumber}
                          <small>{order.customerName}</small>
                        </td>
                        <td>
                          {order.lines.map((line) => (
                            <small key={line.id}>
                              {line.productNameSnapshot} · {line.skuSnapshot} · {line.quantity}{' '}
                              {line.unitNameSnapshot}
                            </small>
                          ))}
                        </td>
                        <td>
                          {order.confirmedAt
                            ? new Date(order.confirmedAt).toLocaleString('vi-VN')
                            : '—'}
                        </td>
                        <td>
                          {canCreate && (
                            <button
                              className="primary"
                              disabled={busyId === order.id}
                              onClick={() => void createShipment(order)}
                            >
                              {busyId === order.id ? 'Đang xuất…' : 'Xuất đủ hàng'}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="empty-state">Không có đơn đã xác nhận đang chờ xuất kho.</p>
            )}
          </section>
          <section className="panel">
            <div className="panel-heading">
              <div>
                <h2>Phiếu đang giao</h2>
                <p>{shipments.length} phiếu đang chờ ghi nhận giao đủ</p>
              </div>
            </div>
            {shipments.length ? (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Phiếu / đơn</th>
                      <th>Khách</th>
                      <th>Kho</th>
                      <th>Hàng</th>
                      <th>Xuất lúc</th>
                      <th>Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shipments.map((shipment) => (
                      <tr key={shipment.id}>
                        <td>
                          {shipment.shipmentCode}
                          <small>{shipment.orderNumber}</small>
                        </td>
                        <td>{shipment.customerName}</td>
                        <td>{shipment.warehouseName}</td>
                        <td>
                          {shipment.lines.map((line) => (
                            <small key={line.id}>
                              {line.productNameSnapshot} · {line.quantity} {line.unitNameSnapshot}
                            </small>
                          ))}
                        </td>
                        <td>{new Date(shipment.shippedAt).toLocaleString('vi-VN')}</td>
                        <td>
                          {canDeliver && (
                            <button
                              className="primary"
                              disabled={busyId === shipment.id}
                              onClick={() => void markDelivered(shipment)}
                            >
                              {busyId === shipment.id ? 'Đang lưu…' : 'Đã giao đủ'}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="empty-state">Không có phiếu đang giao.</p>
            )}
          </section>
        </>
      )}
    </main>
  );
}
