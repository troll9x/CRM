'use client';

import { useEffect, useState } from 'react';
import { api, type Staff } from './api-client';

type ComparisonItem = { key: string; label?: string; value: number };
type AdminAlert = {
  id: string;
  type: 'QUOTE_CONVERTED';
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
  order: { id: string; orderNumber: string; status: 'DRAFT' };
};
type Overview = {
  generatedAt: string;
  kpis: {
    activeCustomers?: number;
    openTasks?: number;
    overdueTasks?: number;
    activeProducts?: number;
    activeVariants?: number;
    activeSuppliers?: number;
    draftPurchaseOrders?: number;
    orderedPurchaseOrders?: number;
  };
  comparisons: {
    customersByGroup?: ComparisonItem[];
    opportunitiesByStage?: ComparisonItem[];
    catalog?: ComparisonItem[];
    purchasing?: ComparisonItem[];
  };
  recentPurchaseOrders?: Array<{
    id: string;
    orderNumber: string;
    status: 'DRAFT' | 'ORDERED' | 'PARTIALLY_RECEIVED' | 'RECEIVED' | 'CANCELED';
    updatedAt: string;
    supplier: { name: string };
    _count: { lines: number };
  }>;
};

const opportunityLabels: Record<string, string> = {
  NEW: 'Mới',
  QUALIFIED: 'Đã xác định nhu cầu',
  WON: 'Thành công',
  LOST: 'Không thành công',
};
const purchaseLabels = {
  DRAFT: 'Nháp',
  ORDERED: 'Đã phát hành',
  PARTIALLY_RECEIVED: 'Đã nhận một phần',
  RECEIVED: 'Đã nhận đủ',
  CANCELED: 'Đã hủy',
};

