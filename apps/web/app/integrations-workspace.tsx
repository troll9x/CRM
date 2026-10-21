'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { api, type Staff } from './api-client';

type Connection = {
  id: string;
  provider: string;
  externalAccountIdMasked: string;
  displayName: string;
  status: string;
  capabilities: Record<string, string> | null;
  lastSyncAt: string | null;
  lastErrorCode: string | null;
  webhookEventObserved: boolean;
};
type ProviderPreflight = {
  provider: string;
  configuration: 'INCOMPLETE' | 'PRESENT';
  missingConfiguration: string[];
  authorization: string;
  canStartAuthorization: boolean;
  explanation: string;
};
type ChannelAttempt = {
  id: string;
  status: string;
  expiresAt: string;
  accounts: Array<{ id: string; name: string; tasks: string[] }>;
  errorCode: string | null;
};
type PageStaffAccess = { staffId: string; canRead: boolean; canSend: boolean };
type FacebookGrants = {
  status: string;
  checkedAt?: string;
  permissions?: {
    pages_messaging: boolean;
    pages_read_user_content: boolean;
    pages_manage_engagement: boolean;
  };
  tasks?: { messaging: boolean; moderation: boolean };
};
type Customer = {
  id: string;
  customerCode: string;
  displayName: string;
  group: { code: string; name: string };
};
type Conversation = {
  id: string;
  connectionId: string;
  status: string;
  unreadAt: string | null;
  lastMessageAt: string | null;
  connection: { provider: string; displayName: string };
  identity: {
    id: string;
    externalUserId: string;
    displayName: string | null;
    customerId: string | null;
    version: number;
  } | null;
  assignedStaff: { id: string; displayName: string } | null;
  messages: Array<{
    body: string | null;
    contentType: string;
    providerAt: string;
    importJobId: string | null;
  }>;
  notes: Array<{ body: string; createdAt: string; createdBy: { displayName: string } }>;
};
type ConversationMessage = {
  id: string;
  direction: string;
  contentType: string;
  body: string | null;
  mediaMetadata: unknown;
  providerAt: string;
  importJobId: string | null;
};
type ConversationMessagePage = {
  items: ConversationMessage[];
  nextCursor: string | null;
};
type SendCapability = { status: string; canSend: boolean };
type SocialOutbound = {
  id: string;
  kind: string;
  status: string;
  body: string;
  errorCode: string | null;
  providerObjectId: string | null;
  createdAt: string;
  acceptedAt: string | null;
};
type ExternalOrder = {
  id: string;
  externalOrderId: string;
  sourceStatus: string;
  normalizedStatus: string;
  currency: string;
  totalAmount: string | null;
  providerCreatedAt: string | null;
  recipientSnapshot: unknown;
  connection: { provider: string; displayName: string };
  customer: Customer | null;
  lines: Array<{
    id: string;
    titleSnapshot: string;
    sourceSku: string | null;
    quantity: string;
    sourceUnit: string | null;
    lineAmount: string | null;
    variant: { sku: string; name: string } | null;
  }>;
};
type Job = {
  id: string;
  kind: string;
  status: string;
  providerObjectId: string | null;
  attempts: number;
  maxAttempts: number;
  lastErrorCode: string | null;
  receivedAt: string;
  connectionId: string;
};
type Backfill = {
  id: string;
  connectionId: string;
  dataset: 'MESSAGES' | 'COMMENTS';
  since: string;
  until: string;
  status: string;
  phase: string;
  pageLimit: number;
  pagesFetched: number;
  lastErrorCode: string | null;
  lastProgressAt: string | null;
  progress: {
    discovered: number;
    fetched: number;
    inserted: number;
    updated: number;
    skipped: number;
    duplicates?: number;
    failed: number;
  };
};
type BackfillPreflight = {
  dataset: 'MESSAGES' | 'COMMENTS';
  status: string;
  checkedEdge: string;
  providerCode?: number;
  providerSubcode?: number;
};
type SocialComment = {
  id: string;
  connectionId: string;
  externalCommentId: string;
  externalPostId: string;
  externalParentId: string | null;
  externalAuthorId: string | null;
  authorDisplayName: string | null;
  body: string | null;
  sourceUrl: string | null;
  status: string;
  providerAt: string;
  importJobId: string | null;
  connection: { provider: string; displayName: string };
};
type SocialTicket = {
  id: string;
  conversationId: string | null;
  commentId: string | null;
  kind: string;
  priority: string;
  status: string;
  summary: string;
  labels: string[];
  version: number;
  updatedAt: string;
  sourceUrl: string | null;
  assignedStaff: { id: string; displayName: string } | null;
  createdBy: { displayName: string };
  events: Array<{ id: string; action: string; createdAt: string; actor: { displayName: string } }>;
  conversation: {
    connectionId: string;
    identity: { displayName: string | null; customerId: string | null } | null;
    connection: { provider: string; displayName: string };
  } | null;
  comment: {
    connectionId: string;
    authorDisplayName: string | null;
    externalPostId: string;
    connection: { provider: string; displayName: string };
  } | null;
};
type Product = {
  id: string;
  name: string;
  variants: Array<{ id: string; sku: string; name: string; baseUnitName: string }>;
};
type Props = {
  staff: Staff;
  onLogout: () => void;
  loggingOut: boolean;
  onCreateQuote?: (source: {
    customerId: string;
    conversationId: string;
    accountName: string;
  }) => void;
};

type IdentityPreview = {
  identity: {
    id: string;
    provider: string;
    account: string;
    externalUserIdMasked: string;
    displayName: string | null;
    currentCustomer: { id: string; customerCode: string; displayName: string } | null;
    version: number;
  };
  targetCustomer: { id: string; customerCode: string; displayName: string; version: number };
  requiresExplicitTransfer: boolean;
};

const providerNames: Record<string, string> = {
  FACEBOOK: 'Facebook Fanpage',
  ZALO: 'Zalo OA',
  SHOPEE: 'Shopee',
  TIKTOK_SHOP: 'TikTok Shop',
};
const socialDateTime = (value: string) =>
  new Date(value).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
const socialDate = (value: string) =>
  new Date(value).toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });

export function facebookConnectionHint(connection: Connection): string | null {
  if (connection.provider !== 'FACEBOOK' || connection.status !== 'CONNECTED') return null;
  if (
    connection.capabilities?.webhookSubscription === 'APP_CONFIGURATION_PENDING' &&
    !connection.webhookEventObserved
  )
    return 'Page đã được cấp quyền, nhưng CRM chưa xác nhận được sự kiện Facebook thực tế. Hãy kiểm tra trạng thái phát hành app, URL webhook HTTPS và nhật ký đồng bộ.';
  if (!connection.webhookEventObserved)
    return 'Page đã được cấp quyền. CRM chưa ghi nhận sự kiện đồng bộ nào.';
  return null;
}

