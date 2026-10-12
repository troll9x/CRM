'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, type Staff } from './api-client';

type Receivable = {
  id: string;
  customer: { customerCode: string; displayName: string };
  order: { orderNumber: string; status: string };
  createdAt: string;
  amountVnd: string;
  settledVnd: string;
  balanceVnd: string;
};
function vnd(value: string) {
  try {
    return `${BigInt(value).toLocaleString('vi-VN')} ₫`;
  } catch {
    return `${value} ₫`;
  }
}

export function ReceivablesWorkspace({
  staff,
  onLogout,
  loggingOut,
}: {
  staff: Staff;
  onLogout: () => void;
  loggingOut: boolean;
}) {
  const [items, setItems] = useState<Receivable[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await api<{ items: Receivable[] }>('/receivables');
      setItems(result.items);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không tải được công nợ.');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  const canView = staff.permissions.includes('receivables.view');
  const openTotal = items.reduce((sum, item) => sum + BigInt(item.balanceVnd), BigInt(0));
  return (
    <main className="dashboard-content receivables-workspace">
      <header className="workspace-header">
        <div>
          <p className="eyebrow">THU CHI</p>
          <h1>Công nợ phải thu</h1>
          <p className="muted">
            Phải thu phát sinh khi xác nhận đơn; số tiền thanh toán được phân bổ từ các phiếu thu.
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
      <section className="panel">
        <div className="receivable-summary">
          <div>
            <span>Đơn có khoản phải thu</span>
            <strong>{items.length}</strong>
          </div>
          <div>
            <span>Số dư phải thu</span>
            <strong>{vnd(openTotal.toString())}</strong>
          </div>
          <button className="secondary" onClick={() => void load()} disabled={loading}>
            Tải lại
          </button>
        </div>
        {!canView ? (
          <p className="empty-state">Tài khoản không có quyền xem công nợ.</p>
        ) : loading ? (
          <p>Đang tải…</p>
        ) : items.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Ngày xác nhận</th>
                  <th>Khách hàng</th>
                  <th>Đơn</th>
                  <th>Tổng phải thu</th>
                  <th>Đã thanh toán</th>
                  <th>Còn lại</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td>{new Date(item.createdAt).toLocaleDateString('vi-VN')}</td>
                    <td>
                      {item.customer.displayName}
                      <small>{item.customer.customerCode}</small>
                    </td>
                    <td>{item.order.orderNumber}</td>
                    <td>{vnd(item.amountVnd)}</td>
                    <td>{vnd(item.settledVnd)}</td>
                    <td>{vnd(item.balanceVnd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="empty-state">Chưa phát sinh khoản phải thu.</p>
        )}
      </section>
    </main>
  );
}
