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
  _count: { addresses: number; tasks?: number; opportunities?: number };
};

type CustomerDetail = CustomerSummary & {
  legalName?: string | null;
  taxCode?: string | null;
  notes?: string | null;
  createdAt: string;
  addresses: Address[];
  capabilities: { tasks: boolean; opportunities: boolean; identities?: boolean };
  linkedIdentities: Array<{
    id: string;
    provider: string;
    accountName: string;
    accountIdMasked: string;
    displayName: string | null;
    externalUserIdMasked: string;
    linkedAt: string | null;
    linkedBy: string | null;
    version: number;
  }>;
  linkedConversations: Array<{
    id: string;
    status: string;
    lastMessageAt: string | null;
    identity: { displayName: string | null; externalUserId: string } | null;
    connection: { provider: string; displayName: string };
    messages: Array<{ body: string | null; contentType: string; providerAt: string }>;
  }>;
  tasks?: Array<{
    id: string;
    title: string;
    description?: string | null;
    dueAt?: string | null;
    status: 'OPEN' | 'DONE' | 'CANCELED';
  }>;
  opportunities?: Array<{
    id: string;
    title: string;
    kind: 'FIRST_PURCHASE' | 'REPEAT_PURCHASE';
    stage: 'NEW' | 'QUALIFIED' | 'WON' | 'LOST';
    note?: string | null;
    updatedAt: string;
  }>;
};

type TimelineItem = {
  id: string;
  sourceId: string;
  type: 'NOTE' | 'TASK' | 'OPPORTUNITY' | 'QUOTE' | 'ORDER' | 'PAYMENT';
  title: string;
  detail: string;
  occurredAt: string;
  amountVnd?: string;
  dueAt?: string | null;
  receivedAt?: string;
};

type CustomerTimeline = {
  items: TimelineItem[];
  nextCursor: string | null;
  hasMore: boolean;
  capabilities: {
    notes: boolean;
    canWriteNotes: boolean;
    tasks: boolean;
    opportunities: boolean;
    quotes: boolean;
    orders: boolean;
    payments: boolean;
  };
};

type DuplicateCandidate = {
  id: string;
  customerCode: string;
  displayName: string;
  matchReasons: string[];
};

type Group = { id: string; code: string; name: string; description?: string | null };
type DuplicateSuggestion = {
  id: string;
  evidence: { fields: string[] };
  status: string;
  customerA: { id: string; customerCode: string; displayName: string; version: number };
  customerB: { id: string; customerCode: string; displayName: string; version: number };
};
type MergePreview = {
  source: {
    id: string;
    customerCode: string;
    displayName: string;
    version: number;
    contacts: Array<{ type: string; value: string }>;
  };
  target: {
    id: string;
    customerCode: string;
    displayName: string;
    version: number;
    contacts: Array<{ type: string; value: string }>;
  };
  relationCounts: Record<string, number>;
  profileDifferences: string[];
  blockers: string[];
  canMerge: boolean;
};

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

const timelineTypeLabel: Record<TimelineItem['type'], string> = {
  NOTE: 'Ghi chú nội bộ',
  TASK: 'Việc nhắc',
  OPPORTUNITY: 'Cơ hội bán hàng',
  QUOTE: 'Báo giá',
  ORDER: 'Đơn hàng',
  PAYMENT: 'Phiếu thu',
};

const timelineStatusLabel: Record<string, string> = {
  OPEN: 'Đang mở',
  DONE: 'Đã hoàn thành',
  CANCELED: 'Đã hủy',
  NEW: 'Mới',
  QUALIFIED: 'Đủ điều kiện',
  WON: 'Thắng',
  LOST: 'Thất bại',
  FIRST_PURCHASE: 'Mua lần đầu',
  REPEAT_PURCHASE: 'Mua lại',
  DRAFT: 'Đơn nháp',
  SENT: 'Đã gửi',
  ACCEPTED: 'Đã chấp nhận',
  CONVERTED: 'Đã chuyển đơn',
  EXPIRED: 'Hết hạn',
};