export function IntegrationsWorkspace({ staff, onLogout, loggingOut, onCreateQuote }: Props) {
  const [tab, setTab] = useState<'connections' | 'social' | 'orders' | 'jobs' | 'mapping'>(
    'connections',
  );
  const [connections, setConnections] = useState<Connection[]>([]);
  const [providerPreflight, setProviderPreflight] = useState<ProviderPreflight[]>([]);
  const [facebookGrants, setFacebookGrants] = useState<Record<string, FacebookGrants>>({});
  const [channelAttempt, setChannelAttempt] = useState<ChannelAttempt | null>(null);
  const [attemptProvider, setAttemptProvider] = useState<'facebook' | 'zalo'>('facebook');
  const [selectedPage, setSelectedPage] = useState('');
  const [selectedFacebookPages, setSelectedFacebookPages] = useState<string[]>([]);
  const [selectedFacebookConnectionId, setSelectedFacebookConnectionId] = useState('');
  const [staffOptions, setStaffOptions] = useState<Array<{ id: string; displayName: string }>>([]);
  const [pageStaffAccess, setPageStaffAccess] = useState<Record<string, PageStaffAccess[]>>({});
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [openConversationId, setOpenConversationId] = useState<string | null>(null);
  const [messagePages, setMessagePages] = useState<Record<string, ConversationMessagePage>>({});
  const [messageLoading, setMessageLoading] = useState(false);
  const [orders, setOrders] = useState<ExternalOrder[]>([]);
  const [comments, setComments] = useState<SocialComment[]>([]);
  const [tickets, setTickets] = useState<SocialTicket[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [backfills, setBackfills] = useState<Backfill[]>([]);
  const [backfillPreflight, setBackfillPreflight] = useState<BackfillPreflight | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [identityTargets, setIdentityTargets] = useState<Record<string, string>>({});
  const [identityPreviews, setIdentityPreviews] = useState<Record<string, IdentityPreview>>({});
  const facebookConnections = connections.filter(
    (connection) => connection.provider === 'FACEBOOK' && connection.status === 'CONNECTED',
  );
  const connectedFacebook = facebookConnections.find(
    (connection) => connection.id === selectedFacebookConnectionId,
  );

  const refresh = useCallback(async () => {
    setError('');
    setLoading(true);
    try {
      const [c, i, cm, t, o, j, b] = await Promise.all([
        api<Connection[]>('/integrations/connections'),
        api<Conversation[]>('/integrations/inbox?limit=100'),
        api<SocialComment[]>('/integrations/comments?limit=100'),
        api<SocialTicket[]>('/integrations/tickets'),
        api<ExternalOrder[]>('/integrations/orders?limit=100'),
        staff.permissions.includes('connectors.manage')
          ? api<Job[]>('/integrations/jobs?limit=100')
          : Promise.resolve([]),
        staff.permissions.includes('connectors.manage')
          ? api<Backfill[]>('/integrations/facebook/backfills')
          : Promise.resolve([]),
      ]);
      setConnections(c);
      if (staff.permissions.includes('connectors.manage')) {
        const preflight = await api<ProviderPreflight[]>('/integrations/providers/preflight');
        setProviderPreflight(preflight);
        setStaffOptions(
          await api<Array<{ id: string; displayName: string }>>('/integrations/assignees'),
        );
      }
      setConversations(i);
      setComments(cm);
      setTickets(t);
      setOrders(o);
      setJobs(j);
      setBackfills(b);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không tải được dữ liệu tích hợp.');
    } finally {
      setLoading(false);
    }
  }, [staff.permissions]);

  useEffect(() => {
    void Promise.resolve().then(refresh);
    void api<{ items: Customer[] }>('/customers?limit=100')
      .then((result) => setCustomers(result.items))
      .catch(() => undefined);
    if (staff.permissions.includes('integrations.mapping.manage'))
      void api<{ items: Product[] }>('/products?limit=100')
        .then((result) => setProducts(result.items))
        .catch(() => undefined);
  }, [refresh, staff.permissions]);

  useEffect(() => {
    if (!staff.permissions.includes('connectors.manage')) return;
    const current = new URL(window.location.href);
    const attemptId = current.searchParams.get('channelAttempt');
    if (!attemptId) return;
    const provider = current.searchParams.get('channelProvider') === 'ZALO' ? 'zalo' : 'facebook';
    current.searchParams.delete('channelAttempt');
    current.searchParams.delete('channelProvider');
    current.searchParams.delete('channelResult');
    window.history.replaceState(null, '', current.toString());
    void api<ChannelAttempt>(
      `/integrations/oauth/${provider}/attempts/${encodeURIComponent(attemptId)}`,
    )
      .then((attempt) => {
        setTab('connections');
        setAttemptProvider(provider);
        setChannelAttempt(attempt);
        setSelectedPage(attempt.accounts[0]?.id ?? '');
        setSelectedFacebookPages([]);
        if (attempt.status !== 'READY')
          setError(
            `Cấp quyền ${provider === 'zalo' ? 'Zalo OA' : 'Facebook'}: ${attempt.status}. ${attempt.errorCode ?? ''}`,
          );
      })
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : 'Không tải được kết quả cấp quyền.'),
      );
  }, [staff.permissions]);

  async function startFacebook(reconnectConnectionId?: string) {
    setBusy(true);
    setError('');
    try {
      const result = await api<{ authorizationUrl: string }>('/integrations/oauth/facebook/start', {
        method: 'POST',
        body: JSON.stringify(reconnectConnectionId ? { reconnectConnectionId } : {}),
      });
      const destination = new URL(result.authorizationUrl);
      if (destination.protocol !== 'https:' || destination.hostname !== 'www.facebook.com')
        throw new Error('URL cấp quyền Facebook không hợp lệ.');
      window.location.assign(destination.toString());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không mở được cấp quyền Facebook.');
      setBusy(false);
    }
  }

  async function loadPageStaffAccess(connectionId: string) {
    try {
      const rows = await api<PageStaffAccess[]>(
        `/integrations/connections/${connectionId}/staff-access`,
      );
      setPageStaffAccess((current) => ({ ...current, [connectionId]: rows }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không tải được phân quyền tài khoản kênh.');
    }
  }

  async function savePageStaffAccess(
    connectionId: string,
    staffId: string,
    canRead: boolean,
    canSend: boolean,
  ) {
    setBusy(true);
    setError('');
    try {
      await api(`/integrations/connections/${connectionId}/staff-access/${staffId}`, {
        method: 'PUT',
        body: JSON.stringify({ canRead, canSend }),
      });
      await loadPageStaffAccess(connectionId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không lưu được phân quyền tài khoản kênh.');
    } finally {
      setBusy(false);
    }
  }

  async function startZalo(reconnectConnectionId?: string) {
    setBusy(true);
    setError('');
    try {
      const result = await api<{ authorizationUrl: string }>('/integrations/oauth/zalo/start', {
        method: 'POST',
        body: JSON.stringify(reconnectConnectionId ? { reconnectConnectionId } : {}),
      });
      const destination = new URL(result.authorizationUrl);
      if (destination.protocol !== 'https:' || destination.hostname !== 'oauth.zaloapp.com')
        throw new Error('URL cấp quyền Zalo OA không hợp lệ.');
      window.location.assign(destination.toString());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không mở được cấp quyền Zalo OA.');
      setBusy(false);
    }
  }

  async function finalizeFacebook() {
    if (
      !channelAttempt ||
      (attemptProvider === 'zalo' ? !selectedPage : !selectedFacebookPages.length)
    )
      return;
    setBusy(true);
    setError('');
    try {
      const result = await api<{
        displayName?: string;
        connections?: Array<{ displayName: string }>;
      }>(
        `/integrations/oauth/${attemptProvider}/attempts/${encodeURIComponent(channelAttempt.id)}/finalize`,
        {
          method: 'POST',
          body: JSON.stringify(
            attemptProvider === 'zalo'
              ? { oaId: selectedPage }
              : { pageIds: selectedFacebookPages },
          ),
        },
      );
      setNotice(
        attemptProvider === 'zalo'
          ? `Đã xác thực OA ${result.displayName}. Cần cấu hình webhook trong Zalo App và thử sự kiện thật.`
          : `Đã cấp quyền và xác nhận đăng ký ${result.connections?.length ?? 0} Page: ${result.connections?.map((page) => page.displayName).join(', ') ?? ''}. Cần xác minh webhook và tin mới trên từng Page.`,
      );
      setChannelAttempt(null);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không hoàn tất được kết nối Page.');
    } finally {
      setBusy(false);
    }
  }

  async function createConnection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setBusy(true);
    setError('');
    setNotice('');
    const form = new FormData(formElement);
    try {
      await api('/integrations/connections', {
        method: 'POST',
        body: JSON.stringify({
          provider: form.get('provider'),
          externalAccountId: form.get('externalAccountId'),
          displayName: form.get('displayName'),
        }),
      });
      formElement.reset();
      setNotice('Đã lưu tài khoản kênh ở trạng thái CẦN CẤU HÌNH; chưa có kết nối API.');
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không lưu được kết nối.');
    } finally {
      setBusy(false);
    }
  }

  async function action(path: string, method: string, body?: unknown) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await api(path, { method, ...(body ? { body: JSON.stringify(body) } : {}) });
      setNotice('Đã lưu.');
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Thao tác thất bại.');
    } finally {
      setBusy(false);
    }
  }

  async function startBackfill(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!connectedFacebook) return;
    const form = new FormData(event.currentTarget);
    const since = String(form.get('since') ?? '');
    const until = String(form.get('until') ?? '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(since) || !/^\d{4}-\d{2}-\d{2}$/.test(until)) return;
    const start = new Date(`${since}T00:00:00+07:00`);
    const end = new Date(new Date(`${until}T00:00:00+07:00`).getTime() + 86400_000);
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await api('/integrations/facebook/backfills', {
        method: 'POST',
        body: JSON.stringify({
          connectionId: connectedFacebook.id,
          dataset: form.get('dataset'),
          since: start.toISOString(),
          until: end.toISOString(),
          pageLimit: Number(form.get('pageLimit') ?? 100),
        }),
      });
      setNotice(
        'Đã tạo tác vụ nhập lịch sử. Kết quả sẽ xuất hiện theo từng batch; chưa thể kết luận Meta đã trả dữ liệu.',
      );
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không bắt đầu được nhập lịch sử Facebook.');
    } finally {
      setBusy(false);
    }
  }

  async function checkBackfillPermission(form: HTMLFormElement | null) {
    if (!connectedFacebook || !form) return;
    const dataset = String(new FormData(form).get('dataset') ?? '');
    if (dataset !== 'MESSAGES' && dataset !== 'COMMENTS') return;
    setBusy(true);
    setError('');
    setBackfillPreflight(null);
    try {
      const query = new URLSearchParams({ connectionId: connectedFacebook.id, dataset });
      setBackfillPreflight(
        await api<BackfillPreflight>(`/integrations/facebook/backfills/preflight?${query}`),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không kiểm tra được quyền đọc dữ liệu Meta.');
    } finally {
      setBusy(false);
    }
  }

  async function toggleConversationMessages(conversationId: string) {
    if (openConversationId === conversationId) {
      setOpenConversationId(null);
      return;
    }
    setOpenConversationId(conversationId);
    if (messagePages[conversationId]) return;
    setMessageLoading(true);
    setError('');
    try {
      const page = await api<ConversationMessagePage>(
        `/integrations/conversations/${conversationId}/messages?limit=50`,
      );
      setMessagePages((current) => ({ ...current, [conversationId]: page }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không tải được tin nhắn trong hội thoại.');
    } finally {
      setMessageLoading(false);
    }
  }

  async function loadOlderMessages(conversationId: string) {
    const cursor = messagePages[conversationId]?.nextCursor;
    if (!cursor) return;
    setMessageLoading(true);
    setError('');
    try {
      const page = await api<ConversationMessagePage>(
        `/integrations/conversations/${conversationId}/messages?${new URLSearchParams({ limit: '50', cursor })}`,
      );
      setMessagePages((current) => ({
        ...current,
        [conversationId]: {
          items: [...(current[conversationId]?.items ?? []), ...page.items],
          nextCursor: page.nextCursor,
        },
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không tải được tin nhắn cũ hơn.');
    } finally {
      setMessageLoading(false);
    }
  }

  async function reloadConversationMessages(conversationId: string) {
    const page = await api<ConversationMessagePage>(
      `/integrations/conversations/${conversationId}/messages?limit=50`,
    );
    setOpenConversationId(conversationId);
    setMessagePages((current) => ({ ...current, [conversationId]: page }));
  }

  async function addNote(event: FormEvent<HTMLFormElement>, conversationId: string) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const body = String(form.get('body') ?? '').trim();
    if (!body) return;
    await action(`/integrations/conversations/${conversationId}/notes`, 'POST', { body });
    formElement.reset();
  }

  async function saveMapping(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await action('/integrations/product-mappings', 'POST', {
      connectionId: form.get('connectionId'),
      externalProductId: form.get('externalProductId'),
      externalModelId: form.get('externalModelId') || undefined,
      variantId: form.get('variantId'),
      conversionFactor: Number(form.get('conversionFactor')),
    });
  }

  async function previewIdentityLink(identityId: string) {
    const customerId = identityTargets[identityId];
    if (!customerId) return;
    setBusy(true);
    setError('');
    try {
      const preview = await api<IdentityPreview>(
        `/integrations/identities/${identityId}/link-preview`,
        {
          method: 'POST',
          body: JSON.stringify({ customerId }),
        },
      );
      setIdentityPreviews((current) => ({ ...current, [identityId]: preview }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không xem trước được liên kết.');
    } finally {
      setBusy(false);
    }
  }

  async function confirmIdentityLink(identityId: string) {
    const preview = identityPreviews[identityId];
    if (!preview) return;
    const endpoint = preview.requiresExplicitTransfer
      ? `/integrations/identities/${identityId}/transfer-customer`
      : `/integrations/identities/${identityId}/link-customer`;
    await action(endpoint, 'POST', {
      customerId: preview.targetCustomer.id,
      expectedVersion: preview.identity.version,
      expectedCustomerId: preview.identity.currentCustomer?.id ?? null,
    });
    setIdentityPreviews((current) => {
      const next = { ...current };
      delete next[identityId];
      return next;
    });
  }

  return (
    <main className="integrations-workspace">
      <header>
        <div>
          <span className="eyebrow">KÊNH BÁN & CHĂM SÓC</span>
          <h1>Đồng bộ đa kênh</h1>
          <p>
            Nhận và xử lý hội thoại trong CRM. Gửi chỉ mở theo quyền của đúng tài khoản và tương
            tác; đơn sàn chưa tự tạo đơn bán, xuất kho hay ghi nhận thanh toán.
          </p>
        </div>
        <div className="action-row">
          <button className="secondary" onClick={() => void refresh()} disabled={busy}>
            Làm mới dữ liệu
          </button>
          <button className="secondary" onClick={onLogout} disabled={loggingOut}>
            Đăng xuất
          </button>
        </div>
      </header>
      {error && (
        <div className="error-message" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <div className="success-message" role="status">
          {notice}
        </div>
      )}
      <div className="integration-status-note">
        <strong>Trạng thái thật:</strong>{' '}
        {facebookConnections.length
          ? `${facebookConnections.length} Facebook Page có kết nối. Kiểm tra quyền và sự kiện mới riêng cho từng Page; kết nối không chứng minh tin hai chiều live.`
          : 'Chưa có Facebook Page nào được xác thực. Tạo mục kết nối chỉ ghi nhận Page/OA/shop cần cấu hình; không mô phỏng dữ liệu hoặc báo “đã kết nối”.'}
      </div>
      <nav className="integration-tabs">
        {(['connections', 'social', 'orders', 'jobs', 'mapping'] as const).map((item) => (
          <button key={item} className={tab === item ? 'active' : ''} onClick={() => setTab(item)}>
            {
              {
                connections: 'Kết nối',
                social: `Hộp thư (${conversations.length + comments.length}) · Ticket (${tickets.length})`,
                orders: `Đơn sàn (${orders.length})`,
                jobs: 'Nhật ký đồng bộ',
                mapping: 'Liên kết SKU',
              }[item]
            }
          </button>
        ))}
      </nav>

      {tab === 'connections' && (
        <section className="integration-panel">
          <h2>Tài khoản kênh</h2>
          {staff.permissions.includes('connectors.manage') && (
            <div className="integration-form">
              <h3>Kết nối Facebook Page</h3>
              <p>
                Bấm kết nối, đăng nhập Facebook và cấp quyền một lần. Sau đó chọn các Fanpage bạn
                muốn nhận tin nhắn và bình luận. Bạn không cần tạo ứng dụng Meta hay nhập mã kỹ
                thuật.
              </p>
              {!providerPreflight.find((item) => item.provider === 'FACEBOOK')
                ?.canStartAuthorization && (
                <p role="status">
                  Kết nối Facebook chưa sẵn sàng trên hệ thống này. Người quản trị kỹ thuật cần hoàn
                  tất thiết lập dịch vụ; bạn không cần thao tác trên Meta for Developers.
                </p>
              )}
              <button
                className="primary"
                disabled={
                  busy ||
                  !providerPreflight.find((item) => item.provider === 'FACEBOOK')
                    ?.canStartAuthorization
                }
                onClick={() => void startFacebook()}
              >
                Kết nối Facebook
              </button>
              <h3>Kết nối Zalo OA</h3>
              <p>
                OA cần được duyệt và cấp quyền cho Zalo App. Chỉ cấp quyền OA, không dùng Zalo cá
                nhân.
              </p>
              {!providerPreflight.find((item) => item.provider === 'ZALO')
                ?.canStartAuthorization && (
                <p role="status">Kết nối Zalo OA chưa sẵn sàng trên hệ thống này.</p>
              )}
              <button
                className="primary"
                disabled={
                  busy ||
                  !providerPreflight.find((item) => item.provider === 'ZALO')?.canStartAuthorization
                }
                onClick={() => void startZalo()}
              >
                Kết nối Zalo OA
              </button>
              {channelAttempt?.status === 'READY' && (
                <div>
                  {attemptProvider === 'zalo' ? (
                    <label>
                      OA được cấp quyền
                      <select
                        value={selectedPage}
                        onChange={(event) => setSelectedPage(event.target.value)}
                      >
                        {channelAttempt.accounts.map((page) => (
                          <option key={page.id} value={page.id}>
                            {page.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : (
                    <fieldset>
                      <legend>Chọn các Page được cấp quyền</legend>
                      {channelAttempt.accounts.map((page) => (
                        <label key={page.id}>
                          <input
                            type="checkbox"
                            checked={selectedFacebookPages.includes(page.id)}
                            onChange={(event) =>
                              setSelectedFacebookPages((current) =>
                                event.target.checked
                                  ? [...current, page.id]
                                  : current.filter((id) => id !== page.id),
                              )
                            }
                          />
                          {page.name} ({page.id})
                        </label>
                      ))}
                    </fieldset>
                  )}
                  {channelAttempt.accounts.length === 0 && (
                    <p>
                      Không tìm thấy Fanpage/OA được cấp quyền. Hãy kiểm tra quyền quản lý tài khoản
                      rồi thử kết nối lại.
                    </p>
                  )}
                  <button
                    className="primary"
                    disabled={
                      busy ||
                      (attemptProvider === 'zalo' ? !selectedPage : !selectedFacebookPages.length)
                    }
                    onClick={() => void finalizeFacebook()}
                  >
                    {attemptProvider === 'zalo' ? 'Xác nhận OA' : 'Hoàn tất kết nối Fanpage'}
                  </button>
                </div>
              )}
            </div>
          )}
          {staff.permissions.includes('connectors.manage') && (
            <details className="integration-status-note">
              <summary>Thông tin kỹ thuật dành cho người triển khai</summary>
              <p>
                Cấu hình ứng dụng nền tảng là việc thiết lập một lần ở phía CRM, không phải bước của
                người kết nối Fanpage/OA.
              </p>
              {providerPreflight.map((item) => (
                <p key={item.provider}>
                  {providerNames[item.provider] ?? item.provider}: {item.explanation}
                  {item.missingConfiguration.length > 0 && (
                    <> Thiếu tên cấu hình: {item.missingConfiguration.join(', ')}.</>
                  )}
                </p>
              ))}
              <small>Không hiển thị giá trị secret.</small>
            </details>
          )}
          <div className="integration-cards">
            {connections.map((connection) => (
              <article key={connection.id}>
                <div className="integration-card-title">
                  <b>{providerNames[connection.provider] ?? connection.provider}</b>
                  <span className="status-pill">
                    {connection.status === 'NEEDS_SETUP'
                      ? 'Cần cấu hình'
                      : connection.status === 'CONFIGURED_UNVERIFIED'
                        ? 'Cần xác minh'
                        : connection.status === 'PAUSED'
                          ? 'Đã tạm dừng'
                          : connection.status === 'CONNECTED'
                            ? 'Đã xác thực tài khoản'
                            : connection.status}
                  </span>
                </div>
                <p>
                  {connection.displayName} · ID {connection.externalAccountIdMasked}
                </p>
                <small>
                  {connection.lastErrorCode
                    ? `Lỗi gần nhất: ${connection.lastErrorCode}`
                    : connection.lastSyncAt
                      ? `Hoạt động nhập/đồng bộ gần nhất: ${socialDateTime(connection.lastSyncAt)}`
                      : 'Chưa có hoạt động nhập/đồng bộ thành công'}
                </small>
                {(connection.provider === 'FACEBOOK' || connection.provider === 'ZALO') && (
                  <p className="muted">
                    Cấp quyền: {connection.capabilities?.authorization ?? 'chưa xác minh'} · Webhook
                    : {connection.capabilities?.webhookSubscription ?? 'chưa đăng ký'} · Sự kiện
                    webhook đã xử lý: {connection.webhookEventObserved ? 'có' : 'chưa có'}
                  </p>
                )}
                {facebookConnectionHint(connection) && (
                  <p className="integration-status-note" role="status">
                    {facebookConnectionHint(connection)}
                  </p>
                )}
                {connection.provider === 'FACEBOOK' &&
                  staff.permissions.includes('connectors.manage') && (
                    <>
                      <button
                        className="secondary"
                        disabled={busy}
                        onClick={() => {
                          void api<FacebookGrants>(
                            `/integrations/connections/${connection.id}/facebook-grants`,
                          )
                            .then((result) =>
                              setFacebookGrants((previous) => ({
                                ...previous,
                                [connection.id]: result,
                              })),
                            )
                            .catch((e: unknown) =>
                              setError(
                                e instanceof Error ? e.message : 'Không kiểm tra được quyền Meta.',
                              ),
                            );
                        }}
                      >
                        Kiểm tra quyền gửi Meta
                      </button>
                      {facebookGrants[connection.id] && (
                        <p className="integration-status-note" role="status">
                          Graph: {facebookGrants[connection.id].status}
                          {facebookGrants[connection.id].permissions &&
                            facebookGrants[connection.id].tasks && (
                              <>
                                {' '}
                                · Messenger:{' '}
                                {facebookGrants[connection.id].permissions?.pages_messaging &&
                                facebookGrants[connection.id].tasks?.messaging
                                  ? 'quyền và tác vụ có'
                                  : 'thiếu quyền hoặc tác vụ'}
                                · Bình luận:{' '}
                                {facebookGrants[connection.id].permissions
                                  ?.pages_read_user_content &&
                                facebookGrants[connection.id].permissions
                                  ?.pages_manage_engagement &&
                                facebookGrants[connection.id].tasks?.moderation
                                  ? 'quyền và tác vụ có'
                                  : 'thiếu quyền hoặc tác vụ'}{' '}
                                · pages_read_user_content:{' '}
                                {facebookGrants[connection.id].permissions?.pages_read_user_content
                                  ? 'có'
                                  : 'thiếu'}{' '}
                                · pages_manage_engagement:{' '}
                                {facebookGrants[connection.id].permissions?.pages_manage_engagement
                                  ? 'có'
                                  : 'thiếu'}{' '}
                                · MODERATE:{' '}
                                {facebookGrants[connection.id].tasks?.moderation ? 'có' : 'thiếu'}
                              </>
                            )}
                        </p>
                      )}
                    </>
                  )}
                {staff.permissions.includes('connectors.manage') && (
                  <details>
                    <summary
                      onClick={() => {
                        if (!pageStaffAccess[connection.id])
                          void loadPageStaffAccess(connection.id);
                      }}
                    >
                      Quyền nhân viên trên tài khoản này
                    </summary>
                    <p className="muted">
                      Quyền xem và gửi áp dụng riêng cho Page/OA/shop này. Vai trò CRM vẫn phải cho
                      phép thao tác tương ứng.
                    </p>
                    {staffOptions.map((person) => {
                      const access = pageStaffAccess[connection.id]?.find(
                        (row) => row.staffId === person.id,
                      );
                      return (
                        <div key={person.id} className="action-row">
                          <span>{person.displayName}</span>
                          <span>
                            {access?.canSend
                              ? 'Xem và gửi'
                              : access?.canRead
                                ? 'Chỉ xem'
                                : 'Chưa cấp'}
                          </span>
                          {!access?.canRead ? (
                            <button
                              type="button"
                              className="secondary"
                              disabled={busy}
                              onClick={() =>
                                void savePageStaffAccess(connection.id, person.id, true, false)
                              }
                            >
                              Cho xem
                            </button>
                          ) : (
                            <>
                              <button
                                type="button"
                                className="secondary"
                                disabled={busy}
                                onClick={() =>
                                  void savePageStaffAccess(
                                    connection.id,
                                    person.id,
                                    true,
                                    !access.canSend,
                                  )
                                }
                              >
                                {access.canSend ? 'Thu quyền gửi' : 'Cho gửi'}
                              </button>
                              <button
                                type="button"
                                className="secondary"
                                disabled={busy}
                                onClick={() =>
                                  void savePageStaffAccess(connection.id, person.id, false, false)
                                }
                              >
                                Thu hồi
                              </button>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </details>
                )}
                {staff.permissions.includes('connectors.manage') && (
                  <div>
                    {connection.provider === 'FACEBOOK' && (
                      <button
                        className="secondary"
                        disabled={
                          busy ||
                          !providerPreflight.find((item) => item.provider === 'FACEBOOK')
                            ?.canStartAuthorization
                        }
                        onClick={() => void startFacebook(connection.id)}
                      >
                        Kết nối lại Page
                      </button>
                    )}
                    {connection.provider === 'ZALO' && (
                      <button
                        className="secondary"
                        disabled={
                          busy ||
                          !providerPreflight.find((item) => item.provider === 'ZALO')
                            ?.canStartAuthorization
                        }
                        onClick={() => void startZalo(connection.id)}
                      >
                        Kết nối lại OA
                      </button>
                    )}
                    {connection.provider === 'FACEBOOK' || connection.provider === 'ZALO' ? (
                      <button
                        className="secondary"
                        disabled={busy || connection.status === 'PAUSED'}
                        onClick={() =>
                          void action(
                            `/integrations/oauth/${connection.provider === 'ZALO' ? 'zalo' : 'facebook'}/connections/${connection.id}/disconnect`,
                            'POST',
                          )
                        }
                      >
                        Ngắt trong CRM
                      </button>
                    ) : (
                      <button
                        className="secondary"
                        disabled={busy}
                        onClick={() =>
                          void action(
                            `/integrations/connections/${connection.id}/status`,
                            'PATCH',
                            {
                              status:
                                connection.status === 'PAUSED' ? 'CONFIGURED_UNVERIFIED' : 'PAUSED',
                            },
                          )
                        }
                      >
                        {connection.status === 'PAUSED' ? 'Mở lại nhận dữ liệu' : 'Tạm dừng'}
                      </button>
                    )}
                  </div>
                )}
              </article>
            ))}
          </div>
          {staff.permissions.includes('connectors.manage') && (
            <details className="integration-status-note">
              <summary>Khai báo tài khoản để chuẩn bị tích hợp (không cấp quyền)</summary>
              <form className="integration-form" onSubmit={createConnection}>
                <h3>Ghi nhận tài khoản cần cấu hình</h3>
                <p>
                  Khai báo thủ công chỉ dùng để ghi chú chuẩn bị; không kết nối tài khoản provider.
                </p>
                <label>
                  Nền tảng
                  <select name="provider">
                    <option value="FACEBOOK">Facebook Fanpage</option>
                    <option value="ZALO">Zalo OA</option>
                    <option value="SHOPEE">Shopee</option>
                    <option value="TIKTOK_SHOP">TikTok Shop</option>
                  </select>
                </label>
                <label>
                  ID tài khoản ngoài
                  <input name="externalAccountId" required maxLength={190} />
                </label>
                <label>
                  Tên hiển thị
                  <input name="displayName" required maxLength={190} />
                </label>
                <button className="primary" disabled={busy}>
                  Lưu trạng thái cần cấu hình
                </button>
              </form>
            </details>
          )}
          <div className="integration-capabilities">
            <h3>Ranh giới connector</h3>
            <p>
              <b>Facebook:</b> webhook inbound Messenger và bình luận đang chờ cấu hình app/Page,
              quyền và kiểm thử tài khoản.
            </p>
            <p>
              <b>Zalo OA:</b> API hội thoại có giới hạn/phân trang; webhook và quyền OA cần cấu
              hình. API đọc bình luận chưa xác minh.
            </p>
            <p>
              <b>Shopee, TikTok Shop:</b> chưa thể gọi API nếu thiếu app/partner credentials, shop
              authorization và scope đọc đơn.
            </p>
          </div>
        </section>
      )}

      {tab === 'social' && (
        <SocialInbox
          staff={staff}
          connections={connections}
          conversations={conversations}
          comments={comments}
          tickets={tickets}
          customers={customers}
          orders={orders}
          busy={busy}
          loading={loading}
          messageLoading={messageLoading}
          messagePages={messagePages}
          openConversationId={openConversationId}
          identityTargets={identityTargets}
          setIdentityTargets={setIdentityTargets}
          identityPreviews={identityPreviews}
          previewIdentityLink={previewIdentityLink}
          confirmIdentityLink={confirmIdentityLink}
          toggleConversationMessages={toggleConversationMessages}
          loadOlderMessages={loadOlderMessages}
          reloadConversationMessages={reloadConversationMessages}
          addNote={addNote}
          action={action}
          refresh={refresh}
          setError={setError}
          setNotice={setNotice}
          onCreateQuote={onCreateQuote}
        />
      )}

      {tab === 'orders' && (
        <section className="integration-list">
          <h2>Đơn hàng nhập từ sàn</h2>
          <p className="muted">
            Đây là bản ghi đơn ngoài để nhân viên rà soát. Liên kết khách/SKU không chuyển thành đơn
            bán và không thay đổi tồn, thu tiền, công nợ hay doanh thu.
          </p>
          {orders.length === 0 && <p>Chưa có đơn hàng nào được nhập từ API.</p>}
          {orders.map((order) => (
            <article key={order.id} className="integration-item">
              <div>
                <span className="eyebrow">
                  {providerNames[order.connection.provider] ?? order.connection.provider} ·{' '}
                  {order.normalizedStatus}
                </span>
                <h3>#{order.externalOrderId}</h3>
                <p>
                  Trạng thái nguồn: {order.sourceStatus} · Tổng nguồn: {order.totalAmount ?? '—'}{' '}
                  {order.currency}
                </p>
                <ul>
                  {order.lines.map((line) => (
                    <li key={line.id}>
                      {line.titleSnapshot} · {line.quantity} {line.sourceUnit ?? ''} · SKU CRM:{' '}
                      {line.variant?.sku ?? 'chưa liên kết'}
                    </li>
                  ))}
                </ul>
                {order.customer ? (
                  <p>
                    Khách CRM: {order.customer.customerCode} · {order.customer.displayName} (
                    {order.customer.group.name})
                  </p>
                ) : (
                  staff.permissions.includes('integrations.customer.link') && (
                    <label>
                      Liên kết khách
                      <select
                        defaultValue=""
                        onChange={(e) =>
                          e.target.value &&
                          void action(`/integrations/orders/${order.id}/link-customer`, 'POST', {
                            customerId: e.target.value,
                          })
                        }
                      >
                        <option value="">Chọn khách hàng…</option>
                        {customers.map((customer) => (
                          <option key={customer.id} value={customer.id}>
                            {customer.customerCode} · {customer.displayName} ({customer.group.name})
                          </option>
                        ))}
                      </select>
                    </label>
                  )
                )}
              </div>
            </article>
          ))}
        </section>
      )}

      {tab === 'jobs' && (
        <section className="integration-list">
          <h2>Tác vụ đồng bộ</h2>
          {staff.permissions.includes('connectors.manage') && facebookConnections.length > 0 && (
            <label>
              Page cần kiểm quyền hoặc nhập lịch sử
              <select
                value={selectedFacebookConnectionId}
                onChange={(event) => {
                  setSelectedFacebookConnectionId(event.target.value);
                  setBackfillPreflight(null);
                }}
              >
                <option value="">Chọn Page…</option>
                {facebookConnections.map((connection) => (
                  <option key={connection.id} value={connection.id}>
                    {connection.displayName}
                  </option>
                ))}
              </select>
            </label>
          )}
          {staff.permissions.includes('connectors.manage') && connectedFacebook && (
            <form className="integration-form" onSubmit={(event) => void startBackfill(event)}>
              <h3>Nhập lịch sử Facebook</h3>
              <p>
                Đây là tác vụ gọi Meta để nhập dữ liệu cũ, khác với “Làm mới dữ liệu” chỉ đọc lại
                CRM. Meta có thể giới hạn lịch sử hoặc từ chối quyền; không có kết quả không đồng
                nghĩa Page không có dữ liệu.
              </p>
              <label>
                Loại dữ liệu
                <select name="dataset">
                  <option value="MESSAGES">Tin nhắn Messenger</option>
                  <option value="COMMENTS">Bình luận và replies</option>
                </select>
              </label>
              <label>
                Từ ngày (giờ Việt Nam)
                <input name="since" type="date" required />
              </label>
              <label>
                Đến hết ngày (giờ Việt Nam)
                <input name="until" type="date" required />
              </label>
              <label>
                Giới hạn trang Meta lần đầu
                <input
                  name="pageLimit"
                  type="number"
                  min="1"
                  max="500"
                  defaultValue="100"
                  required
                />
              </label>
              <button className="primary" disabled={busy}>
                Bắt đầu nhập lịch sử
              </button>
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={(event) => void checkBackfillPermission(event.currentTarget.form)}
              >
                Kiểm tra quyền Meta
              </button>
              {backfillPreflight && (
                <p role="status">
                  {backfillPreflight.dataset === 'MESSAGES' ? 'Messenger' : 'Bình luận'}:{' '}
                  {backfillPreflight.status} ({backfillPreflight.checkedEdge})
                  {backfillPreflight.providerCode
                    ? ` · Graph code ${backfillPreflight.providerCode}`
                    : ''}
                </p>
              )}
              <p>
                Chỉ lưu dữ liệu CRM; không gửi tin, không thay kho hoặc tiền. Bình luận có thể cần
                Meta phê duyệt quyền đọc nội dung Page.
              </p>
            </form>
          )}
          {backfills.map((job) => (
            <article className="integration-job" key={job.id}>
              <b>
                {job.dataset === 'MESSAGES' ? 'Messenger' : 'Bình luận'} · {job.status}
              </b>
              <small>
                {socialDate(job.since)} – {socialDate(job.until)} · {job.phase} · đã duyệt{' '}
                {job.pagesFetched}/{job.pageLimit} trang API
              </small>
              <small>
                Đã phát hiện {job.progress.discovered}, đã đọc {job.progress.fetched}, thêm mới{' '}
                {job.progress.inserted}, đã gặp lại {job.progress.duplicates ?? 0}, bỏ qua tổng{' '}
                {job.progress.skipped}. {job.lastErrorCode ?? ''}
              </small>
              {job.lastErrorCode === 'BLOCKED_PERMISSION' && (
                <p>
                  Meta chưa cấp quyền đọc lịch sử cho app/Page này. Quản trị kỹ thuật cần xử lý
                  quyền hoặc App Review; không cần nhập token vào CRM.
                </p>
              )}
              {job.lastErrorCode === 'REAUTH_REQUIRED' && (
                <p>Page cần được cấp quyền lại bằng nút Kết nối lại.</p>
              )}
              {job.lastErrorCode === 'BACKFILL_PAGE_LIMIT_REACHED' && (
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() =>
                    void action(`/integrations/facebook/backfills/${job.id}/extend`, 'POST', {
                      additionalPages: 100,
                    })
                  }
                >
                  Tiếp tục thêm 100 trang từ checkpoint
                </button>
              )}
              {job.lastErrorCode === 'PAUSED_BY_USER' && (
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() =>
                    void action(`/integrations/facebook/backfills/${job.id}/resume`, 'POST')
                  }
                >
                  Tiếp tục từ checkpoint
                </button>
              )}
              {['PENDING', 'PROCESSING', 'RETRY'].includes(job.status) && (
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() =>
                    void action(`/integrations/facebook/backfills/${job.id}/pause`, 'POST')
                  }
                >
                  Tạm dừng
                </button>
              )}
              {['BLOCKED', 'DEAD', 'SUCCEEDED'].includes(job.status) &&
                job.lastErrorCode !== 'PAUSED_BY_USER' && (
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() =>
                      void action(`/integrations/facebook/backfills/${job.id}/restart`, 'POST')
                    }
                  >
                    Nhập lại từ đầu (không tạo trùng)
                  </button>
                )}
            </article>
          ))}
          {!staff.permissions.includes('connectors.manage') ? (
            <p>Bạn không có quyền xem log kỹ thuật.</p>
          ) : jobs.filter((job) => job.kind !== 'BACKFILL').length === 0 ? (
            <p>Chưa có webhook/job được lưu.</p>
          ) : (
            jobs
              .filter((job) => job.kind !== 'BACKFILL')
              .map((job) => (
                <article className="integration-job" key={job.id}>
                  <span>
                    {job.kind} · {job.status} · {job.providerObjectId ?? job.id}
                  </span>
                  <small>
                    {job.attempts}/{job.maxAttempts} lần · {job.lastErrorCode ?? 'Không có lỗi'} ·{' '}
                    {socialDateTime(job.receivedAt)}
                  </small>
                  {['DEAD', 'BLOCKED', 'RETRY'].includes(job.status) && (
                    <button
                      className="secondary"
                      disabled={busy}
                      onClick={() => void action(`/integrations/jobs/${job.id}/retry`, 'POST')}
                    >
                      Chạy lại
                    </button>
                  )}
                </article>
              ))
          )}
        </section>
      )}

      {tab === 'mapping' && (
        <section className="integration-panel">
          <h2>Liên kết mã sản phẩm từ kênh với SKU CRM</h2>
          <p>
            Hệ số quy đổi chỉ dùng để hiển thị/đối chiếu dòng đơn ngoài; không tự cập nhật kho hoặc
            tạo đơn bán.
          </p>
          {staff.permissions.includes('integrations.mapping.manage') ? (
            <form className="integration-form" onSubmit={(event) => void saveMapping(event)}>
              <label>
                Kết nối
                <select name="connectionId" required>
                  {connections.map((item) => (
                    <option key={item.id} value={item.id}>
                      {providerNames[item.provider]} · {item.displayName}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                ID sản phẩm trên kênh
                <input name="externalProductId" required />
              </label>
              <label>
                ID phân loại/model nếu có
                <input name="externalModelId" />
              </label>
              <label>
                SKU CRM
                <select name="variantId" required>
                  {products.flatMap((product) =>
                    product.variants.map((variant) => (
                      <option key={variant.id} value={variant.id}>
                        {variant.sku} · {product.name} · {variant.name}
                      </option>
                    )),
                  )}
                </select>
              </label>
              <label>
                Hệ số quy đổi
                <input
                  name="conversionFactor"
                  type="number"
                  min="0.000001"
                  step="0.000001"
                  defaultValue="1"
                  required
                />
              </label>
              <button className="primary" disabled={busy || !connections.length}>
                Lưu liên kết
              </button>
            </form>
          ) : (
            <p>Bạn chưa có quyền sửa liên kết SKU.</p>
          )}
        </section>
      )}
    </main>
  );
}

type SocialItem = { type: 'chat' | 'comment' | 'ticket'; id: string; at: string };
type SocialInboxProps = {
  staff: Staff;
  connections: Connection[];
  conversations: Conversation[];
  comments: SocialComment[];
  tickets: SocialTicket[];
  customers: Customer[];
  orders: ExternalOrder[];
  busy: boolean;
  loading: boolean;
  messageLoading: boolean;
  messagePages: Record<string, ConversationMessagePage>;
  openConversationId: string | null;
  identityTargets: Record<string, string>;
  setIdentityTargets: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  identityPreviews: Record<string, IdentityPreview>;
  previewIdentityLink: (id: string) => Promise<void>;
  confirmIdentityLink: (id: string) => Promise<void>;
  toggleConversationMessages: (id: string) => Promise<void>;
  loadOlderMessages: (id: string) => Promise<void>;
  reloadConversationMessages: (id: string) => Promise<void>;
  addNote: (event: FormEvent<HTMLFormElement>, id: string) => Promise<void>;
  action: (path: string, method: string, body?: unknown) => Promise<void>;
  refresh: () => Promise<void>;
  setError: (error: string) => void;
  setNotice: (notice: string) => void;
  onCreateQuote?: (source: {
    customerId: string;
    conversationId: string;
    accountName: string;
  }) => void;
};

const ticketKinds: Record<string, string> = {
  PRODUCT: 'Hỏi hàng',
  QUOTE: 'Báo giá',
  ORDER: 'Đơn hàng',
  DELIVERY: 'Giao vận',
  COMPLAINT: 'Khiếu nại',
  OTHER: 'Khác',
};
const ticketStatuses: Record<string, string> = {
  OPEN: 'Mới',
  IN_PROGRESS: 'Đang xử lý',
  WAITING: 'Chờ phản hồi',
  RESOLVED: 'Đã xử lý',
  CLOSED: 'Đã đóng',
};
const priorities: Record<string, string> = { NORMAL: 'Thường', HIGH: 'Cao', URGENT: 'Khẩn' };
const sendReasons: Record<string, string> = {
  NO_CRM_PERMISSION: 'Tài khoản CRM chưa có quyền xử lý hộp thư.',
  CHANNEL_SEND_UNAVAILABLE: 'Kênh này chưa có API gửi đã xác minh trong CRM.',
  PAGE_NOT_CONNECTED: 'Page chưa kết nối hoặc đang tạm dừng; cần kết nối lại Page.',
  PAGE_NOT_VERIFIED: 'Page chưa được xác minh qua OAuth.',
  REAUTH_REQUIRED: 'Token Page cần được cấp quyền lại.',
  ASSIGNED_TO_OTHER_STAFF: 'Hội thoại đã giao cho nhân viên khác.',
  RECIPIENT_UNVERIFIED: 'Không xác minh được Page-scoped ID của người nhận.',
  OUTSIDE_24H_WINDOW: 'Đã ngoài cửa sổ phản hồi Messenger; cần khách nhắn lại.',
  COMMENT_NOT_ACTIVE: 'Bình luận nguồn không còn ở trạng thái hoạt động.',
  BLOCKED_PERMISSION: 'Meta chưa cấp đủ quyền cho thao tác này.',
  PAGE_TASK_MISSING: 'Tài khoản cấp quyền thiếu tác vụ phù hợp trên Page.',
  PAGE_TOKEN_MISMATCH: 'Token không thuộc Page này; cần kết nối lại.',
  PROVIDER_UNKNOWN: 'Không kiểm tra được Meta; hãy thử kiểm tra kết nối.',
  PROVIDER_CHECK_UNAVAILABLE: 'Không kiểm tra được điều kiện gửi trên Meta.',
  RATE_LIMIT_UNKNOWN: 'Meta giới hạn tốc độ; trạng thái gửi cần đối soát.',
  PROVIDER_REJECTED: 'Meta từ chối yêu cầu gửi.',
  LOCAL_PERSISTENCE_UNKNOWN: 'Meta có thể đã nhận, nhưng CRM chưa lưu xong; cần đối soát.',
};

function facebookSourceUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' &&
      (url.hostname === 'facebook.com' || url.hostname.endsWith('.facebook.com'))
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

type SocialFilters = {
  view: 'all' | 'chat' | 'comment' | 'ticket';
  query: string;
  provider: string;
  account: string;
  onlyUnread: boolean;
  onlyOpen: boolean;
  priority: string;
  assignee: string;
  ticketStatus: string;
  label: string;
};

export function filterSocialItems(
  items: SocialItem[],
  sources: {
    conversations: Conversation[];
    comments: SocialComment[];
    tickets: SocialTicket[];
    connections: Connection[];
  },
  filters: SocialFilters,
): SocialItem[] {
  const { conversations, comments, tickets, connections } = sources;
  const {
    view,
    query,
    provider,
    account,
    onlyUnread,
    onlyOpen,
    priority,
    assignee,
    ticketStatus,
    label,
  } = filters;
  return items.filter((item) => {
    if (view !== 'all' && item.type !== view) return false;
    const chat = item.type === 'chat' ? conversations.find((row) => row.id === item.id) : null;
    const comment = item.type === 'comment' ? comments.find((row) => row.id === item.id) : null;
    const ticket = item.type === 'ticket' ? tickets.find((row) => row.id === item.id) : null;
    const sourceChat =
      chat ??
      (ticket?.conversationId
        ? conversations.find((row) => row.id === ticket.conversationId)
        : null);
    const sourceComment =
      comment ?? (ticket?.commentId ? comments.find((row) => row.id === ticket.commentId) : null);
    const connectionId =
      sourceChat?.connectionId ??
      sourceComment?.connectionId ??
      ticket?.conversation?.connectionId ??
      ticket?.comment?.connectionId ??
      '';
    const connection = connections.find((row) => row.id === connectionId);
    const channel =
      connection?.provider ??
      ticket?.conversation?.connection.provider ??
      ticket?.comment?.connection.provider ??
      '';
    const name = chat?.identity?.displayName ?? comment?.authorDisplayName ?? ticket?.summary ?? '';
    const excerpt = chat?.messages[0]?.body ?? comment?.body ?? ticket?.summary ?? '';
    if (
      query &&
      !`${name} ${excerpt} ${sourceComment?.externalPostId ?? ''}`
        .toLocaleLowerCase('vi-VN')
        .includes(query.toLocaleLowerCase('vi-VN'))
    )
      return false;
    if (provider && channel !== provider) return false;
    if (account && connectionId !== account) return false;
    if (onlyUnread && !chat?.unreadAt) return false;
    if (
      onlyOpen &&
      (ticket
        ? ['RESOLVED', 'CLOSED'].includes(ticket.status)
        : chat
          ? chat.status === 'RESOLVED'
          : false)
    )
      return false;
    if (priority && ticket?.priority !== priority) return false;
    if (assignee && (ticket?.assignedStaff?.id ?? chat?.assignedStaff?.id ?? '') !== assignee)
      return false;
    if (ticketStatus && ticket?.status !== ticketStatus) return false;
    if (label && !ticket?.labels.includes(label)) return false;
    return true;
  });
}

function SocialInbox(props: SocialInboxProps) {
  const {
    staff,
    connections,
    conversations,
    comments,
    tickets,
    customers,
    orders,
    busy,
    loading,
    messageLoading,
    messagePages,
    openConversationId,
    identityTargets,
    setIdentityTargets,
    identityPreviews,
    previewIdentityLink,
    confirmIdentityLink,
    toggleConversationMessages,
    loadOlderMessages,
    reloadConversationMessages,
    addNote,
    action,
    refresh,
    setError,
    setNotice,
    onCreateQuote,
  } = props;
  const [view, setView] = useState<'all' | 'chat' | 'comment' | 'ticket'>('all');
  const [selection, setSelection] = useState<SocialItem | null>(null);
  const [mobilePane, setMobilePane] = useState<'list' | 'detail' | 'profile'>('list');
  const [query, setQuery] = useState('');
  const [provider, setProvider] = useState('');
  const [account, setAccount] = useState('');
  const [onlyUnread, setOnlyUnread] = useState(false);
  const [onlyOpen, setOnlyOpen] = useState(false);
  const [priority, setPriority] = useState('');
  const [assignee, setAssignee] = useState('');
  const [ticketStatus, setTicketStatus] = useState('');
  const [label, setLabel] = useState('');
  const [assignees, setAssignees] = useState<Array<{ id: string; displayName: string }>>([]);
  const [ticketDraftKey, setTicketDraftKey] = useState('');
  const [ticketSaving, setTicketSaving] = useState(false);
  const [sendState, setSendState] = useState<{
    path: string;
    capability: SendCapability;
    rows: SocialOutbound[];
  } | null>(null);
  const [drafts, setDrafts] = useState<Record<string, { body: string; key: string }>>({});
  const [sendBusy, setSendBusy] = useState(false);
  const sendLock = useRef(false);

  useEffect(() => {
    void api<Array<{ id: string; displayName: string }>>('/integrations/assignees')
      .then(setAssignees)
      .catch((error: unknown) =>
        setError(error instanceof Error ? error.message : 'Không tải được người phụ trách.'),
      );
  }, [setError]);

  const allItems: SocialItem[] = [
    ...conversations.map((item) => ({
      type: 'chat' as const,
      id: item.id,
      at: item.lastMessageAt ?? '',
    })),
    ...comments.map((item) => ({ type: 'comment' as const, id: item.id, at: item.providerAt })),
    ...tickets.map((item) => ({ type: 'ticket' as const, id: item.id, at: item.updatedAt })),
  ].sort((a, b) => b.at.localeCompare(a.at));
  const filtered = filterSocialItems(
    allItems,
    { conversations, comments, tickets, connections },
    {
      view,
      query,
      provider,
      account,
      onlyUnread,
      onlyOpen,
      priority,
      assignee,
      ticketStatus,
      label,
    },
  );
  const active =
    selection && filtered.some((item) => item.type === selection.type && item.id === selection.id)
      ? selection
      : (filtered[0] ?? null);
  const chat = active?.type === 'chat' ? conversations.find((row) => row.id === active.id) : null;
  const comment = active?.type === 'comment' ? comments.find((row) => row.id === active.id) : null;
  const parentComment = comment?.externalParentId
    ? comments.find(
        (row) =>
          row.externalCommentId === comment.externalParentId &&
          row.connectionId === comment.connectionId,
      )
    : null;
  const ticket = active?.type === 'ticket' ? tickets.find((row) => row.id === active.id) : null;
  const relatedTickets =
    active?.type === 'ticket'
      ? [ticket].filter((row): row is SocialTicket => !!row)
      : tickets.filter((row) =>
          active?.type === 'chat' ? row.conversationId === active.id : row.commentId === active?.id,
        );
  const linkedCustomerId = chat?.identity?.customerId ?? ticket?.conversation?.identity?.customerId;
  const linkedCustomer = linkedCustomerId
    ? customers.find((row) => row.id === linkedCustomerId)
    : null;
  const linkedOrders = linkedCustomerId
    ? orders.filter((row) => row.customer?.id === linkedCustomerId)
    : [];
  const activeConnection = connections.find(
    (row) => row.id === (chat?.connectionId ?? comment?.connectionId),
  );
  const activeProvider =
    activeConnection?.provider ??
    ticket?.conversation?.connection.provider ??
    ticket?.comment?.connection.provider ??
    '';
  const activeAccount =
    activeConnection?.displayName ??
    ticket?.conversation?.connection.displayName ??
    ticket?.comment?.connection.displayName ??
    '';
  const sendSource = chat
    ? {
        key: `chat:${chat.id}`,
        path: `/integrations/conversations/${chat.id}`,
        sendPath: `/integrations/conversations/${chat.id}/send`,
      }
    : comment
      ? {
          key: `comment:${comment.id}`,
          path: `/integrations/comments/${comment.id}`,
          sendPath: `/integrations/comments/${comment.id}/reply`,
        }
      : null;
  const sendSourceKey = sendSource?.key ?? '';
  const sendSourcePath = sendSource?.path ?? '';
  const currentDraft = drafts[sendSourceKey] ?? { body: '', key: '' };
  const sendCapability = sendState?.path === sendSourcePath ? sendState.capability : null;
  const outbounds = sendState?.path === sendSourcePath ? sendState.rows : [];

  useEffect(() => {
    if (!sendSourcePath) return;
    let activeRequest = true;
    void Promise.all([
      api<SendCapability>(`${sendSourcePath}/${chat ? 'send-capability' : 'reply-capability'}`),
      api<SocialOutbound[]>(`${sendSourcePath}/outbounds`),
    ])
      .then(([capability, rows]) => {
        if (activeRequest) {
          setSendState({ path: sendSourcePath, capability, rows });
        }
      })
      .catch((error: unknown) => {
        if (activeRequest) {
          setSendState({
            path: sendSourcePath,
            capability: { status: 'PROVIDER_CHECK_UNAVAILABLE', canSend: false },
            rows: [],
          });
          setError(error instanceof Error ? error.message : 'Không kiểm tra được khả năng gửi.');
        }
      });
    return () => {
      activeRequest = false;
    };
  }, [sendSourcePath, chat, setError]);

  async function sendSocialReply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!sendSource || !sendCapability?.canSend || sendLock.current) return;
    const body = currentDraft.body.trim();
    if (!body) return;
    const key = currentDraft.key || crypto.randomUUID();
    setDrafts((value) => ({ ...value, [sendSource.key]: { body, key } }));
    sendLock.current = true;
    setSendBusy(true);
    setError('');
    try {
      const result = await api<SocialOutbound>(sendSource.sendPath, {
        method: 'POST',
        body: JSON.stringify({ body, requestKey: key }),
      });
      setSendState((value) =>
        value && value.path === sendSourcePath
          ? { ...value, rows: [result, ...value.rows.filter((row) => row.id !== result.id)] }
          : value,
      );
      if (result.status === 'SENT_TO_PROVIDER') {
        setDrafts((value) => ({ ...value, [sendSource.key]: { body: '', key: '' } }));
        setNotice('Meta đã chấp nhận yêu cầu gửi; đang chờ xác nhận hiển thị ở Messenger.');
        if (chat) await reloadConversationMessages(chat.id);
        await refresh();
      } else if (result.status === 'FAILED') {
        setError(
          sendReasons[result.errorCode ?? ''] ?? 'Meta từ chối gửi. Nội dung nháp được giữ.',
        );
      } else {
        setError('Chưa rõ Meta đã nhận chưa. CRM sẽ không tự gửi lại để tránh trùng.');
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Không gửi được; giữ nội dung nháp.');
    } finally {
      sendLock.current = false;
      setSendBusy(false);
    }
  }

  async function createTicket(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!active || active.type === 'ticket') return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const requestKey = ticketDraftKey || crypto.randomUUID();
    setTicketDraftKey(requestKey);
    setTicketSaving(true);
    setError('');
    try {
      await api('/integrations/tickets', {
        method: 'POST',
        body: JSON.stringify({
          sourceType: active.type === 'chat' ? 'CONVERSATION' : 'COMMENT',
          sourceId: active.id,
          requestKey,
          kind: data.get('kind'),
          priority: data.get('priority'),
          summary: data.get('summary'),
          assignedStaffId: data.get('assignedStaffId') || null,
          labels: String(data.get('labels') ?? '')
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean),
        }),
      });
      setTicketDraftKey('');
      form.reset();
      setNotice('Đã tạo ticket và lưu nguồn tương tác.');
      await refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Không tạo được ticket.');
    } finally {
      setTicketSaving(false);
    }
  }

  async function updateTicket(id: string, version: number, change: Record<string, unknown>) {
    await action(`/integrations/tickets/${id}`, 'PATCH', { expectedVersion: version, ...change });
  }

  return (
    <section className="social-workspace" aria-label="Hộp thư social">
      <div className="social-list social-panel" data-mobile-pane={mobilePane}>
        <div className="social-panel-head">
          <h2>Hộp thư</h2>
          <span>{loading ? 'Đang tải…' : `${filtered.length} mục đã tải`}</span>
        </div>
        <small className="social-list-limit">Mỗi loại hiển thị tối đa 100 mục gần nhất.</small>
        <div className="social-filters">
          <div className="social-view-tabs" role="group" aria-label="Loại mục">
            {(['all', 'chat', 'comment', 'ticket'] as const).map((item) => (
              <button
                key={item}
                type="button"
                aria-pressed={view === item}
                onClick={() => setView(item)}
              >
                {{ all: 'Tất cả', chat: 'Chat', comment: 'Bình luận', ticket: 'Ticket' }[item]} (
                {item === 'all'
                  ? allItems.length
                  : allItems.filter((row) => row.type === item).length}
                )
              </button>
            ))}
          </div>
          <label className="social-search">
            Tìm kiếm
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Tên, nội dung, bài viết…"
            />
          </label>
          <div className="social-filter-grid">
            <label>
              Kênh
              <select
                value={provider}
                onChange={(event) => {
                  setProvider(event.target.value);
                  setAccount('');
                }}
              >
                <option value="">Tất cả</option>
                {['FACEBOOK', 'ZALO', 'SHOPEE', 'TIKTOK_SHOP'].map((value) => (
                  <option key={value} value={value}>
                    {providerNames[value]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Tài khoản
              <select value={account} onChange={(event) => setAccount(event.target.value)}>
                <option value="">Tất cả</option>
                {connections
                  .filter((row) => !provider || row.provider === provider)
                  .map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.displayName}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Ưu tiên
              <select value={priority} onChange={(event) => setPriority(event.target.value)}>
                <option value="">Tất cả</option>
                {Object.entries(priorities).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Người xử lý
              <select value={assignee} onChange={(event) => setAssignee(event.target.value)}>
                <option value="">Tất cả</option>
                {assignees.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.displayName}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Trạng thái ticket
              <select
                value={ticketStatus}
                onChange={(event) => setTicketStatus(event.target.value)}
              >
                <option value="">Tất cả</option>
                {Object.entries(ticketStatuses).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Nhãn
              <select value={label} onChange={(event) => setLabel(event.target.value)}>
                <option value="">Tất cả</option>
                {[...new Set(tickets.flatMap((row) => row.labels))].sort().map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="social-quick-filters">
            <label>
              <input
                type="checkbox"
                checked={onlyUnread}
                onChange={(event) => setOnlyUnread(event.target.checked)}
              />{' '}
              Chưa đọc
            </label>
            <label>
              <input
                type="checkbox"
                checked={onlyOpen}
                onChange={(event) => setOnlyOpen(event.target.checked)}
              />{' '}
              Chưa xử lý
            </label>
          </div>
        </div>
        <div className="social-items">
          {loading && <p className="social-empty">Đang tải dữ liệu CRM…</p>}
          {!loading && filtered.length === 0 && (
            <p className="social-empty">Không có mục phù hợp trong dữ liệu CRM đã tải.</p>
          )}
          {filtered.map((item) => {
            const rowChat =
              item.type === 'chat' ? conversations.find((row) => row.id === item.id) : null;
            const rowComment =
              item.type === 'comment' ? comments.find((row) => row.id === item.id) : null;
            const rowTicket =
              item.type === 'ticket' ? tickets.find((row) => row.id === item.id) : null;
            const rowConnection = connections.find(
              (row) => row.id === (rowChat?.connectionId ?? rowComment?.connectionId),
            );
            const rowProvider =
              rowConnection?.provider ??
              rowTicket?.conversation?.connection.provider ??
              rowTicket?.comment?.connection.provider ??
              '';
            const name =
              rowChat?.identity?.displayName ??
              rowComment?.authorDisplayName ??
              rowTicket?.summary ??
              'Khách ngoài';
            const excerpt =
              rowChat?.messages[0]?.body ??
              rowComment?.body ??
              rowTicket?.summary ??
              'Nội dung đính kèm';
            return (
              <button
                key={`${item.type}:${item.id}`}
                type="button"
                className="social-item"
                aria-current={
                  active?.type === item.type && active?.id === item.id ? 'true' : undefined
                }
                onClick={() => {
                  setSelection(item);
                  setMobilePane('detail');
                  setTicketDraftKey('');
                  if (item.type === 'chat') {
                    if (openConversationId !== item.id) void toggleConversationMessages(item.id);
                    if (
                      rowChat?.unreadAt &&
                      staff.permissions.includes('integrations.inbox.manage')
                    ) {
                      void api(`/integrations/conversations/${item.id}/mark-read`, {
                        method: 'POST',
                      })
                        .then(() => refresh())
                        .catch((error: unknown) =>
                          setError(
                            error instanceof Error ? error.message : 'Không đánh dấu đã đọc được.',
                          ),
                        );
                    }
                  }
                }}
              >
                <span className="social-avatar" aria-hidden="true">
                  {name.slice(0, 1).toLocaleUpperCase('vi-VN')}
                </span>
                <span className="social-item-main">
                  <span className="social-item-title">{name}</span>
                  <span className="social-item-excerpt">{excerpt}</span>
                  <span className="social-item-meta">
                    <span className={`social-channel channel-${rowProvider.toLowerCase()}`}>
                      {providerNames[rowProvider] ?? rowProvider}
                    </span>{' '}
                    ·{' '}
                    {item.type === 'chat'
                      ? 'Chat'
                      : item.type === 'comment'
                        ? 'Bình luận'
                        : 'Ticket'}
                    {rowComment ? ` · Bài ${rowComment.externalPostId}` : ''}
                    {rowTicket
                      ? ` · ${ticketStatuses[rowTicket.status]} · ${rowTicket.labels.join(', ')}`
                      : ''}
                    {rowChat?.assignedStaff ? ` · ${rowChat.assignedStaff.displayName}` : ''}
                    {rowTicket?.assignedStaff ? ` · ${rowTicket.assignedStaff.displayName}` : ''}
                  </span>
                </span>
                <span className="social-item-side">
                  <time>{item.at ? socialDate(item.at) : ''}</time>
                  {rowChat?.unreadAt && <b aria-label="Chưa đọc">●</b>}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="social-detail social-panel" data-mobile-pane={mobilePane}>
        <div className="social-panel-head">
          <button type="button" className="social-back" onClick={() => setMobilePane('list')}>
            ← Danh sách
          </button>
          <div>
            <h2>
              {chat?.identity?.displayName ??
                comment?.authorDisplayName ??
                ticket?.summary ??
                'Chọn một mục'}
            </h2>
            <small>
              {activeProvider ? providerNames[activeProvider] : ''}
              {activeAccount ? ` · ${activeAccount}` : ''}
            </small>
          </div>
          <button
            type="button"
            className="social-profile-toggle"
            onClick={() => setMobilePane('profile')}
          >
            Hồ sơ →
          </button>
        </div>
        {!active && (
          <p className="social-empty">Chọn hội thoại, bình luận hoặc ticket để xem chi tiết.</p>
        )}
        {chat && (
          <div className="social-thread">
            {openConversationId !== chat.id && (
              <button
                type="button"
                className="secondary"
                onClick={() => void toggleConversationMessages(chat.id)}
              >
                Tải tin nhắn đã lưu
              </button>
            )}
            {messageLoading && openConversationId === chat.id && <p>Đang tải tin nhắn…</p>}
            {messagePages[chat.id]?.nextCursor && (
              <button
                type="button"
                className="secondary"
                disabled={messageLoading}
                onClick={() => void loadOlderMessages(chat.id)}
              >
                Tải tin cũ hơn
              </button>
            )}
            {messagePages[chat.id]?.items
              .slice()
              .reverse()
              .map((message) => (
                <article
                  key={message.id}
                  className={`social-bubble ${message.direction === 'OUTBOUND' ? 'outbound' : 'inbound'}`}
                >
                  <small>
                    {message.direction === 'OUTBOUND' ? activeAccount : 'Khách'} ·{' '}
                    {socialDateTime(message.providerAt)} ·{' '}
                    {message.importJobId ? 'Lịch sử Meta' : 'Webhook'}
                  </small>
                  <p>{message.body ?? `Nội dung ${message.contentType}`}</p>
                  {message.mediaMetadata != null && <small>Có dữ liệu tệp đính kèm từ kênh</small>}
                </article>
              ))}
            {messagePages[chat.id]?.items.length === 0 && (
              <p>Chưa có tin nhắn lưu trong hội thoại.</p>
            )}
          </div>
        )}
        {comment && (
          <div className="social-thread">
            <article className="social-comment-context">
              <small>Bài viết nguồn · {comment.externalPostId}</small>
              <p>CRM chưa lưu nội dung bài viết gốc. Mở permalink để xem ngữ cảnh trên Facebook.</p>
              {facebookSourceUrl(comment.sourceUrl) && (
                <a href={facebookSourceUrl(comment.sourceUrl)!} target="_blank" rel="noreferrer">
                  Mở bình luận trên Facebook ↗
                </a>
              )}
            </article>
            {comment.externalParentId && (
              <p className="social-parent">
                Trả lời bình luận {comment.externalParentId}
                {parentComment?.body
                  ? `: ${parentComment.body}`
                  : ' (chưa có nội dung cha trong CRM)'}
              </p>
            )}
            <article className="social-bubble inbound">
              <small>
                {comment.authorDisplayName ?? 'Tác giả ngoài'} ·{' '}
                {socialDateTime(comment.providerAt)} ·{' '}
                {comment.importJobId ? 'Lịch sử Meta' : 'Webhook'}
              </small>
              <p>{comment.body ?? '(Không có nội dung)'}</p>
            </article>
            <small>Trạng thái nguồn: {comment.status}</small>
          </div>
        )}
        {ticket && (
          <div className="social-thread">
            <article className="social-comment-context">
              <small>
                {ticket.conversationId ? 'Từ chat' : 'Từ bình luận'} · {ticketKinds[ticket.kind]}
              </small>
              <p>{ticket.summary}</p>
              {facebookSourceUrl(ticket.sourceUrl) && (
                <a href={facebookSourceUrl(ticket.sourceUrl)!} target="_blank" rel="noreferrer">
                  Mở nguồn ↗
                </a>
              )}
            </article>
            <h3>Lịch sử xử lý</h3>
            {ticket.events.map((event) => (
              <p key={event.id}>
                {event.action === 'CREATED' ? 'Tạo ticket' : 'Cập nhật ticket'} ·{' '}
                {event.actor.displayName} · {socialDateTime(event.createdAt)}
              </p>
            ))}
          </div>
        )}
        {sendSource && (
          <div className="social-compose">
            {outbounds.slice(0, 5).map((row) => (
              <p key={row.id} className="social-send-status" role="status">
                {row.status === 'SENT_TO_PROVIDER'
                  ? 'Meta đã nhận'
                  : row.status === 'SENDING' || row.status === 'PENDING'
                    ? 'Đang gửi'
                    : row.status === 'UNKNOWN'
                      ? 'Chưa rõ Meta đã nhận; không tự gửi lại'
                      : 'Meta từ chối'}{' '}
                · {socialDateTime(row.acceptedAt ?? row.createdAt)}
                {row.errorCode ? ` · ${sendReasons[row.errorCode] ?? row.errorCode}` : ''}
              </p>
            ))}
            {sendCapability === null ? (
              <p className="social-compose-note">Đang kiểm tra quyền gửi với Meta…</p>
            ) : sendCapability.canSend ? (
              <form onSubmit={(event) => void sendSocialReply(event)}>
                <label htmlFor="social-reply-body">
                  {chat ? 'Trả lời Messenger' : 'Trả lời bình luận Facebook'}
                </label>
                <textarea
                  id="social-reply-body"
                  value={currentDraft.body}
                  maxLength={2000}
                  rows={3}
                  placeholder="Nhập nội dung trả lời…"
                  onChange={(event) =>
                    setDrafts((value) => ({
                      ...value,
                      [sendSource.key]: { ...currentDraft, body: event.target.value, key: '' },
                    }))
                  }
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      event.currentTarget.form?.requestSubmit();
                    }
                  }}
                />
                <div className="social-compose-actions">
                  <small>Enter gửi · Shift+Enter xuống dòng</small>
                  <button
                    type="submit"
                    className="primary"
                    disabled={sendBusy || !currentDraft.body.trim()}
                  >
                    {sendBusy ? 'Đang gửi…' : 'Gửi'}
                  </button>
                </div>
              </form>
            ) : (
              <p className="social-compose-note">
                {sendReasons[sendCapability.status] ?? `Chưa thể gửi: ${sendCapability.status}.`}{' '}
                {comment && facebookSourceUrl(comment.sourceUrl) && (
                  <a href={facebookSourceUrl(comment.sourceUrl)!} target="_blank" rel="noreferrer">
                    Mở trong Facebook ↗
                  </a>
                )}
              </p>
            )}
          </div>
        )}
        {active?.type === 'ticket' && (
          <div className="social-compose-note">
            Mở chat hoặc bình luận nguồn để trả lời trên kênh.
          </div>
        )}
      </div>

      <aside className="social-profile social-panel" data-mobile-pane={mobilePane}>
        <div className="social-panel-head">
          <button type="button" className="social-back" onClick={() => setMobilePane('detail')}>
            ← Nội dung
          </button>
          <h2>Khách & xử lý</h2>
        </div>
        {active && (
          <div className="social-profile-body">
            <section>
              <h3>Nguồn</h3>
              <p>
                {activeProvider ? providerNames[activeProvider] : 'Kênh chưa rõ'} ·{' '}
                {activeAccount || 'Tài khoản chưa rõ'}
              </p>
              <p>
                {active.type === 'chat'
                  ? 'Hội thoại'
                  : active.type === 'comment'
                    ? 'Bình luận'
                    : 'Ticket'}
              </p>
            </section>
            {ticket && linkedCustomerId && (
              <section>
                <h3>Khách hàng đã liên kết</h3>
                <p>
                  {linkedCustomer
                    ? `${linkedCustomer.customerCode} · ${linkedCustomer.displayName}`
                    : 'Đã liên kết hồ sơ CRM; chi tiết chưa có trong danh sách tải.'}
                </p>
              </section>
            )}
            {chat && (
              <section>
                <h3>Khách hàng</h3>
                {chat.identity?.customerId ? (
                  <p>
                    {linkedCustomer
                      ? `${linkedCustomer.customerCode} · ${linkedCustomer.displayName}`
                      : 'Đã liên kết hồ sơ CRM; chi tiết chưa có trong danh sách tải.'}
                  </p>
                ) : (
                  <p>
                    Chưa liên kết hồ sơ CRM. ID Messenger không chứng minh danh tính tác giả bình
                    luận.
                  </p>
                )}
                {chat.identity &&
                  !chat.identity.customerId &&
                  staff.permissions.includes('integrations.customer.link') && (
                    <div className="social-form">
                      <label>
                        Liên kết hồ sơ CRM
                        <select
                          value={identityTargets[chat.identity.id] ?? ''}
                          onChange={(event) =>
                            setIdentityTargets((current) => ({
                              ...current,
                              [chat.identity!.id]: event.target.value,
                            }))
                          }
                        >
                          <option value="">Chọn khách</option>
                          {customers.map((row) => (
                            <option key={row.id} value={row.id}>
                              {row.customerCode} · {row.displayName}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button
                        className="secondary"
                        disabled={busy || !identityTargets[chat.identity.id]}
                        onClick={() => void previewIdentityLink(chat.identity!.id)}
                      >
                        Xem trước
                      </button>
                      {identityPreviews[chat.identity.id] && (
                        <div className="profile-note">
                          <p>
                            Liên kết với{' '}
                            {identityPreviews[chat.identity.id].targetCustomer.displayName}
                          </p>
                          <button
                            className="secondary"
                            disabled={busy}
                            onClick={() => void confirmIdentityLink(chat.identity!.id)}
                          >
                            Xác nhận liên kết
                          </button>
                        </div>
                      )}
                    </div>
                  )}
              </section>
            )}
            {linkedOrders.length > 0 && (
              <section>
                <h3>Đơn ngoài đã liên kết</h3>
                {linkedOrders.map((row) => (
                  <p key={row.id}>
                    {row.externalOrderId} · {row.normalizedStatus}
                  </p>
                ))}
              </section>
            )}
            {chat?.identity?.customerId &&
              staff.permissions.includes('quotes.write') &&
              onCreateQuote && (
                <section>
                  <h3>Bán hàng</h3>
                  <button
                    className="secondary"
                    onClick={() =>
                      onCreateQuote({
                        customerId: chat.identity!.customerId!,
                        conversationId: chat.id,
                        accountName: chat.connection.displayName,
                      })
                    }
                  >
                    Tạo báo giá nháp từ hội thoại
                  </button>
                  <p>Kiểm tra SKU, giá, tồn và nội dung trước khi phát hành hoặc chốt đơn.</p>
                </section>
              )}
            {chat && (
              <section>
                <h3>Hội thoại</h3>
                <label>
                  Trạng thái
                  <select
                    value={chat.status}
                    disabled={busy || !staff.permissions.includes('integrations.inbox.manage')}
                    onChange={(event) =>
                      void action(`/integrations/conversations/${chat.id}`, 'PATCH', {
                        status: event.target.value,
                      })
                    }
                  >
                    <option value="OPEN">Mới</option>
                    <option value="IN_PROGRESS">Đang xử lý</option>
                    <option value="RESOLVED">Đã xử lý</option>
                  </select>
                </label>
                <p>Phụ trách: {chat.assignedStaff?.displayName ?? 'Chưa giao'}</p>
                <label>
                  Giao cho
                  <select
                    value={chat.assignedStaff?.id ?? ''}
                    disabled={busy || !staff.permissions.includes('integrations.inbox.manage')}
                    onChange={(event) =>
                      void action(`/integrations/conversations/${chat.id}`, 'PATCH', {
                        assignedStaffId: event.target.value || null,
                      })
                    }
                  >
                    <option value="">Chưa giao</option>
                    {assignees.map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.displayName}
                      </option>
                    ))}
                  </select>
                </label>
              </section>
            )}
            {chat && (
              <section>
                <h3>Ghi chú nội bộ</h3>
                {chat.notes.map((note, index) => (
                  <p key={`${note.createdAt}-${index}`}>
                    {note.createdBy.displayName} · {note.body}
                  </p>
                ))}
                {staff.permissions.includes('integrations.inbox.manage') && (
                  <form className="social-form" onSubmit={(event) => void addNote(event, chat.id)}>
                    <input
                      name="body"
                      maxLength={4000}
                      required
                      placeholder="Ghi chú, không gửi cho khách"
                    />
                    <button className="secondary" disabled={busy}>
                      Lưu ghi chú
                    </button>
                  </form>
                )}
              </section>
            )}
            {(chat || comment) && (
              <section>
                <h3>Ticket liên quan</h3>
                {relatedTickets.length === 0 && <p>Chưa có ticket.</p>}
                {relatedTickets.map((row) => (
                  <button
                    key={row.id}
                    className="social-ticket-link"
                    onClick={() => {
                      setView('ticket');
                      setSelection({ type: 'ticket', id: row.id, at: row.updatedAt });
                      setMobilePane('detail');
                    }}
                  >
                    {ticketKinds[row.kind]} · {ticketStatuses[row.status]} · {row.summary}
                  </button>
                ))}
                {staff.permissions.includes('integrations.inbox.manage') && (
                  <form className="social-form" onSubmit={(event) => void createTicket(event)}>
                    <label>
                      Loại yêu cầu
                      <select name="kind">
                        {Object.entries(ticketKinds).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Ưu tiên
                      <select name="priority">
                        {Object.entries(priorities).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Người xử lý
                      <select name="assignedStaffId">
                        <option value="">Chưa giao</option>
                        {assignees.map((row) => (
                          <option key={row.id} value={row.id}>
                            {row.displayName}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Tóm tắt
                      <input name="summary" maxLength={500} required />
                    </label>
                    <label>
                      Nhãn (cách nhau bằng dấu phẩy)
                      <input name="labels" maxLength={320} />
                    </label>
                    <button className="primary" disabled={ticketSaving}>
                      Tạo ticket
                    </button>
                  </form>
                )}
              </section>
            )}
            {ticket && (
              <section>
                <h3>Ticket</h3>
                <p>{ticket.summary}</p>
                <p>
                  {ticketKinds[ticket.kind]} · {priorities[ticket.priority]} ·{' '}
                  {ticketStatuses[ticket.status]}
                </p>
                <p>Nhãn: {ticket.labels.join(', ') || 'Chưa có'}</p>
                <p>Phụ trách: {ticket.assignedStaff?.displayName ?? 'Chưa giao'}</p>
                {staff.permissions.includes('integrations.inbox.manage') && (
                  <div className="social-form">
                    <label>
                      Loại yêu cầu
                      <select
                        value={ticket.kind}
                        disabled={busy}
                        onChange={(event) =>
                          void updateTicket(ticket.id, ticket.version, { kind: event.target.value })
                        }
                      >
                        {Object.entries(ticketKinds).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Ưu tiên
                      <select
                        value={ticket.priority}
                        disabled={busy}
                        onChange={(event) =>
                          void updateTicket(ticket.id, ticket.version, {
                            priority: event.target.value,
                          })
                        }
                      >
                        {Object.entries(priorities).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Trạng thái
                      <select
                        value={ticket.status}
                        disabled={busy}
                        onChange={(event) =>
                          void updateTicket(ticket.id, ticket.version, {
                            status: event.target.value,
                          })
                        }
                      >
                        {Object.entries(ticketStatuses).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Người xử lý
                      <select
                        value={ticket.assignedStaff?.id ?? ''}
                        disabled={busy}
                        onChange={(event) =>
                          void updateTicket(ticket.id, ticket.version, {
                            assignedStaffId: event.target.value || null,
                          })
                        }
                      >
                        <option value="">Chưa giao</option>
                        {assignees.map((row) => (
                          <option key={row.id} value={row.id}>
                            {row.displayName}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Nhãn
                      <input
                        key={ticket.version}
                        defaultValue={ticket.labels.join(', ')}
                        disabled={busy}
                        onBlur={(event) => {
                          const labels = event.target.value
                            .split(',')
                            .map((item) => item.trim())
                            .filter(Boolean);
                          if (labels.join(',') !== ticket.labels.join(','))
                            void updateTicket(ticket.id, ticket.version, { labels });
                        }}
                      />
                    </label>
                  </div>
                )}
              </section>
            )}
          </div>
        )}
      </aside>
    </section>
  );
}
