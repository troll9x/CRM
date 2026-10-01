'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { api, type Staff } from './api-client';

type Contact = {
  id: string;
  type: 'PHONE' | 'EMAIL';
  value: string;
  label?: string | null;
  isPrimary: boolean;
};

type Address = {
  id: string;
  label?: string | null;
  recipientName?: string | null;
  phone?: string | null;
  line1: string;
  ward?: string | null;
  district?: string | null;
  province: string;
  countryCode: string;
  isDefault: boolean;
  status: 'ACTIVE' | 'ARCHIVED';
};

type CustomerSummary = {
  id: string;
  customerCode: string;
  displayName: string;
  source?: string | null;
  status: 'ACTIVE' | 'ARCHIVED';
  version: number;
  marketingConsent: boolean;
  updatedAt: string;
  group: { code: string; name: string };
  contacts: Contact[];
  assignedStaff?: { id: string; displayName: string } | null;
  _count: { addresses: number; tasks: number; opportunities: number };
};

type CustomerDetail = CustomerSummary & {
  legalName?: string | null;
  taxCode?: string | null;
  notes?: string | null;
  createdAt: string;
  addresses: Address[];
  tasks: Array<{
    id: string;
    title: string;
    description?: string | null;
    dueAt?: string | null;
    status: 'OPEN' | 'DONE' | 'CANCELED';
  }>;
  opportunities: Array<{
    id: string;
    title: string;
    kind: 'FIRST_PURCHASE' | 'REPEAT_PURCHASE';
    stage: 'NEW' | 'QUALIFIED' | 'WON' | 'LOST';
    note?: string | null;
    updatedAt: string;
  }>;
};

type DuplicateCandidate = {
  id: string;
  customerCode: string;
  displayName: string;
  matchReasons: string[];
};

type Group = { id: string; code: string; name: string; description?: string | null };

function value(form: FormData, name: string) {
  return String(form.get(name) ?? '').trim();
}

function readableDate(date?: string | null) {
  if (!date) return 'Chưa đặt hạn';
  return new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(new Date(date));
}

const matchReason: Record<string, string> = {
  SAME_NAME: 'trùng tên',
  SAME_PHONE: 'trùng số điện thoại',
  SAME_EMAIL: 'trùng email',
};