function readableTimelineDetail(detail: string) {
  return detail
    .split(':')
    .map((part) => timelineStatusLabel[part] ?? part)
    .join(' · ');
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
  const [timeline, setTimeline] = useState<CustomerTimeline | null>(null);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [duplicateSuggestions, setDuplicateSuggestions] = useState<DuplicateSuggestion[]>([]);
  const [decisionReason, setDecisionReason] = useState('');
  const [mergeTargetId, setMergeTargetId] = useState('');
  const [mergePreview, setMergePreview] = useState<MergePreview | null>(null);
  const [mergeCommandKey, setMergeCommandKey] = useState('');

  const loadDetail = useCallback(async (id: string) => {
    const [detail, activity] = await Promise.all([
      api<CustomerDetail>(`/customers/${id}`),
      api<CustomerTimeline>(`/customers/${id}/timeline`),
    ]);
    setSelected(detail);
    setTimeline(activity);
  }, []);

  async function loadMoreTimeline() {
    if (!selected || !timeline?.nextCursor || timelineLoading) return;
    setTimelineLoading(true);
    try {
      const page = await api<CustomerTimeline>(
        `/customers/${selected.id}/timeline?cursor=${encodeURIComponent(timeline.nextCursor)}`,
      );
      setTimeline((current) =>
        current ? { ...page, items: [...current.items, ...page.items] } : page,
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không tải thêm được hoạt động.');
    } finally {
      setTimelineLoading(false);
    }
  }

  async function addProfileNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    setSaving(true);
    const form = new FormData(event.currentTarget);
    try {
      await api(`/customers/${selected.id}/notes`, {
        method: 'POST',
        body: JSON.stringify({ content: value(form, 'profileNote') }),
      });
      await loadDetail(selected.id);
      event.currentTarget.reset();
      setMessage('Đã lưu ghi chú nội bộ vào hồ sơ khách.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không lưu được ghi chú.');
    } finally {
      setSaving(false);
    }
  }

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
        const suggestions = await api<DuplicateSuggestion[]>('/customers/duplicate-suggestions');
        if (active) setDuplicateSuggestions(suggestions);
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

  async function refreshDuplicateSuggestions() {
    const rows = await api<DuplicateSuggestion[]>('/customers/duplicate-suggestions');
    setDuplicateSuggestions(rows);
  }

  async function scanSelectedDuplicates() {
    if (!selected) return;
    setSaving(true);
    setError('');
    try {
      await api(`/customers/${selected.id}/duplicate-suggestions/scan`, {
        method: 'POST',
        body: JSON.stringify({ version: selected.version }),
      });
      await refreshDuplicateSuggestions();
      setMessage(
        'Đã rà theo phone/email chuẩn hóa và tên kèm địa chỉ đầy đủ; không tự liên kết hoặc gộp.',
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không quét được hồ sơ nghi trùng.');
    } finally {
      setSaving(false);
    }
  }

  async function decideSuggestion(
    suggestion: DuplicateSuggestion,
    decision: 'CONFIRM_SAME' | 'REJECT',
  ) {
    if (decision === 'REJECT' && !decisionReason.trim()) {
      setError('Hãy ghi lý do xác nhận hai hồ sơ khác người.');
      return;
    }
    setSaving(true);
    try {
      await api(`/customers/duplicate-suggestions/${suggestion.id}/decision`, {
        method: 'POST',
        body: JSON.stringify({
          decision,
          versionA: suggestion.customerA.version,
          versionB: suggestion.customerB.version,
          ...(decision === 'REJECT' ? { reason: decisionReason.trim() } : {}),
        }),
      });
      await refreshDuplicateSuggestions();
      setDecisionReason('');
      setMessage(
        decision === 'CONFIRM_SAME'
          ? 'Đã xác nhận cùng người; hồ sơ chưa bị gộp.'
          : 'Đã ghi quyết định khác người.',
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không lưu được quyết định.');
    } finally {
      setSaving(false);
    }
  }

  async function previewMerge() {
    if (!selected || !mergeTargetId) return;
    setSaving(true);
    setError('');
    try {
      const preview = await api<MergePreview>(`/customers/${selected.id}/merge-preview`, {
        method: 'POST',
        body: JSON.stringify({ targetCustomerId: mergeTargetId }),
      });
      setMergePreview(preview);
      setMergeCommandKey(crypto.randomUUID());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không tạo được bản xem trước gộp.');
    } finally {
      setSaving(false);
    }
  }

  async function confirmMerge() {
    if (!selected || !mergePreview?.canMerge || !mergeCommandKey) return;
    if (
      !window.confirm(
        `Gộp ${mergePreview.source.customerCode} vào ${mergePreview.target.customerCode}? Hồ sơ nguồn sẽ được giữ dấu vết nhưng không còn là khách đang hoạt động.`,
      )
    )
      return;
    setSaving(true);
    setError('');
    try {
      await api(`/customers/${selected.id}/merge`, {
        method: 'POST',
        headers: { 'idempotency-key': mergeCommandKey },
        body: JSON.stringify({
          targetCustomerId: mergePreview.target.id,
          sourceVersion: mergePreview.source.version,
          targetVersion: mergePreview.target.version,
        }),
      });
      setMergePreview(null);
      setMergeCommandKey('');
      setMergeTargetId('');
      await loadCustomers('');
      await refreshDuplicateSuggestions();
      setMessage('Đã gộp hồ sơ; lịch sử chứng từ và snapshot được giữ nguyên.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không gộp được hồ sơ.');
    } finally {
      setSaving(false);
    }
  }

  async function unlinkSocialIdentity(identity: CustomerDetail['linkedIdentities'][number]) {
    if (!selected) return;
    setSaving(true);
    setError('');
    try {
      await api(`/integrations/identities/${identity.id}/unlink-customer`, {
        method: 'POST',
        body: JSON.stringify({
          expectedVersion: identity.version,
          expectedCustomerId: selected.id,
        }),
      });
      await loadDetail(selected.id);
      setMessage('Đã gỡ liên kết; identity và hội thoại gốc vẫn được giữ.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không gỡ được tài khoản liên kết.');
    } finally {
      setSaving(false);
    }
  }

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
          legalName: value(form, 'legalName') || undefined,
          taxCode: value(form, 'taxCode') || undefined,
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
      await loadDetail(result.customer.id);
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
          legalName: value(form, 'legalName'),
          taxCode: value(form, 'taxCode'),
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
          <p className="eyebrow">KHÁCH HÀNG & CƠ HỘI</p>
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
      {duplicateSuggestions.length > 0 && (
        <section className="duplicate-warning" aria-label="Khách hàng nghi trùng">
          <b>Hồ sơ nghi trùng ({duplicateSuggestions.length}) · cần người xác nhận</b>
          {duplicateSuggestions.map((suggestion) => (
            <article key={suggestion.id}>
              <p>
                {suggestion.customerA.customerCode} · {suggestion.customerA.displayName} ↔{' '}
                {suggestion.customerB.customerCode} · {suggestion.customerB.displayName}
              </p>
              <small>
                Bằng chứng: {suggestion.evidence.fields.join(', ')}. Không tự liên kết/gộp.
              </small>
              {staff.permissions.includes('customers.write') && (
                <div className="header-actions">
                  <button
                    className="secondary"
                    disabled={saving}
                    onClick={() => void decideSuggestion(suggestion, 'CONFIRM_SAME')}
                  >
                    Cùng một khách
                  </button>
                  <input
                    aria-label="Lý do đánh dấu khác người"
                    value={decisionReason}
                    onChange={(event) => setDecisionReason(event.target.value)}
                    placeholder="Lý do khác người"
                    maxLength={500}
                  />
                  <button
                    className="ghost"
                    disabled={saving || !decisionReason.trim()}
                    onClick={() => void decideSuggestion(suggestion, 'REJECT')}
                  >
                    Khác người
                  </button>
                </div>
              )}
            </article>
          ))}
        </section>
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
              <input name="source" placeholder="Cửa hàng, Facebook, Zalo, Shopee, TikTok…" />
              <small>Facebook/Zalo tự xếp khách sỉ; Shopee/TikTok tự xếp khách lẻ.</small>
            </label>
            <label>
              Số điện thoại
              <input name="phone" inputMode="tel" />
            </label>
            <label>
              Email
              <input name="email" type="email" />
            </label>
            <label>
              Tên tổ chức / pháp lý
              <input name="legalName" />
            </label>
            <label>
              Mã số thuế
              <input name="taxCode" />
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
                  Tên tổ chức / pháp lý
                  <input name="legalName" defaultValue={selected.legalName ?? ''} />
                </label>
                <label>
                  Mã số thuế
                  <input name="taxCode" defaultValue={selected.taxCode ?? ''} />
                </label>
                <label>
                  Nguồn
                  <input name="source" defaultValue={selected.source ?? ''} />
                  <small>Facebook/Zalo là khách sỉ; Shopee/TikTok là khách lẻ.</small>
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
                  <b>{selected.assignedStaff?.displayName ?? 'Chưa phân công'}</b>
                </div>
                <div>
                  <small>Người đang xem</small>
                  <b>{staff.displayName}</b>
                </div>
              </div>

              {(selected.legalName || selected.taxCode) && (
                <div className="contact-strip legal-profile-fields">
                  {selected.legalName && (
                    <div>
                      <small>Tên pháp lý</small>
                      <b>{selected.legalName}</b>
                    </div>
                  )}
                  {selected.taxCode && (
                    <div>
                      <small>Mã số thuế</small>
                      <b>{selected.taxCode}</b>
                    </div>
                  )}
                </div>
              )}

              {selected.notes && (
                <div className="profile-note">
                  <b>Ghi chú hồ sơ hiện tại</b>
                  <p>{selected.notes}</p>
                  <small>Trường thông tin hiện tại; không phải lịch sử thay đổi.</small>
                </div>
              )}

              {selected.capabilities.identities && (
                <div className="detail-section">
                  <div className="section-heading">
                    <div>
                      <p className="eyebrow">SOCIAL · THEO TỪNG ACCOUNT</p>
                      <h3>Tài khoản liên kết ({selected.linkedIdentities.length})</h3>
                    </div>
                  </div>
                  {selected.linkedIdentities.length ? (
                    <div className="activity-list">
                      {selected.linkedIdentities.map((identity) => (
                        <article key={identity.id}>
                          <div>
                            <b>
                              {identity.provider} · {identity.displayName || 'Khách social'}
                            </b>
                            <small>
                              {identity.accountName} ({identity.accountIdMasked}) · ID{' '}
                              {identity.externalUserIdMasked}
                            </small>
                            <small>
                              {identity.linkedAt
                                ? readableDate(identity.linkedAt)
                                : 'Chưa có thời điểm xác nhận'}{' '}
                              · {identity.linkedBy || 'Không rõ người xác nhận'}
                            </small>
                          </div>
                          {staff.permissions.includes('integrations.customer.link') && (
                            <button
                              className="ghost"
                              disabled={saving}
                              onClick={() => void unlinkSocialIdentity(identity)}
                            >
                              Gỡ liên kết
                            </button>
                          )}
                        </article>
                      ))}
                    </div>
                  ) : (
                    <p>Chưa liên kết tài khoản social.</p>
                  )}
                  {selected.linkedConversations.length > 0 && (
                    <div className="activity-list">
                      {selected.linkedConversations.map((conversation) => (
                        <article key={conversation.id}>
                          <div>
                            <b>
                              {conversation.connection.provider} ·{' '}
                              {conversation.connection.displayName}
                            </b>
                            <small>
                              Hội thoại riêng:{' '}
                              {conversation.identity?.displayName ||
                                conversation.identity?.externalUserId ||
                                'Khách social'}{' '}
                              · {conversation.status}
                            </small>
                            <small>
                              {conversation.messages[0]?.body || 'Tin nhắn đính kèm'} ·{' '}
                              {readableDate(conversation.lastMessageAt)}
                            </small>
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                  <small>
                    Các hội thoại vẫn tách biệt theo Page/OA, không thể gửi trả lời từ màn hình này.
                  </small>
                </div>
              )}

              {staff.permissions.includes('customers.merge') && (
                <div className="detail-section">
                  <div className="section-heading">
                    <div>
                      <p className="eyebrow">THAO TÁC CÓ AUDIT</p>
                      <h3>Gộp hồ sơ sau khi kiểm tra</h3>
                    </div>
                  </div>
                  <label>
                    Hồ sơ đích (thông tin hiện tại của hồ sơ đích sẽ được giữ)
                    <select
                      value={mergeTargetId}
                      onChange={(event) => {
                        setMergeTargetId(event.target.value);
                        setMergePreview(null);
                      }}
                    >
                      <option value="">Chọn khách đích…</option>
                      {customers
                        .filter((item) => item.id !== selected.id)
                        .map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.customerCode} · {item.displayName}
                          </option>
                        ))}
                    </select>
                  </label>
                  <button
                    className="secondary"
                    disabled={saving || !mergeTargetId}
                    onClick={() => void previewMerge()}
                  >
                    Xem trước quan hệ và khác biệt
                  </button>
                  {mergePreview && (
                    <div className="profile-note">
                      <b>
                        {mergePreview.source.displayName} → {mergePreview.target.displayName}
                      </b>
                      <p>
                        Trường khác nhau: {mergePreview.profileDifferences.join(', ') || 'không có'}{' '}
                        · giữ thông tin hồ sơ đích.
                      </p>
                      <p>
                        Quan hệ được chuyển:{' '}
                        {Object.entries(mergePreview.relationCounts)
                          .map(([key, count]) => `${key}: ${count}`)
                          .join(' · ') || 'không có quan hệ'}
                      </p>
                      <p>
                        Hồ sơ nguồn sẽ giữ trạng thái đã gộp để truy xuất; snapshot báo giá/đơn và
                        sổ kho/tiền không đổi.
                      </p>
                      {mergePreview.blockers.map((blocker) => (
                        <p key={blocker} role="alert">
                          {blocker}
                        </p>
                      ))}
                      <button
                        className="primary compact"
                        disabled={saving || !mergePreview.canMerge}
                        onClick={() => void confirmMerge()}
                      >
                        Xác nhận gộp · không thể hoàn tác tự động
                      </button>
                    </div>
                  )}
                </div>
              )}

              <div className="detail-section customer-timeline">
                <div className="section-heading">
                  <div>
                    <p className="eyebrow">HỒ SƠ 360°</p>
                    <h3>Lịch sử hoạt động</h3>
                  </div>
                  {staff.permissions.includes('customers.read') && (
                    <button
                      className="secondary"
                      disabled={saving}
                      onClick={() => void scanSelectedDuplicates()}
                    >
                      Rà hồ sơ nghi trùng
                    </button>
                  )}
                </div>
                {timeline?.capabilities.canWriteNotes && (
                  <form className="mini-form" onSubmit={addProfileNote}>
                    <input
                      name="profileNote"
                      maxLength={2000}
                      placeholder="Ghi chú nội bộ cho khách"
                      required
                    />
                    <button className="ghost" disabled={saving}>
                      {saving ? 'Đang lưu…' : 'Thêm ghi chú'}
                    </button>
                  </form>
                )}
                {timelineLoading && !timeline ? (
                  <div className="empty-state">Đang tải lịch sử…</div>
                ) : timeline?.items.length ? (
                  <>
                    <div className="activity-list timeline-list">
                      {timeline.items.map((item) => (
                        <article key={`${item.type}:${item.id}`}>
                          <div>
                            <b>{item.title}</b>
                            <small>
                              {timelineTypeLabel[item.type]} · {readableTimelineDetail(item.detail)}{' '}
                              · {readableDate(item.occurredAt)}
                            </small>
                            <small>Mã nguồn: {item.sourceId}</small>
                          </div>
                          {item.amountVnd && (
                            <strong>
                              {item.type === 'PAYMENT' ? 'Đã thu: ' : 'Tổng chứng từ: '}
                              {new Intl.NumberFormat('vi-VN').format(BigInt(item.amountVnd))} ₫
                            </strong>
                          )}
                          {item.receivedAt && (
                            <small>Ngày thực thu: {readableDate(item.receivedAt)}</small>
                          )}
                        </article>
                      ))}
                    </div>
                    {timeline.hasMore && (
                      <button
                        className="ghost"
                        onClick={() => void loadMoreTimeline()}
                        disabled={timelineLoading}
                      >
                        {timelineLoading ? 'Đang tải…' : 'Tải hoạt động cũ hơn'}
                      </button>
                    )}
                  </>
                ) : (
                  <div className="empty-state">
                    Chưa có hoạt động được lưu trong module bạn được phép xem.
                  </div>
                )}
                <small>
                  Đơn nháp hiển thị riêng là đơn nháp; không được tính là khách đã mua hay doanh
                  thu.
                </small>
              </div>

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
                {selected.capabilities.tasks && (
                  <div className="detail-section">
                    <p className="eyebrow">CHĂM SÓC</p>
                    <h3>Việc nhắc</h3>
                    <div className="activity-list">
                      {(selected.tasks ?? []).map((task) => (
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
                )}

                {selected.capabilities.opportunities && (
                  <div className="detail-section">
                    <p className="eyebrow">BÁN HÀNG</p>
                    <h3>Cơ hội</h3>
                    <div className="activity-list">
                      {(selected.opportunities ?? []).map((opportunity) => (
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
                )}
              </div>
            </>
          )}
        </section>
      </div>
    </section>
  );
}
