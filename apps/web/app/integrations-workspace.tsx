'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
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
type Customer = {
  id: string;
  customerCode: string;
  displayName: string;
  group: { code: string; name: string };
};
type Conversation = {
  id: string;
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
  assignedStaff: { displayName: string } | null;
  messages: Array<{ body: string | null; contentType: string; providerAt: string }>;
  notes: Array<{ body: string; createdAt: string; createdBy: { displayName: string } }>;
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
type SocialComment = {
  id: string;
  externalCommentId: string;
  externalPostId: string;
  externalAuthorId: string | null;
  authorDisplayName: string | null;
  body: string | null;
  sourceUrl: string | null;
  status: string;
  providerAt: string;
  connection: { provider: string; displayName: string };
};
type Product = {
  id: string;
  name: string;
  variants: Array<{ id: string; sku: string; name: string; baseUnitName: string }>;
};
type Props = { staff: Staff; onLogout: () => void; loggingOut: boolean };

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

export function facebookConnectionHint(connection: Connection): string | null {
  if (connection.provider !== 'FACEBOOK' || connection.status !== 'CONNECTED') return null;
  if (connection.capabilities?.webhookSubscription === 'APP_CONFIGURATION_PENDING')
    return 'Page đã được cấp quyền, nhưng webhook của ứng dụng Meta chưa xác minh/lưu; CRM chưa nhận được tin nhắn hoặc bình luận.';
  if (!connection.lastSyncAt)
    return 'Page đã được cấp quyền. CRM chưa ghi nhận sự kiện đồng bộ nào.';
  return null;
}

export function IntegrationsWorkspace({ staff, onLogout, loggingOut }: Props) {
  const [tab, setTab] = useState<
    'connections' | 'inbox' | 'comments' | 'orders' | 'jobs' | 'mapping'
  >('connections');
  const [connections, setConnections] = useState<Connection[]>([]);
  const [providerPreflight, setProviderPreflight] = useState<ProviderPreflight[]>([]);
  const [channelAttempt, setChannelAttempt] = useState<ChannelAttempt | null>(null);
  const [attemptProvider, setAttemptProvider] = useState<'facebook' | 'zalo'>('facebook');
  const [selectedPage, setSelectedPage] = useState('');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [orders, setOrders] = useState<ExternalOrder[]>([]);
  const [comments, setComments] = useState<SocialComment[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [identityTargets, setIdentityTargets] = useState<Record<string, string>>({});
  const [identityPreviews, setIdentityPreviews] = useState<Record<string, IdentityPreview>>({});
  const connectedFacebook = connections.find(
    (connection) => connection.provider === 'FACEBOOK' && connection.status === 'CONNECTED',
  );

  const refresh = useCallback(async () => {
    setError('');
    try {
      const [c, i, cm, o, j] = await Promise.all([
        api<Connection[]>('/integrations/connections'),
        api<Conversation[]>('/integrations/inbox?limit=100'),
        api<SocialComment[]>('/integrations/comments?limit=100'),
        api<ExternalOrder[]>('/integrations/orders?limit=100'),
        staff.permissions.includes('connectors.manage')
          ? api<Job[]>('/integrations/jobs?limit=100')
          : Promise.resolve([]),
      ]);
      setConnections(c);
      if (staff.permissions.includes('connectors.manage')) {
        const preflight = await api<ProviderPreflight[]>('/integrations/providers/preflight');
        setProviderPreflight(preflight);
      }
      setConversations(i);
      setComments(cm);
      setOrders(o);
      setJobs(j);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không tải được dữ liệu tích hợp.');
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
    if (!channelAttempt || !selectedPage) return;
    setBusy(true);
    setError('');
    try {
      const result = await api<{ displayName: string }>(
        `/integrations/oauth/${attemptProvider}/attempts/${encodeURIComponent(channelAttempt.id)}/finalize`,
        {
          method: 'POST',
          body: JSON.stringify(
            attemptProvider === 'zalo' ? { oaId: selectedPage } : { pageId: selectedPage },
          ),
        },
      );
      setNotice(
        attemptProvider === 'zalo'
          ? `Đã xác thực OA ${result.displayName}. Cần cấu hình webhook trong Zalo App và thử sự kiện thật.`
          : `Đã cấp quyền và xác nhận đăng ký Page ${result.displayName}. Cần xác minh webhook ở ứng dụng Meta và bật trường messages trước khi CRM nhận tin.`,
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
          <p>Chỉ nhập dữ liệu về CRM; không tự tạo đơn bán, xuất kho hay ghi nhận thanh toán.</p>
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
      {notice && (
        <div className="success-message" role="status">
          {notice}
        </div>
      )}
      <div className="integration-status-note">
        <strong>Trạng thái thật:</strong>{' '}
        {connectedFacebook
          ? (facebookConnectionHint(connectedFacebook) ??
            'Facebook Page đã được xác thực. Hãy kiểm tra nhật ký đồng bộ để xác nhận có sự kiện mới.')
          : 'Chưa có Facebook Page nào được xác thực. Tạo mục kết nối chỉ ghi nhận Page/OA/shop cần cấu hình; không mô phỏng dữ liệu hoặc báo “đã kết nối”.'}
      </div>
      <nav className="integration-tabs">
        {(['connections', 'inbox', 'comments', 'orders', 'jobs', 'mapping'] as const).map(
          (item) => (
            <button
              key={item}
              className={tab === item ? 'active' : ''}
              onClick={() => setTab(item)}
            >
              {
                {
                  connections: 'Kết nối',
                  inbox: `Tin nhắn (${conversations.length})`,
                  comments: `Bình luận (${comments.length})`,
                  orders: `Đơn sàn (${orders.length})`,
                  jobs: 'Nhật ký đồng bộ',
                  mapping: 'Liên kết SKU',
                }[item]
              }
            </button>
          ),
        )}
      </nav>

      {tab === 'connections' && (
        <section className="integration-panel">
          <h2>Tài khoản kênh</h2>
          {staff.permissions.includes('connectors.manage') && (
            <div className="integration-form">
              <h3>Kết nối Facebook Page</h3>
              <p>
                Bấm kết nối, đăng nhập Facebook và cấp quyền một lần. Sau đó chọn Fanpage bạn muốn
                nhận tin nhắn và bình luận. Bạn không cần tạo ứng dụng Meta hay nhập mã kỹ thuật.
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
                  <label>
                    {attemptProvider === 'zalo' ? 'OA được cấp quyền' : 'Page được cấp quyền'}
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
                  {channelAttempt.accounts.length === 0 && (
                    <p>
                      Không tìm thấy Fanpage/OA được cấp quyền. Hãy kiểm tra quyền quản lý tài khoản
                      rồi thử kết nối lại.
                    </p>
                  )}
                  <button
                    className="primary"
                    disabled={busy || !selectedPage}
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
                      ? `Đồng bộ gần nhất: ${new Date(connection.lastSyncAt).toLocaleString('vi-VN')}`
                      : 'Chưa có lần đồng bộ thành công'}
                </small>
                {(connection.provider === 'FACEBOOK' || connection.provider === 'ZALO') && (
                  <p className="muted">
                    Cấp quyền: {connection.capabilities?.authorization ?? 'chưa xác minh'} · Webhook
                    : {connection.capabilities?.webhookSubscription ?? 'chưa đăng ký'} · Sự kiện
                    thử: {connection.lastSyncAt ? 'đã xử lý' : 'chưa nhận'}
                  </p>
                )}
                {facebookConnectionHint(connection) && (
                  <p className="integration-status-note" role="status">
                    {facebookConnectionHint(connection)}
                  </p>
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

      {tab === 'inbox' && (
        <section className="integration-list">
          <h2>Tin nhắn Messenger và Zalo OA</h2>
          <p className="muted">
            Tin mới được đánh dấu chưa đọc trong hộp thư. Hiện CRM chưa tạo thông báo quản lý riêng
            cho từng tin nhắn; thông báo nội bộ đang áp dụng cho đơn hàng và báo giá.
          </p>
          {conversations.length === 0 && <p>Chưa có hội thoại lưu từ webhook/API đã xác thực.</p>}
          {conversations.map((conversation) => (
            <article key={conversation.id} className="integration-item">
              <div>
                <span className="eyebrow">
                  {providerNames[conversation.connection.provider] ??
                    conversation.connection.provider}{' '}
                  · {conversation.status}
                </span>
                <h3>
                  {conversation.identity?.displayName ??
                    conversation.identity?.externalUserId ??
                    'Khách ngoài'}
                </h3>
                <p>
                  {conversation.messages[0]?.body ??
                    `Nội dung ${conversation.messages[0]?.contentType ?? 'tin nhắn đính kèm'}`}{' '}
                  ·{' '}
                  {conversation.lastMessageAt
                    ? new Date(conversation.lastMessageAt).toLocaleString('vi-VN')
                    : ''}
                </p>
                <label>
                  Trạng thái hội thoại
                  <select
                    value={conversation.status}
                    onChange={(e) =>
                      void action(`/integrations/conversations/${conversation.id}`, 'PATCH', {
                        status: e.target.value,
                      })
                    }
                  >
                    <option value="OPEN">Mới</option>
                    <option value="IN_PROGRESS">Đang xử lý</option>
                    <option value="RESOLVED">Đã xử lý</option>
                  </select>
                </label>
                {conversation.identity?.customerId ? (
                  <small>Đã liên kết khách CRM</small>
                ) : conversation.identity &&
                  staff.permissions.includes('integrations.customer.link') ? (
                  <div className="integration-form">
                    <label>
                      Chọn hồ sơ CRM
                      <select
                        value={identityTargets[conversation.identity.id] ?? ''}
                        onChange={(e) =>
                          setIdentityTargets((current) => ({
                            ...current,
                            [conversation.identity!.id]: e.target.value,
                          }))
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
                    <button
                      className="secondary"
                      disabled={busy || !identityTargets[conversation.identity.id]}
                      onClick={() => void previewIdentityLink(conversation.identity!.id)}
                    >
                      Xem trước
                    </button>
                    {identityPreviews[conversation.identity.id] && (
                      <div className="profile-note">
                        <p>
                          {identityPreviews[conversation.identity.id]!.identity.provider} ·{' '}
                          {identityPreviews[conversation.identity.id]!.identity.account} ·{' '}
                          {identityPreviews[conversation.identity.id]!.identity.displayName ||
                            identityPreviews[conversation.identity.id]!.identity
                              .externalUserIdMasked}
                        </p>
                        <p>
                          Hiện tại:{' '}
                          {identityPreviews[conversation.identity.id]!.identity.currentCustomer
                            ?.displayName ?? 'Chưa liên kết'}{' '}
                          → đích:{' '}
                          {identityPreviews[conversation.identity.id]!.targetCustomer.displayName}
                        </p>
                        <button
                          className="primary compact"
                          disabled={busy}
                          onClick={() => void confirmIdentityLink(conversation.identity!.id)}
                        >
                          {identityPreviews[conversation.identity.id]!.requiresExplicitTransfer
                            ? 'Xác nhận chuyển liên kết'
                            : 'Xác nhận liên kết'}
                        </button>
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
              <div className="integration-note-list">
                {conversation.notes.map((note, index) => (
                  <p key={`${note.createdAt}-${index}`}>
                    <b>Ghi chú nội bộ · {note.createdBy.displayName}:</b> {note.body}
                  </p>
                ))}
                {staff.permissions.includes('integrations.inbox.manage') && (
                  <form onSubmit={(event) => void addNote(event, conversation.id)}>
                    <input
                      name="body"
                      placeholder="Ghi chú nội bộ (không gửi ra kênh)"
                      maxLength={4000}
                      required
                    />
                    <button className="secondary" disabled={busy}>
                      Lưu ghi chú
                    </button>
                  </form>
                )}
              </div>
            </article>
          ))}
        </section>
      )}

      {tab === 'comments' && (
        <section className="integration-list">
          <h2>Bình luận Fanpage</h2>
          <p className="muted">Bình luận được lưu riêng, không gộp vào hộp thư Messenger.</p>
          {comments.length === 0 && <p>Chưa có bình luận Facebook nhập từ webhook đã xác thực.</p>}
          {comments.map((comment) => (
            <article key={comment.id} className="integration-item">
              <div>
                <span className="eyebrow">
                  {providerNames[comment.connection.provider] ?? comment.connection.provider} ·{' '}
                  {comment.status}
                </span>
                <h3>{comment.authorDisplayName ?? comment.externalAuthorId ?? 'Tác giả ngoài'}</h3>
                <p>
                  {comment.body ?? '(không có nội dung)'} ·{' '}
                  {new Date(comment.providerAt).toLocaleString('vi-VN')}
                </p>
                <small>
                  Bài viết: {comment.externalPostId} · Bình luận: {comment.externalCommentId}
                </small>
                {comment.sourceUrl && (
                  <p>
                    <a href={comment.sourceUrl} target="_blank" rel="noreferrer">
                      Mở nội dung trên Facebook
                    </a>
                  </p>
                )}
                <small>
                  Không dùng ID tác giả comment làm Messenger identity nếu chưa xác minh mapping.
                </small>
              </div>
            </article>
          ))}
        </section>
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
          {!staff.permissions.includes('connectors.manage') ? (
            <p>Bạn không có quyền xem log kỹ thuật.</p>
          ) : jobs.length === 0 ? (
            <p>Chưa có webhook/job được lưu.</p>
          ) : (
            jobs.map((job) => (
              <article className="integration-job" key={job.id}>
                <span>
                  {job.kind} · {job.status} · {job.providerObjectId ?? job.id}
                </span>
                <small>
                  {job.attempts}/{job.maxAttempts} lần · {job.lastErrorCode ?? 'Không có lỗi'} ·{' '}
                  {new Date(job.receivedAt).toLocaleString('vi-VN')}
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
