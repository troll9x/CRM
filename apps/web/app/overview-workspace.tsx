'use client';

import { useEffect, useState } from 'react';
import { api, type Staff } from './api-client';

type ComparisonItem = { key: string; label?: string; value: number };
type Overview = {
  generatedAt: string;
  kpis: {
    activeCustomers: number;
    openTasks: number;
    overdueTasks: number;
    activeProducts: number;
    activeVariants: number;
    activeSuppliers: number;
    draftPurchaseOrders: number;
    orderedPurchaseOrders: number;
  };
  comparisons: {
    customersByGroup: ComparisonItem[];
    opportunitiesByStage: ComparisonItem[];
    catalog: ComparisonItem[];
    purchasing: ComparisonItem[];
  };
  recentPurchaseOrders: Array<{
    id: string;
    orderNumber: string;
    status: 'DRAFT' | 'ORDERED' | 'CANCELED';
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
const purchaseLabels = { DRAFT: 'Nháp', ORDERED: 'Đã phát hành', CANCELED: 'Đã hủy' };

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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
            <button onClick={() => onNavigate('customers')}>
              <span>Khách đang hoạt động</span>
              <strong>{overview.kpis.activeCustomers.toLocaleString('vi-VN')}</strong>
              <small>{overview.kpis.openTasks} việc cần xử lý</small>
            </button>
            <button
              onClick={() => onNavigate('customers')}
              className={overview.kpis.overdueTasks ? 'alert' : ''}
            >
              <span>Việc quá hạn</span>
              <strong>{overview.kpis.overdueTasks.toLocaleString('vi-VN')}</strong>
              <small>Cần ưu tiên hôm nay</small>
            </button>
            <button onClick={() => onNavigate('products')}>
              <span>Danh mục đang bán</span>
              <strong>{overview.kpis.activeVariants.toLocaleString('vi-VN')} SKU</strong>
              <small>{overview.kpis.activeProducts} sản phẩm</small>
            </button>
            <button onClick={() => onNavigate('purchasing')}>
              <span>Đơn mua đang mở</span>
              <strong>{overview.kpis.orderedPurchaseOrders.toLocaleString('vi-VN')}</strong>
              <small>{overview.kpis.draftPurchaseOrders} đơn nháp</small>
            </button>
          </div>

          <div className="overview-grid">
            <Comparison
              title="Khách hàng theo nhóm"
              items={overview.comparisons.customersByGroup}
            />
            <Comparison title="Cơ hội bán hàng" items={overview.comparisons.opportunitiesByStage} />
            <Comparison title="So sánh danh mục" items={overview.comparisons.catalog} />
            <Comparison title="So sánh mua hàng" items={overview.comparisons.purchasing} />
          </div>

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
        </>
      )}
    </section>
  );
}