function Comparison({ title, items }: { title: string; items: ComparisonItem[] }) {
  const maximum = Math.max(1, ...items.map((item) => item.value));
  return (
    <section className="overview-card comparison-card">
      <h2>{title}</h2>
      {items.length === 0 ? (
        <p className="empty-copy">Chưa có dữ liệu để so sánh.</p>
      ) : (
        <div className="bar-chart">
          {items.map((item) => (
            <div className="bar-row" key={item.key}>
              <div className="bar-label">
                <span>{item.label ?? opportunityLabels[item.key] ?? item.key}</span>
                <strong>{item.value.toLocaleString('vi-VN')}</strong>
              </div>
              <div className="bar-track" aria-label={`${item.label ?? item.key}: ${item.value}`}>
                <span style={{ width: `${(item.value / maximum) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export function OverviewWorkspace({
  staff,
  onLogout,
  loggingOut,
  onNavigate,
}: {
  staff: Staff;
  onLogout: () => void;
  loggingOut: boolean;
  onNavigate: (view: 'customers' | 'products' | 'purchasing') => void;
}) {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [adminAlerts, setAdminAlerts] = useState<AdminAlert[]>([]);
  const [unreadAlertCount, setUnreadAlertCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const canReadAdminAlerts = staff.permissions.includes('admin.alerts.read');

  useEffect(() => {
    let active = true;
    api<Overview>('/overview')
      .then((data) => {
        if (active) setOverview(data);
      })
      .catch((caught) => {
        if (active) {
          setError(caught instanceof Error ? caught.message : 'Không tải được tổng quan.');
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!canReadAdminAlerts) return;
    api<{ items: AdminAlert[]; unreadCount: number }>('/admin-alerts')
      .then(({ items, unreadCount }) => {
        setAdminAlerts(items);
        setUnreadAlertCount(unreadCount);
      })
      .catch((caught) => {
        setError(caught instanceof Error ? caught.message : 'Không tải được thông báo quản lý.');
      });
  }, [canReadAdminAlerts]);

  async function markAlertRead(id: string) {
    try {
      await api(`/admin-alerts/${id}/read`, { method: 'POST' });
      setAdminAlerts((current) =>
        current.map((alert) =>
          alert.id === id && !alert.readAt ? { ...alert, readAt: new Date().toISOString() } : alert,
        ),
      );
      setUnreadAlertCount((current) => Math.max(0, current - 1));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không cập nhật được thông báo.');
    }
  }

  return (
    <section className="dashboard-content overview-workspace">
      <header>
        <div>
          <p className="eyebrow">TỔNG QUAN KINH DOANH</p>
          <h1>Chào {staff.displayName}</h1>
          <p className="muted">Số liệu trực tiếp từ CRM, cập nhật theo dữ liệu đang lưu.</p>
        </div>
        <button className="ghost" onClick={onLogout} disabled={loggingOut}>
          Đăng xuất
        </button>
      </header>

      {loading && <div className="loading">Đang tổng hợp số liệu…</div>}
      {error && <div className="error-message">{error}</div>}
      {overview && (
        <>
          <div className="business-kpis">
            {overview.kpis.activeCustomers !== undefined && (
              <button onClick={() => onNavigate('customers')}>
                <span>Khách đang hoạt động</span>
                <strong>{overview.kpis.activeCustomers.toLocaleString('vi-VN')}</strong>
                <small>{overview.kpis.openTasks} việc cần xử lý</small>
              </button>
            )}
            {overview.kpis.overdueTasks !== undefined && (
              <button
                onClick={() => onNavigate('customers')}
                className={overview.kpis.overdueTasks ? 'alert' : ''}
              >
                <span>Việc quá hạn</span>
                <strong>{overview.kpis.overdueTasks.toLocaleString('vi-VN')}</strong>
                <small>Cần ưu tiên hôm nay</small>
              </button>
            )}
            {overview.kpis.activeVariants !== undefined && (
              <button onClick={() => onNavigate('products')}>
                <span>Danh mục đang bán</span>
                <strong>{overview.kpis.activeVariants.toLocaleString('vi-VN')} SKU</strong>
                <small>{overview.kpis.activeProducts} sản phẩm</small>
              </button>
            )}
            {overview.kpis.orderedPurchaseOrders !== undefined && (
              <button onClick={() => onNavigate('purchasing')}>
                <span>Đơn mua đang mở</span>
                <strong>{overview.kpis.orderedPurchaseOrders.toLocaleString('vi-VN')}</strong>
                <small>{overview.kpis.draftPurchaseOrders} đơn nháp</small>
              </button>
            )}
          </div>

          {canReadAdminAlerts && (
            <section className="overview-card recent-table" aria-live="polite">
              <div className="overview-card-head">
                <div>
                  <p className="eyebrow">THÔNG BÁO NỘI BỘ</p>
                  <h2>Đơn cần quản lý xem ({unreadAlertCount} chưa đọc)</h2>
                </div>
              </div>
              {adminAlerts.length === 0 ? (
                <p className="empty-copy">Chưa có thông báo quản lý.</p>
              ) : (
                <div className="alert-list">
                  {adminAlerts.map((alert) => (
                    <article key={alert.id} className="alert-list-item">
                      <div>
                        <strong>{alert.title}</strong>
                        <p>{alert.body}</p>
                        <small>
                          {alert.order.orderNumber} · {alert.order.status} ·{' '}
                          {new Date(alert.createdAt).toLocaleString('vi-VN', {
                            timeZone: 'Asia/Ho_Chi_Minh',
                          })}
                        </small>
                      </div>
                      {!alert.readAt && (
                        <button
                          className="ghost"
                          onClick={() => void markAlertRead(alert.id)}
                          aria-label={`Đánh dấu đã đọc: ${alert.title}`}
                        >
                          Đã xem
                        </button>
                      )}
                    </article>
                  ))}
                </div>
              )}
            </section>
          )}

          <div className="overview-grid">
            {overview.comparisons.customersByGroup && (
              <Comparison
                title="Khách hàng theo nhóm"
                items={overview.comparisons.customersByGroup}
              />
            )}
            {overview.comparisons.opportunitiesByStage && (
              <Comparison
                title="Cơ hội bán hàng"
                items={overview.comparisons.opportunitiesByStage}
              />
            )}
            {overview.comparisons.catalog && (
              <Comparison title="So sánh danh mục" items={overview.comparisons.catalog} />
            )}
            {overview.comparisons.purchasing && (
              <Comparison title="So sánh mua hàng" items={overview.comparisons.purchasing} />
            )}
          </div>

          {overview.recentPurchaseOrders && (
            <section className="overview-card recent-table">
              <div className="overview-card-head">
                <div>
                  <p className="eyebrow">MUA HÀNG GẦN ĐÂY</p>
                  <h2>Đơn mua mới cập nhật</h2>
                </div>
                <button className="ghost" onClick={() => onNavigate('purchasing')}>
                  Xem mua hàng
                </button>
              </div>
              {overview.recentPurchaseOrders.length === 0 ? (
                <p className="empty-copy">
                  Chưa có đơn mua. Số liệu sẽ xuất hiện ngay khi tạo chứng từ thật.
                </p>
              ) : (
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Mã đơn</th>
                        <th>Nhà cung cấp</th>
                        <th>Số dòng</th>
                        <th>Trạng thái</th>
                        <th>Cập nhật</th>
                      </tr>
                    </thead>
                    <tbody>
                      {overview.recentPurchaseOrders.map((order) => (
                        <tr key={order.id}>
                          <td>
                            <code>{order.orderNumber}</code>
                          </td>
                          <td>{order.supplier.name}</td>
                          <td>{order._count.lines}</td>
                          <td>
                            <span className={`status-pill ${order.status.toLowerCase()}`}>
                              {purchaseLabels[order.status]}
                            </span>
                          </td>
                          <td>
                            {new Date(order.updatedAt).toLocaleString('vi-VN', {
                              timeZone: 'Asia/Ho_Chi_Minh',
                            })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <small className="data-time">
                Tổng hợp lúc{' '}
                {new Date(overview.generatedAt).toLocaleString('vi-VN', {
                  timeZone: 'Asia/Ho_Chi_Minh',
                })}
              </small>
            </section>
          )}
          {Object.keys(overview.kpis).length === 0 && (
            <p className="empty-copy">Chưa có chỉ số phù hợp với quyền hiện tại.</p>
          )}
        </>
      )}
    </section>
  );
}
