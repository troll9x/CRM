'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, type Staff } from './api-client';

type Policy = { days: number | null; version: number };
type EligibleShipment = {
  id: string;
  shipmentCode: string;
  deliveredAt: string;
  order: { orderNumber: string; customer: { displayName: string; customerCode: string } };
  lines: Array<{
    id: string;
    skuSnapshot: string;
    productNameSnapshot: string;
    variantNameSnapshot: string;
    unitNameSnapshot: string;
    deliveredQuantity: string;
    remainingQuantity: string;
  }>;
};
type ReturnCase = {
  id: string;
  status: 'RECEIVED' | 'INSPECTED';
  version: number;
  receivedAt: string;
  deadlineAt: string;
  customer: { displayName: string; customerCode: string };
  order: { orderNumber: string };
  shipment: { shipmentCode: string };
  lines: Array<{
    id: string;
    skuSnapshot: string;
    variantNameSnapshot: string;
    unitNameSnapshot: string;
    quantity: string;
    saleableQuantity: string | null;
    quarantineQuantity: string | null;
  }>;
};

function newKey() {
  return `return-${crypto.randomUUID()}`;
}

export function ReturnsWorkspace({
  staff,
  onLogout,
  loggingOut,
}: {
  staff: Staff;
  onLogout: () => void;
  loggingOut: boolean;
}) {
  const canRead = staff.permissions.includes('returns.read');
  const canReceive = staff.permissions.includes('returns.manage');
  const canInspect = staff.permissions.includes('returns.inspect');
  const canSetPolicy = staff.permissions.includes('returns.policy.manage');
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [eligible, setEligible] = useState<EligibleShipment[]>([]);
  const [cases, setCases] = useState<ReturnCase[]>([]);
  const [shipmentId, setShipmentId] = useState('');
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [quality, setQuality] = useState<Record<string, { saleable: string; quarantine: string }>>(
    {},
  );
  const [days, setDays] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [nextPolicy, nextCases, nextEligible] = await Promise.all([
        api<Policy>('/business-policy/return-window'),
        canRead ? api<ReturnCase[]>('/returns') : Promise.resolve([]),
        canRead ? api<EligibleShipment[]>('/returns/eligible-shipments') : Promise.resolve([]),
      ]);
      setPolicy(nextPolicy);
      setCases(nextCases);
      setEligible(nextEligible);
      setDays(nextPolicy.days?.toString() ?? '');
      setShipmentId((current) => current || nextEligible[0]?.id || '');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không tải được dữ liệu đổi trả.');
    } finally {
      setLoading(false);
    }
  }, [canRead]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  const selected = eligible.find((row) => row.id === shipmentId);

  async function savePolicy() {
    if (!policy) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const updated = await api<Policy>('/business-policy/return-window', {
        method: 'PATCH',
        body: JSON.stringify({ days: Number(days), expectedVersion: policy.version }),
      });
      setPolicy(updated);
      setMessage('Đã lưu thời hạn nhận trả hàng.');
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không lưu được cấu hình.');
    } finally {
      setBusy(false);
    }
  }

  async function receiveReturn() {
    if (!selected) return;
    const lines = selected.lines
      .filter((line) => Number(quantities[line.id] ?? 0) > 0)
      .map((line) => ({ shipmentLineId: line.id, quantity: quantities[line.id] }));
    if (!lines.length) {
      setError('Nhập số lượng trả cho ít nhất một dòng hàng.');
      return;
    }
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await api('/returns', {
        method: 'POST',
        headers: { 'Idempotency-Key': newKey() },
        body: JSON.stringify({ shipmentId: selected.id, lines }),
      });
      setMessage('Đã tiếp nhận hàng trả.');
      setQuantities({});
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không tiếp nhận được hàng trả.');
    } finally {
      setBusy(false);
    }
  }

  async function inspect(row: ReturnCase) {
    const lines = row.lines.map((line) => ({
      returnLineId: line.id,
      saleableQuantity: quality[line.id]?.saleable ?? '0',
      quarantineQuantity: quality[line.id]?.quarantine ?? line.quantity,
    }));
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await api(`/returns/${row.id}/inspect`, {
        method: 'POST',
        headers: { 'Idempotency-Key': newKey() },
        body: JSON.stringify({ expectedVersion: row.version, lines }),
      });
      setMessage(`Đã kiểm tra ${row.shipment.shipmentCode}; hàng lỗi đã vào tồn cách ly.`);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không lưu được kết quả kiểm tra.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="dashboard-content returns-workspace">
      <header className="workspace-header">
        <div>
          <p className="eyebrow">KHO VÀ HẬU MÃI</p>
          <h1>Đổi trả hàng</h1>
          <p className="muted">
            Chỉ tiếp nhận trong hạn đã cấu hình; hàng chỉ trở lại tồn sau kiểm tra chất lượng.
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
      {canSetPolicy && (
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Chính sách nhận trả</h2>
              <p className="muted">Chưa cấu hình thì hệ thống không nhận yêu cầu trả hàng mới.</p>
            </div>
          </div>
          <div className="form-row">
            <label>
              Số ngày kể từ lúc giao
              <input
                type="number"
                min="1"
                max="3650"
                value={days}
                onChange={(event) => setDays(event.target.value)}
              />
            </label>
            <button className="primary" disabled={busy || !days} onClick={() => void savePolicy()}>
              Lưu chính sách
            </button>
            <span className="muted">
              Hiện tại: {policy?.days ? `${policy.days} ngày` : 'chưa cấu hình'}
            </span>
          </div>
        </section>
      )}
      {canReceive && (
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Tiếp nhận hàng khách trả</h2>
              <p className="muted">Chọn phiếu giao còn hạn; số lượng nhập theo đơn vị bán.</p>
            </div>
          </div>
          {eligible.length ? (
            <>
              <div className="form-row">
                <label>
                  Phiếu giao
                  <select
                    value={shipmentId}
                    onChange={(event) => {
                      setShipmentId(event.target.value);
                      setQuantities({});
                    }}
                  >
                    <option value="">Chọn phiếu giao</option>
                    {eligible.map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.shipmentCode} · {row.order.customer.displayName} ·{' '}
                        {row.order.orderNumber}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {selected?.lines.map((line) => (
                <div className="return-line" key={line.id}>
                  <div>
                    <strong>
                      {line.productNameSnapshot} · {line.skuSnapshot}
                    </strong>
                    <span>
                      {line.variantNameSnapshot} · còn trả {line.remainingQuantity}{' '}
                      {line.unitNameSnapshot}
                    </span>
                  </div>
                  <label>
                    Số lượng trả
                    <input
                      type="number"
                      min="0"
                      max={line.remainingQuantity}
                      step="0.000001"
                      value={quantities[line.id] ?? ''}
                      onChange={(event) =>
                        setQuantities((current) => ({ ...current, [line.id]: event.target.value }))
                      }
                    />
                  </label>
                </div>
              ))}
              <button
                className="primary"
                disabled={busy || !selected}
                onClick={() => void receiveReturn()}
              >
                Ghi nhận tiếp nhận
              </button>
            </>
          ) : (
            <p className="empty-state">Chưa có phiếu giao nào còn hạn nhận trả.</p>
          )}
        </section>
      )}
      {canRead && (
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Yêu cầu đổi trả</h2>
              <p className="muted">Danh sách tối đa 100 yêu cầu gần nhất trong doanh nghiệp.</p>
            </div>
            <button className="secondary" onClick={() => void load()} disabled={loading}>
              Tải lại
            </button>
          </div>
          {loading ? (
            <p>Đang tải…</p>
          ) : cases.length ? (
            <div className="return-list">
              {cases.map((row) => (
                <article className="return-card" key={row.id}>
                  <div className="return-heading">
                    <div>
                      <strong>
                        {row.shipment.shipmentCode} · {row.order.orderNumber}
                      </strong>
                      <span>
                        {row.customer.displayName} · nhận{' '}
                        {new Date(row.receivedAt).toLocaleString('vi-VN')}
                      </span>
                    </div>
                    <span
                      className={`status-pill ${row.status === 'INSPECTED' ? 'status-good' : ''}`}
                    >
                      {row.status === 'INSPECTED' ? 'Đã kiểm tra' : 'Chờ kiểm tra'}
                    </span>
                  </div>
                  {row.lines.map((line) => (
                    <div className="return-line" key={line.id}>
                      <div>
                        <strong>
                          {line.skuSnapshot} · {line.variantNameSnapshot}
                        </strong>
                        <span>
                          Khách trả: {line.quantity} {line.unitNameSnapshot}
                          {line.saleableQuantity !== null
                            ? ` · đạt ${line.saleableQuantity} · cách ly ${line.quarantineQuantity}`
                            : ''}
                        </span>
                      </div>
                      {canInspect && row.status === 'RECEIVED' && (
                        <div className="quality-fields">
                          <label>
                            Đạt
                            <input
                              type="number"
                              min="0"
                              max={line.quantity}
                              step="0.000001"
                              value={quality[line.id]?.saleable ?? '0'}
                              onChange={(event) =>
                                setQuality((current) => ({
                                  ...current,
                                  [line.id]: {
                                    saleable: event.target.value,
                                    quarantine: current[line.id]?.quarantine ?? line.quantity,
                                  },
                                }))
                              }
                            />
                          </label>
                          <label>
                            Cách ly
                            <input
                              type="number"
                              min="0"
                              max={line.quantity}
                              step="0.000001"
                              value={quality[line.id]?.quarantine ?? line.quantity}
                              onChange={(event) =>
                                setQuality((current) => ({
                                  ...current,
                                  [line.id]: {
                                    saleable: current[line.id]?.saleable ?? '0',
                                    quarantine: event.target.value,
                                  },
                                }))
                              }
                            />
                          </label>
                        </div>
                      )}
                    </div>
                  ))}
                  {canInspect && row.status === 'RECEIVED' && (
                    <button className="primary" disabled={busy} onClick={() => void inspect(row)}>
                      Lưu kiểm tra chất lượng
                    </button>
                  )}
                </article>
              ))}
            </div>
          ) : (
            <p className="empty-state">Chưa có yêu cầu đổi trả.</p>
          )}
        </section>
      )}
    </main>
  );
}