export function CustomerWorkspace({
  staff,
  onLogout,
  loggingOut,
}: {
  staff: Staff;
  onLogout: () => void;
  loggingOut: boolean;
}) {
  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [selected, setSelected] = useState<CustomerDetail | null>(null);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [duplicates, setDuplicates] = useState<DuplicateCandidate[]>([]);

  const loadDetail = useCallback(async (id: string) => {
    const detail = await api<CustomerDetail>(`/customers/${id}`);
    setSelected(detail);
  }, []);

  const loadCustomers = useCallback(
    async (search = query) => {
      setLoading(true);
      setError('');
      try {
        const result = await api<{
          items: CustomerSummary[];
          nextCursor: string | null;
          hasMore: boolean;
        }>(`/customers${search ? `?query=${encodeURIComponent(search)}` : ''}`);
        setCustomers(result.items);
        if (result.items.length && !result.items.some((item) => item.id === selected?.id)) {
          await loadDetail(result.items[0].id);
        } else if (!result.items.length) {
          setSelected(null);
        }
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Không tải được danh sách khách.');
      } finally {
        setLoading(false);
      }
    },
    [loadDetail, query, selected?.id],
  );

  useEffect(() => {
    let active = true;
    async function initialLoad() {
      try {
        const [groupRows, customerRows] = await Promise.all([
          api<Group[]>('/customers/groups'),
          api<{ items: CustomerSummary[] }>('/customers'),
        ]);
        if (!active) return;
        setGroups(groupRows);
        setCustomers(customerRows.items);
        if (customerRows.items[0]) await loadDetail(customerRows.items[0].id);
      } catch (caught) {
        if (active) {
          setError(caught instanceof Error ? caught.message : 'Không tải được dữ liệu khách hàng.');
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    void initialLoad();
    return () => {
      active = false;
    };
  }, [loadDetail]);

  async function selectCustomer(id: string) {
    setError('');
    try {
      await loadDetail(id);
      setEditing(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không tải được hồ sơ khách.');
    }
  }

  async function createCustomer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');
    setDuplicates([]);
    const form = new FormData(event.currentTarget);
    const phone = value(form, 'phone');
    const email = value(form, 'email');
    const line1 = value(form, 'line1');
    const province = value(form, 'province');
    try {
      const result = await api<{
        customer: CustomerDetail;
        duplicateCandidates: DuplicateCandidate[];
      }>('/customers', {
        method: 'POST',
        body: JSON.stringify({
          displayName: value(form, 'displayName'),
          groupCode: value(form, 'groupCode'),
          source: value(form, 'source') || undefined,
          notes: value(form, 'notes') || undefined,
          marketingConsent: form.get('marketingConsent') === 'on',
          contacts: [
            ...(phone ? [{ type: 'PHONE', value: phone, isPrimary: true }] : []),
            ...(email ? [{ type: 'EMAIL', value: email, isPrimary: !phone }] : []),
          ],
          ...(line1 && province
            ? {
                address: {
                  label: 'Địa chỉ chính',
                  line1,
                  district: value(form, 'district') || undefined,
                  province,
                  isDefault: true,
                },
              }
            : {}),
        }),
      });
      setSelected(result.customer);
      setDuplicates(result.duplicateCandidates);
      setMessage(
        result.duplicateCandidates.length
          ? 'Đã tạo hồ sơ riêng. Hệ thống tìm thấy hồ sơ có thể trùng để bạn tự kiểm tra.'
          : 'Đã tạo khách hàng.',
      );
      setShowCreate(false);
      event.currentTarget.reset();
      await loadCustomers('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không tạo được khách hàng.');
    } finally {
      setSaving(false);
    }
  }

  async function updateCustomer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    setSaving(true);
    setError('');
    const form = new FormData(event.currentTarget);
    const phone = value(form, 'phone');
    const email = value(form, 'email');
    try {
      const updated = await api<CustomerDetail>(`/customers/${selected.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          version: selected.version,
          displayName: value(form, 'displayName'),
          groupCode: value(form, 'groupCode'),
          source: value(form, 'source'),
          notes: value(form, 'notes'),
          marketingConsent: form.get('marketingConsent') === 'on',
          contacts: [
            ...(phone ? [{ type: 'PHONE', value: phone, isPrimary: true }] : []),
            ...(email ? [{ type: 'EMAIL', value: email, isPrimary: !phone }] : []),
          ],
        }),
      });
      setSelected(updated);
      setEditing(false);
      setMessage('Đã cập nhật hồ sơ khách hàng.');
      await loadCustomers(query);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không cập nhật được khách hàng.');
    } finally {
      setSaving(false);
    }
  }

  async function addAddress(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    setSaving(true);
    setError('');
    const form = new FormData(event.currentTarget);
    try {
      const updated = await api<CustomerDetail>(`/customers/${selected.id}/addresses`, {
        method: 'POST',
        body: JSON.stringify({
          label: value(form, 'label') || undefined,
          recipientName: value(form, 'recipientName') || undefined,
          phone: value(form, 'phone') || undefined,
          line1: value(form, 'line1'),
          ward: value(form, 'ward') || undefined,
          district: value(form, 'district') || undefined,
          province: value(form, 'province'),
          isDefault: form.get('isDefault') === 'on',
        }),
      });
      setSelected(updated);
      setMessage('Đã thêm địa chỉ.');
      event.currentTarget.reset();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không thêm được địa chỉ.');
    } finally {
      setSaving(false);
    }
  }

  async function archiveAddress(address: Address) {
    if (!selected) return;
    setSaving(true);
    setError('');
    try {
      const updated = await api<CustomerDetail>(
        `/customers/${selected.id}/addresses/${address.id}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            label: address.label || undefined,
            recipientName: address.recipientName || undefined,
            phone: address.phone || undefined,
            line1: address.line1,
            ward: address.ward || undefined,
            district: address.district || undefined,
            province: address.province,
            countryCode: address.countryCode,
            isDefault: false,
            status: 'ARCHIVED',
          }),
        },
      );
      setSelected(updated);
      setMessage('Đã lưu trữ địa chỉ; dữ liệu không bị xóa cứng.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không cập nhật được địa chỉ.');
    } finally {
      setSaving(false);
    }
  }

  async function createTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    setSaving(true);
    const form = new FormData(event.currentTarget);
    const dueAt = value(form, 'dueAt');
    try {
      await api('/tasks', {
        method: 'POST',
        body: JSON.stringify({
          customerId: selected.id,
          title: value(form, 'title'),
          dueAt: dueAt ? new Date(dueAt).toISOString() : undefined,
        }),
      });
      await loadDetail(selected.id);
      setMessage('Đã tạo việc nhắc.');
      event.currentTarget.reset();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không tạo được việc nhắc.');
    } finally {
      setSaving(false);
    }
  }

  async function completeTask(id: string) {
    if (!selected) return;
    setSaving(true);
    try {
      await api(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify({ status: 'DONE' }) });
      await loadDetail(selected.id);
      setMessage('Đã hoàn thành việc nhắc.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không cập nhật được việc nhắc.');
    } finally {
      setSaving(false);
    }
  }

  async function createOpportunity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    setSaving(true);
    const form = new FormData(event.currentTarget);
    try {
      await api('/opportunities', {
        method: 'POST',
        body: JSON.stringify({
          customerId: selected.id,
          title: value(form, 'title'),
          kind: value(form, 'kind'),
          note: value(form, 'note') || undefined,
        }),
      });
      await loadDetail(selected.id);
      setMessage('Đã mở cơ hội bán hàng.');
      event.currentTarget.reset();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không tạo được cơ hội.');
    } finally {
      setSaving(false);
    }
  }

  async function advanceOpportunity(id: string, stage: 'QUALIFIED' | 'WON' | 'LOST') {
    if (!selected) return;
    setSaving(true);
    try {
      await api(`/opportunities/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ stage }),
      });
      await loadDetail(selected.id);
      setMessage('Đã cập nhật giai đoạn cơ hội.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không cập nhật được cơ hội.');
    } finally {
      setSaving(false);
    }
  }

  const primaryPhone = selected?.contacts.find((contact) => contact.type === 'PHONE')?.value ?? '';
  const primaryEmail = selected?.contacts.find((contact) => contact.type === 'EMAIL')?.value ?? '';

  return (
    <section className="dashboard-content customer-page">
      <header>
        <div>
          <p className="eyebrow">ĐỢT 02 · KHÁCH HÀNG & CƠ HỘI</p>
          <h1>Hồ sơ khách hàng</h1>
        </div>
        <div className="header-actions">
          <button className="ghost" onClick={() => setShowCreate((current) => !current)}>
            {showCreate ? 'Đóng biểu mẫu' : '+ Thêm khách'}
          </button>
          <button className="ghost" onClick={onLogout} disabled={loggingOut}>
            Đăng xuất
          </button>
        </div>
      </header>

      {message && <div className="success-message">{message}</div>}
      {error && <div className="error-message">{error}</div>}
      {duplicates.length > 0 && (
        <div className="duplicate-warning">
          <b>Cần kiểm tra trùng, hệ thống không tự gộp:</b>
          {duplicates.map((candidate) => (
            <button key={candidate.id} onClick={() => selectCustomer(candidate.id)}>
              {candidate.customerCode} · {candidate.displayName} —{' '}
              {candidate.matchReasons.map((reason) => matchReason[reason] ?? reason).join(', ')}
            </button>
          ))}
        </div>
      )}

      {showCreate && (
        <form className="panel-form create-customer" onSubmit={createCustomer}>
          <div className="section-heading">
            <div>
              <p className="eyebrow">HỒ SƠ MỚI</p>
              <h2>Tạo khách hàng</h2>
            </div>
            <span>Tên giống nhau vẫn được lưu riêng</span>
          </div>
          <div className="form-grid three">
            <label>
              Tên khách *<input name="displayName" minLength={2} required />
            </label>
            <label>
              Nhóm *
              <select name="groupCode" defaultValue="retail" required>
                {groups.map((group) => (
                  <option key={group.code} value={group.code}>
                    {group.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Nguồn khách
              <input name="source" placeholder="Cửa hàng, Facebook, Zalo…" />
            </label>
            <label>
              Số điện thoại
              <input name="phone" inputMode="tel" />
            </label>
            <label>
              Email
              <input name="email" type="email" />
            </label>
            <label className="check-label">
              <input name="marketingConsent" type="checkbox" /> Đồng ý nhận marketing
            </label>
            <label className="wide">
              Ghi chú
              <textarea name="notes" rows={2} />
            </label>
          </div>
          <div className="subform-title">Địa chỉ đầu tiên (không bắt buộc)</div>
          <div className="form-grid three">
            <label>
              Địa chỉ
              <input name="line1" />
            </label>
            <label>
              Quận/huyện
              <input name="district" />
            </label>
            <label>
              Tỉnh/thành
              <input name="province" />
            </label>
          </div>
          <button className="primary compact" disabled={saving}>
            {saving ? 'Đang lưu…' : 'Tạo hồ sơ'}
          </button>
        </form>
      )}

      <div className="customer-layout">
        <section className="customer-list-panel">
          <form
            className="search-row"
            onSubmit={(event) => {
              event.preventDefault();
              void loadCustomers(query);
            }}
          >
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Tên, mã, điện thoại hoặc email"
            />
            <button className="ghost">Tìm</button>
          </form>
          <div className="list-caption">
            <span>{customers.length} hồ sơ</span>
            {query && (
              <button
                onClick={() => {
                  setQuery('');
                  void loadCustomers('');
                }}
              >
                Xóa lọc
              </button>
            )}
          </div>
          {loading ? (
            <div className="empty-state">Đang tải khách hàng…</div>
          ) : customers.length === 0 ? (
            <div className="empty-state">
              <b>Chưa có khách phù hợp.</b>
              <span>Tạo hồ sơ đầu tiên hoặc đổi từ khóa tìm kiếm.</span>
            </div>
          ) : (
            <div className="customer-list">
              {customers.map((customer) => (
                <button
                  key={customer.id}
                  className={selected?.id === customer.id ? 'selected' : ''}
                  onClick={() => selectCustomer(customer.id)}
                >
                  <span className="customer-avatar">{customer.displayName.slice(0, 1)}</span>
                  <span>
                    <b>{customer.displayName}</b>
                    <small>
                      {customer.customerCode} · {customer.group.name}
                    </small>
                    <small>{customer.contacts[0]?.value ?? 'Chưa có liên hệ'}</small>
                  </span>
                  <i>{customer._count.tasks}</i>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="customer-detail-panel">
          {!selected ? (
            <div className="empty-state large">
              <b>Chọn một khách hàng</b>
              <span>Hồ sơ, địa chỉ, việc nhắc và cơ hội sẽ hiển thị tại đây.</span>
            </div>
          ) : editing ? (
            <form className="panel-form" onSubmit={updateCustomer}>
              <div className="section-heading">
                <div>
                  <p className="eyebrow">CHỈNH SỬA · VERSION {selected.version}</p>
                  <h2>{selected.customerCode}</h2>
                </div>
                <button type="button" className="text-button" onClick={() => setEditing(false)}>
                  Hủy
                </button>
              </div>
              <div className="form-grid two">
                <label>
                  Tên khách
                  <input name="displayName" defaultValue={selected.displayName} required />
                </label>
                <label>
                  Nhóm
                  <select name="groupCode" defaultValue={selected.group.code}>
                    {groups.map((group) => (
                      <option key={group.code} value={group.code}>
                        {group.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Số điện thoại
                  <input name="phone" defaultValue={primaryPhone} />
                </label>
                <label>
                  Email
                  <input name="email" type="email" defaultValue={primaryEmail} />
                </label>
                <label>
                  Nguồn
                  <input name="source" defaultValue={selected.source ?? ''} />
                </label>
                <label className="check-label">
                  <input
                    name="marketingConsent"
                    type="checkbox"
                    defaultChecked={selected.marketingConsent}
                  />{' '}
                  Đồng ý nhận marketing
                </label>
                <label className="wide">
                  Ghi chú
                  <textarea name="notes" defaultValue={selected.notes ?? ''} rows={3} />
                </label>
              </div>
              <button className="primary compact" disabled={saving}>
                Lưu thay đổi
              </button>
            </form>
          ) : (
            <>
              <div className="customer-profile-head">
                <span className="customer-avatar large">{selected.displayName.slice(0, 1)}</span>
                <div>
                  <p className="eyebrow">{selected.customerCode}</p>
                  <h2>{selected.displayName}</h2>
                  <div className="profile-tags">
                    <span>{selected.group.name}</span>
                    <span>{selected.source || 'Chưa có nguồn'}</span>
                    <span>
                      {selected.marketingConsent ? 'Có marketing consent' : 'Không marketing'}
                    </span>
                  </div>
                </div>
                <button className="ghost" onClick={() => setEditing(true)}>
                  Chỉnh sửa
                </button>
              </div>

              <div className="contact-strip">
                {selected.contacts.length ? (
                  selected.contacts.map((contact) => (
                    <div key={contact.id}>
                      <small>{contact.type === 'PHONE' ? 'Điện thoại' : 'Email'}</small>
                      <b>{contact.value}</b>
                    </div>
                  ))
                ) : (
                  <span>Chưa có thông tin liên hệ</span>
                )}
                <div>
                  <small>Phụ trách</small>
                  <b>{selected.assignedStaff?.displayName ?? staff.displayName}</b>
                </div>
              </div>

              {selected.notes && <div className="profile-note">{selected.notes}</div>}

              <div className="detail-section">
                <div className="section-heading">
                  <div>
                    <p className="eyebrow">GIAO NHẬN</p>
                    <h3>
                      Địa chỉ (
                      {selected.addresses.filter((item) => item.status === 'ACTIVE').length})
                    </h3>
                  </div>
                </div>
                <div className="address-grid">
                  {selected.addresses
                    .filter((address) => address.status === 'ACTIVE')
                    .map((address) => (
                      <article key={address.id}>
                        <b>{address.label || 'Địa chỉ'}</b>
                        {address.isDefault && <em>Mặc định</em>}
                        <p>
                          {address.line1}, {address.ward ? `${address.ward}, ` : ''}
                          {address.district ? `${address.district}, ` : ''}
                          {address.province}
                        </p>
                        <button disabled={saving} onClick={() => archiveAddress(address)}>
                          Lưu trữ
                        </button>
                      </article>
                    ))}
                </div>
                <details className="inline-create">
                  <summary>+ Thêm địa chỉ</summary>
                  <form className="form-grid three" onSubmit={addAddress}>
                    <label>
                      Nhãn
                      <input name="label" placeholder="Nhà, kho…" />
                    </label>
                    <label>
                      Người nhận
                      <input name="recipientName" />
                    </label>
                    <label>
                      Điện thoại
                      <input name="phone" />
                    </label>
                    <label>
                      Địa chỉ *<input name="line1" required />
                    </label>
                    <label>
                      Phường/xã
                      <input name="ward" />
                    </label>
                    <label>
                      Quận/huyện
                      <input name="district" />
                    </label>
                    <label>
                      Tỉnh/thành *<input name="province" required />
                    </label>
                    <label className="check-label">
                      <input name="isDefault" type="checkbox" /> Đặt làm mặc định
                    </label>
                    <button className="primary compact" disabled={saving}>
                      Lưu địa chỉ
                    </button>
                  </form>
                </details>
              </div>

              <div className="detail-columns">
                <div className="detail-section">
                  <p className="eyebrow">CHĂM SÓC</p>
                  <h3>Việc nhắc</h3>
                  <div className="activity-list">
                    {selected.tasks.map((task) => (
                      <article key={task.id} className={task.status !== 'OPEN' ? 'done' : ''}>
                        <div>
                          <b>{task.title}</b>
                          <small>{readableDate(task.dueAt)}</small>
                        </div>
                        {task.status === 'OPEN' ? (
                          <button disabled={saving} onClick={() => completeTask(task.id)}>
                            Xong
                          </button>
                        ) : (
                          <span>{task.status === 'DONE' ? 'Đã xong' : 'Đã hủy'}</span>
                        )}
                      </article>
                    ))}
                  </div>
                  <form className="mini-form" onSubmit={createTask}>
                    <input name="title" placeholder="Nội dung nhắc việc" required />
                    <input name="dueAt" type="datetime-local" />
                    <button className="ghost" disabled={saving}>
                      Thêm
                    </button>
                  </form>
                </div>

                <div className="detail-section">
                  <p className="eyebrow">BÁN HÀNG</p>
                  <h3>Cơ hội</h3>
                  <div className="activity-list">
                    {selected.opportunities.map((opportunity) => (
                      <article key={opportunity.id}>
                        <div>
                          <b>{opportunity.title}</b>
                          <small>
                            {opportunity.kind === 'REPEAT_PURCHASE' ? 'Mua lại' : 'Mua lần đầu'} ·{' '}
                            {opportunity.stage}
                          </small>
                        </div>
                        {opportunity.stage === 'NEW' && (
                          <button
                            disabled={saving}
                            onClick={() => advanceOpportunity(opportunity.id, 'QUALIFIED')}
                          >
                            Đủ điều kiện
                          </button>
                        )}
                        {opportunity.stage === 'QUALIFIED' && (
                          <button
                            disabled={saving}
                            onClick={() => advanceOpportunity(opportunity.id, 'WON')}
                          >
                            Chốt thắng
                          </button>
                        )}
                      </article>
                    ))}
                  </div>
                  <form className="mini-form opportunity-form" onSubmit={createOpportunity}>
                    <input name="title" placeholder="Tên cơ hội" required />
                    <select name="kind" defaultValue="FIRST_PURCHASE">
                      <option value="FIRST_PURCHASE">Mua lần đầu</option>
                      <option value="REPEAT_PURCHASE">Mua lại</option>
                    </select>
                    <input name="note" placeholder="Ghi chú" />
                    <button className="ghost" disabled={saving}>
                      Mở cơ hội
                    </button>
                  </form>
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </section>
  );
}
