'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { api, type Staff } from './api-client';
import { buildSalesReportCsv, reportMonths } from './sales-report-export';

type ComparisonItem = { key: string; label?: string; value: number };
type SalesReport = {
  range: { from: string; to: string; timezone: string };
  revenueBasis: string;
  quantityBasis: string;
  monthlyRevenue: Array<{ month: string; revenueVnd: string }>;
  topProducts: Array<{
    variantId: string;
    sku: string;
    productName: string;
    variantName: string;
    baseUnitName: string;
    deliveredBaseQuantity: string;
  }>;
};
type AdminAlert = {
  id: string;
  type: 'QUOTE_CONVERTED' | 'MANUAL_ORDER_CREATED' | 'EXTERNAL_ORDER_IMPORTED';
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
  order: { id: string; orderNumber: string; status: 'DRAFT' | 'CONFIRMED' | 'CANCELED' } | null;
  externalOrder: { id: string; externalOrderId: string; normalizedStatus: string } | null;
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

function formatVnd(value: string) {
  try {
    return `${BigInt(value).toLocaleString('vi-VN')} ₫`;
  } catch {
    return `${value} ₫`;
  }
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
  const [salesReport, setSalesReport] = useState<SalesReport | null>(null);
  const [salesReportError, setSalesReportError] = useState('');
  const [reportFrom, setReportFrom] = useState('');
  const [reportTo, setReportTo] = useState('');
  const [reportLoading, setReportLoading] = useState(false);
  const [adminAlerts, setAdminAlerts] = useState<AdminAlert[]>([]);
  const [unreadAlertCount, setUnreadAlertCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const canReadAdminAlerts = staff.permissions.includes('admin.alerts.read');
  const canReadSalesReports = staff.permissions.includes('sales-reports.read');
  const hasComparisonData = Object.values(overview?.comparisons ?? {}).some((items) =>
    items?.some((item) => item.value > 0),
  );
  const hasDeliveredSales =
    (salesReport?.monthlyRevenue.some((month) => BigInt(month.revenueVnd) > BigInt(0)) ?? false) ||
    (salesReport?.topProducts.length ?? 0) > 0;
  const canReadCustomers = staff.permissions.includes('customers.read');
  const canReadCatalog = staff.permissions.includes('catalog.read');

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
    if (!canReadSalesReports) return;
    let active = true;
    api<SalesReport>('/reports/sales')
      .then((report) => {
        if (active) {
          setSalesReport(report);
          setReportFrom(report.range.from);
          setReportTo(report.range.to);
        }
      })
      .catch((caught) => {
        if (active)
          setSalesReportError(
            caught instanceof Error ? caught.message : 'Không tải được báo cáo doanh thu.',
          );
      });
    return () => {
      active = false;
    };
  }, [canReadSalesReports]);

  async function loadSalesReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setReportLoading(true);
    setSalesReportError('');
    try {
      const params = new URLSearchParams({ from: reportFrom, to: reportTo });
      const report = await api<SalesReport>(`/reports/sales?${params.toString()}`);
      setSalesReport(report);
      setReportFrom(report.range.from);
      setReportTo(report.range.to);
    } catch (caught) {
      setSalesReportError(
        caught instanceof Error ? caught.message : 'Không tải được báo cáo doanh thu.',
      );
    } finally {
      setReportLoading(false);
    }
  }

  function downloadSalesReport() {
    if (!salesReport) return;
    const csv = buildSalesReportCsv(salesReport);
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `bao-cao-giao-hang-${salesReport.range.from}-${salesReport.range.to}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

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
          {!hasComparisonData && (
            <section className="overview-card" aria-label="Bắt đầu sử dụng CRM">
              <h2>Chưa có dữ liệu kinh doanh để so sánh</h2>
              <p className="empty-copy">
                Thêm khách hàng và sản phẩm, sau đó ghi chứng từ mua bán thực tế. Tổng quan sẽ hiển
                thị số liệu và biểu đồ khi có dữ liệu.
              </p>
              {(canReadCustomers || canReadCatalog) && (
                <div className="header-actions">
                  {canReadCustomers && (
                    <button className="ghost" onClick={() => onNavigate('customers')}>
                      Mở khách hàng
                    </button>
                  )}
                  {canReadCatalog && (
                    <button className="ghost" onClick={() => onNavigate('products')}>
                      Mở sản phẩm
                    </button>
                  )}
                </div>
              )}
            </section>
          )}
          {hasComparisonData && (
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
          )}

          {canReadSalesReports && (
            <section className="overview-card sales-report-card">
              <div className="overview-card-head">
                <div>
                  <p className="eyebrow">BÁO CÁO GIAO HÀNG</p>
                  <h2>Doanh thu theo tháng và sản phẩm giao nhiều</h2>
                </div>
                {salesReport && (
                  <span>
                    {salesReport.range.from} — {salesReport.range.to}
                  </span>
                )}
              </div>
              <div className="sales-report-toolbar">
                <form className="sales-report-filters" onSubmit={loadSalesReport}>
                  <label>
                    Từ ngày
                    <input
                      type="date"
                      value={reportFrom}
                      onChange={(event) => setReportFrom(event.target.value)}
                      required
                    />
                  </label>
                  <label>
                    Đến ngày
                    <input
                      type="date"
                      value={reportTo}
                      onChange={(event) => setReportTo(event.target.value)}
                      required
                    />
                  </label>
                  <button
                    className="primary"
                    type="submit"
                    disabled={reportLoading || !reportFrom || !reportTo}
                  >
                    {reportLoading ? 'Đang tải…' : 'Xem báo cáo'}
                  </button>
                </form>
                <button
                  className="ghost"
                  type="button"
                  onClick={downloadSalesReport}
                  disabled={!salesReport}
                >
                  Tải CSV
                </button>
              </div>
              {salesReportError ? (
                <p className="error-message">{salesReportError}</p>
              ) : !salesReport ? (
                <p className="empty-copy">Đang tải báo cáo…</p>
              ) : (
                <>
                  <p className="sales-report-note">
                    Doanh thu hàng hóa đã giao, không gồm phí giao/thuế và chưa trừ hàng trả. Sản
                    phẩm xếp theo lượng giao quy về đơn vị gốc.
                  </p>
                  {!hasDeliveredSales ? (
                    <p className="empty-copy">
                      Chưa có đơn đã giao trong khoảng thời gian này. Báo cáo sẽ hiển thị khi có
                      chứng từ giao hàng thực tế.
                    </p>
                  ) : (
                    <div className="sales-report-grid">
                      <div
                        className="monthly-chart"
                        role="img"
                        aria-label="Biểu đồ doanh thu hàng hóa theo tháng"
                      >
                        {(() => {
                          const rows = reportMonths(salesReport);
                          const maximum = rows.reduce((max, row) => {
                            const amount = BigInt(row.revenueVnd);
                            return amount > max ? amount : max;
                          }, BigInt(0));
                          return rows.map((row) => {
                            const amount = BigInt(row.revenueVnd);
                            const height =
                              maximum === BigInt(0) ? 0 : Number((amount * BigInt(100)) / maximum);
                            return (
                              <div
                                className="monthly-column"
                                key={row.month}
                                title={`${row.month}: ${formatVnd(row.revenueVnd)}`}
                              >
                                <strong>
                                  {amount > BigInt(0) ? formatVnd(row.revenueVnd) : '—'}
                                </strong>
                                <div className="monthly-bar-track">
                                  <span style={{ height: `${height}%` }} />
                                </div>
                                <span>{row.month.slice(5)}</span>
                              </div>
                            );
                          });
                        })()}
                      </div>
                      <div className="bestseller-list">
                        <h3>Sản phẩm giao nhiều</h3>
                        {salesReport.topProducts.length ? (
                          salesReport.topProducts.map((product, index) => (
                            <div className="bestseller-row" key={product.variantId}>
                              <span className="bestseller-rank">{index + 1}</span>
                              <div>
                                <strong>
                                  {product.productName} · {product.variantName}
                                </strong>
                                <small>{product.sku}</small>
                              </div>
                              <b>
                                {Number(product.deliveredBaseQuantity).toLocaleString('vi-VN')}{' '}
                                {product.baseUnitName}
                              </b>
                            </div>
                          ))
                        ) : (
                          <p className="empty-copy">
                            Chưa có hàng giao trong khoảng thời gian này.
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </>
              )}
            </section>
          )}

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
                          {alert.order
                            ? `${alert.order.orderNumber} · ${alert.order.status}`
                            : alert.externalOrder
                              ? `Đơn ngoài ${alert.externalOrder.externalOrderId} · ${alert.externalOrder.normalizedStatus}`
                              : 'Thông báo CRM'}{' '}
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

          {hasComparisonData && (
            <div className="overview-grid">
              {overview.comparisons.customersByGroup &&
                overview.comparisons.customersByGroup.some((item) => item.value > 0) && (
                  <Comparison
                    title="Khách hàng theo nhóm"
                    items={overview.comparisons.customersByGroup}
                  />
                )}
              {overview.comparisons.opportunitiesByStage &&
                overview.comparisons.opportunitiesByStage.some((item) => item.value > 0) && (
                  <Comparison
                    title="Cơ hội bán hàng"
                    items={overview.comparisons.opportunitiesByStage}
                  />
                )}
              {overview.comparisons.catalog &&
                overview.comparisons.catalog.some((item) => item.value > 0) && (
                  <Comparison title="So sánh danh mục" items={overview.comparisons.catalog} />
                )}
              {overview.comparisons.purchasing &&
                overview.comparisons.purchasing.some((item) => item.value > 0) && (
                  <Comparison title="So sánh mua hàng" items={overview.comparisons.purchasing} />
                )}
            </div>
          )}

          {overview.recentPurchaseOrders && overview.recentPurchaseOrders.length > 0 && (
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
