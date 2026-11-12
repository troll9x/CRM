'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api, type Staff } from './api-client';

type Role = {
  code: string;
  name: string;
  description: string | null;
  permissions: Array<{ permissionKey: string; permission: { description: string } }>;
};
type Account = {
  id: string;
  email: string;
  displayName: string;
  status: 'ACTIVE' | 'LOCKED';
  createdAt: string;
  roles: Array<{ role: { code: string; name: string } }>;
  permissions: string[];
  canManage: boolean;
};
type Props = { staff: Staff; onLogout: () => Promise<void>; loggingOut: boolean };
const errorText = (error: unknown) =>
  error instanceof Error ? error.message : 'Không thực hiện được thao tác.';
const canAssign = (role: Role, actor: Staff) =>
  actor.permissions.includes('roles.manage') &&
  (role.code !== 'owner' || actor.roles.includes('owner')) &&
  role.permissions.every((p) => actor.permissions.includes(p.permissionKey));

function RolePicker({
  roles,
  selected,
  onChange,
  disabled,
  actor,
}: {
  roles: Role[];
  selected: string[];
  onChange: (codes: string[]) => void;
  disabled?: boolean;
  actor: Staff;
}) {
  return (
    <div className="staff-role-options">
      {roles.map((role) => (
        <div key={role.code}>
          <label className="staff-check">
            <input
              type="checkbox"
              checked={selected.includes(role.code)}
              disabled={disabled || !canAssign(role, actor)}
              onChange={(event) =>
                onChange(
                  event.target.checked
                    ? [...selected, role.code]
                    : selected.filter((code) => code !== role.code),
                )
              }
            />
            <span>
              <b>{role.name}</b>
              <small>{role.description}</small>
            </span>
          </label>
          <details>
            <summary>Xem {role.permissions.length} quyền</summary>
            <ul>
              {role.permissions.map((permission) => (
                <li key={permission.permissionKey}>
                  {permission.permission.description} <small>({permission.permissionKey})</small>
                </li>
              ))}
            </ul>
          </details>
        </div>
      ))}
    </div>
  );
}

export function StaffWorkspace({ staff, onLogout, loggingOut }: Props) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [creating, setCreating] = useState(false);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [revision, setRevision] = useState(0);
  const load = useCallback(async () => {
    try {
      const [users, availableRoles] = await Promise.all([
        api<Account[]>('/staff'),
        staff.permissions.includes('roles.manage') ? api<Role[]>('/roles') : Promise.resolve([]),
      ]);
      setAccounts(users);
      setRoles(availableRoles);
      setSelectedId((current) => current || users[0]?.id || '');
      setRevision((value) => value + 1);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setLoading(false);
    }
  }, [staff.permissions]);
  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);
  const selected = accounts.find((account) => account.id === selectedId);
  const filtered = accounts.filter(
    (account) =>
      (!status || account.status === status) &&
      `${account.displayName} ${account.email}`
        .toLocaleLowerCase('vi')
        .includes(query.trim().toLocaleLowerCase('vi')),
  );
  async function saved(message: string, id?: string) {
    setError('');
    setNotice(message);
    setCreating(false);
    if (id) setSelectedId(id);
    await load();
  }
  return (
    <main className="staff-workspace">
      <header>
        <div>
          <p className="eyebrow">QUẢN TRỊ</p>
          <h1>Tài khoản & phân quyền</h1>
          <p>Tạo tài khoản nhân viên, chọn vai trò và cấp quyền trên từng tài khoản kênh.</p>
        </div>
        <div className="action-row">
          <button
            onClick={() => {
              setError('');
              setLoading(true);
              void load();
            }}
            disabled={loading}
          >
            Làm mới
          </button>
          <button
            className="primary"
            onClick={() => {
              setCreating(true);
              setError('');
              setNotice('');
            }}
          >
            + Tạo tài khoản
          </button>
          <button onClick={() => void onLogout()} disabled={loggingOut} data-workspace-logout>
            Đăng xuất
          </button>
        </div>
      </header>
      {error && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="staff-notice" role="status">
          {notice}
        </p>
      )}
      <div className="staff-layout">
        <section className="staff-panel">
          <h2>Nhân viên ({accounts.length})</h2>
          <label>
            Tìm nhân viên
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Tên hoặc email"
            />
          </label>
          <label>
            Trạng thái
            <select value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="">Tất cả</option>
              <option value="ACTIVE">Đang hoạt động</option>
              <option value="LOCKED">Đã khóa</option>
            </select>
          </label>
          {loading && <p role="status">Đang tải tài khoản…</p>}
          <div className="staff-list">
            {filtered.map((account) => (
              <button
                key={account.id}
                className={selectedId === account.id && !creating ? 'selected' : ''}
                onClick={() => {
                  setSelectedId(account.id);
                  setCreating(false);
                  setError('');
                  setNotice('');
                }}
              >
                <b>
                  {account.displayName}
                  {account.id === staff.id ? ' (Bạn)' : ''}
                </b>
                <span>{account.email}</span>
                <small>
                  {account.roles.map(({ role }) => role.name).join(', ') || 'Chưa có vai trò'} ·{' '}
                  {account.status === 'ACTIVE' ? 'Hoạt động' : 'Đã khóa'}
                </small>
              </button>
            ))}
          </div>
          {!loading && !filtered.length && <p>Không có tài khoản phù hợp.</p>}
        </section>
        {creating ? (
          <CreateAccount
            actor={staff}
            roles={roles}
            onSaved={saved}
            onError={setError}
            onCancel={() => setCreating(false)}
          />
        ) : selected ? (
          <AccountDetail
            key={`${selected.id}:${revision}`}
            account={selected}
            actor={staff}
            roles={roles}
            onSaved={saved}
            onError={setError}
          />
        ) : (
          <section className="staff-panel">
            <p>Chọn nhân viên để xem và chỉnh quyền.</p>
          </section>
        )}
      </div>
    </main>
  );
}

function CreateAccount({
  actor,
  roles,
  onSaved,
  onError,
  onCancel,
}: {
  actor: Staff;
  roles: Role[];
  onSaved: (message: string, id?: string) => Promise<void>;
  onError: (message: string) => void;
  onCancel: () => void;
}) {
  const [roleCodes, setRoleCodes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    onError('');
    try {
      const result = await api<{ id: string }>('/staff', {
        method: 'POST',
        body: JSON.stringify({
          displayName: data.get('displayName'),
          email: data.get('email'),
          password: data.get('password'),
          roleCodes,
        }),
      });
      form.reset();
      await onSaved(
        'Đã tạo tài khoản. Nhân viên có thể đăng nhập bằng email và mật khẩu vừa cấp.',
        result.id,
      );
    } catch (error) {
      onError(errorText(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="staff-panel">
      <h2>Tạo tài khoản nhân viên</h2>
      <form onSubmit={(event) => void submit(event)}>
        <fieldset disabled={busy}>
          <label>
            Họ và tên
            <input name="displayName" required minLength={2} maxLength={120} autoComplete="off" />
          </label>
          <label>
            Email đăng nhập
            <input name="email" type="email" required maxLength={254} autoComplete="off" />
          </label>
          <label>
            Mật khẩu
            <input
              name="password"
              type="password"
              required
              minLength={12}
              maxLength={200}
              autoComplete="new-password"
            />
          </label>
          <small>Tối thiểu 12 ký tự. Gửi mật khẩu cho nhân viên qua kênh riêng.</small>
          <h3>Vai trò</h3>
          {roles.length ? (
            <RolePicker roles={roles} selected={roleCodes} onChange={setRoleCodes} actor={actor} />
          ) : (
            <p>Bạn chưa có quyền gán vai trò. Tài khoản mới sẽ chưa có quyền nghiệp vụ.</p>
          )}
          {!roleCodes.length && (
            <p className="muted">
              Chưa chọn vai trò: nhân viên đăng nhập được nhưng chưa có quyền sử dụng các module.
            </p>
          )}
          <div className="action-row">
            <button type="submit" className="primary">
              {busy ? 'Đang tạo…' : 'Tạo tài khoản'}
            </button>
            <button type="button" onClick={onCancel}>
              Hủy
            </button>
          </div>
        </fieldset>
      </form>
    </section>
  );
}

function AccountDetail({
  account,
  actor,
  roles,
  onSaved,
  onError,
}: {
  account: Account;
  actor: Staff;
  roles: Role[];
  onSaved: (message: string) => Promise<void>;
  onError: (message: string) => void;
}) {
  const [codes, setCodes] = useState(account.roles.map(({ role }) => role.code));
  const [busy, setBusy] = useState(false);
  const [confirmLock, setConfirmLock] = useState(false);
  const self = actor.id === account.id;
  const selectedPermissions = [
    ...new Set(
      roles
        .filter((role) => codes.includes(role.code))
        .flatMap((r) => r.permissions.map((p) => p.permissionKey)),
    ),
  ];
  async function mutate(path: string, method: string, body: unknown, message: string) {
    setBusy(true);
    onError('');
    try {
      await api(path, { method, body: JSON.stringify(body) });
      await onSaved(message);
      return true;
    } catch (error) {
      onError(errorText(error));
      return false;
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="staff-panel">
      <h2>{account.displayName}</h2>
      <p>
        {account.status === 'ACTIVE' ? 'Đang hoạt động' : 'Đã khóa'} · Tạo ngày{' '}
        {new Date(account.createdAt).toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}
      </p>
      {!account.canManage && <p>Bạn có thể xem tài khoản này nhưng không đủ quyền thay đổi.</p>}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          void mutate(
            `/staff/${account.id}`,
            'PATCH',
            { displayName: data.get('displayName'), email: data.get('email') },
            'Đã cập nhật thông tin tài khoản.',
          );
        }}
      >
        <fieldset disabled={busy || !account.canManage}>
          <label>
            Họ và tên
            <input
              name="displayName"
              defaultValue={account.displayName}
              required
              minLength={2}
              maxLength={120}
            />
          </label>
          <label>
            Email đăng nhập
            <input
              name="email"
              type="email"
              defaultValue={account.email}
              required
              maxLength={254}
            />
          </label>
          <button type="submit">Lưu thông tin</button>
        </fieldset>
      </form>
      <hr />
      <h3>Vai trò & quyền nghiệp vụ</h3>
      {roles.length ? (
        <>
          <RolePicker
            roles={roles}
            selected={codes}
            onChange={setCodes}
            disabled={busy || self || !account.canManage}
            actor={actor}
          />
          <p>
            Vai trò đã chọn cấp {selectedPermissions.length} quyền. Các quyền của nhiều vai trò được
            cộng lại.
          </p>
          {self ? (
            <p>Nhờ chủ cửa hàng khác thay đổi vai trò của bạn để tránh mất quyền quản trị.</p>
          ) : (
            account.canManage && (
              <button
                disabled={busy}
                onClick={() =>
                  void mutate(
                    `/staff/${account.id}/roles`,
                    'PUT',
                    { roleCodes: codes },
                    'Đã lưu vai trò và đăng xuất các phiên cũ của nhân viên.',
                  )
                }
              >
                Lưu vai trò và thu hồi phiên cũ
              </button>
            )
          )}
        </>
      ) : (
        <p>
          {account.roles.map(({ role }) => role.name).join(', ') || 'Chưa có vai trò'}. Bạn chưa có
          quyền thay đổi vai trò.
        </p>
      )}
      <details>
        <summary>Quyền hiện có ({account.permissions.length})</summary>
        <ul>
          {account.permissions.map((key) => (
            <li key={key}>
              {roles.flatMap((r) => r.permissions).find((p) => p.permissionKey === key)?.permission
                .description ?? key}
            </li>
          ))}
        </ul>
      </details>
      <hr />
      <h3>Truy cập tài khoản kênh</h3>
      {actor.permissions.includes('connectors.manage') &&
      actor.permissions.includes('integrations.read') ? (
        <ChannelAccess account={account} disabled={busy || !account.canManage} onError={onError} />
      ) : (
        <p>Cần quyền quản lý kết nối và xem hộp thư để phân quyền Page/OA/shop.</p>
      )}
      {!self && account.canManage && (
        <>
          <hr />
          <h3>Bảo mật tài khoản</h3>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const form = event.currentTarget;
              const password = new FormData(form).get('password');
              void mutate(
                `/staff/${account.id}/reset-password`,
                'POST',
                { password },
                'Đã đặt mật khẩu mới và thu hồi mọi phiên cũ.',
              ).then((success) => {
                if (success) form.reset();
              });
            }}
          >
            <fieldset disabled={busy}>
              <label>
                Mật khẩu mới
                <input
                  name="password"
                  type="password"
                  required
                  minLength={12}
                  maxLength={200}
                  autoComplete="new-password"
                />
              </label>
              <button type="submit">Đặt mật khẩu và đăng xuất các phiên</button>
            </fieldset>
          </form>
          {confirmLock ? (
            <div className="staff-confirm">
              <p>
                {account.status === 'ACTIVE'
                  ? `Khóa ${account.displayName} và đăng xuất mọi phiên đang dùng?`
                  : `Mở khóa ${account.displayName}?`}
              </p>
              <button
                disabled={busy}
                onClick={() =>
                  void mutate(
                    `/staff/${account.id}/lock`,
                    'PATCH',
                    { locked: account.status === 'ACTIVE' },
                    account.status === 'ACTIVE'
                      ? 'Đã khóa tài khoản và thu hồi phiên.'
                      : 'Đã mở khóa tài khoản.',
                  )
                }
              >
                Xác nhận {account.status === 'ACTIVE' ? 'khóa' : 'mở khóa'}
              </button>
              <button disabled={busy} onClick={() => setConfirmLock(false)}>
                Hủy
              </button>
            </div>
          ) : (
            <button disabled={busy} onClick={() => setConfirmLock(true)}>
              {account.status === 'ACTIVE' ? 'Khóa tài khoản' : 'Mở khóa tài khoản'}
            </button>
          )}
        </>
      )}
    </section>
  );
}

function ChannelAccess({
  account,
  disabled,
  onError,
}: {
  account: Account;
  disabled: boolean;
  onError: (message: string) => void;
}) {
  const [channels, setChannels] = useState<
    Array<{ id: string; displayName: string; provider: string }>
  >([]);
  const [grants, setGrants] = useState<Record<string, { canRead: boolean; canSend: boolean }>>({});
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState('');
  const [notice, setNotice] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    void (async () => {
      setLoading(true);
      setFailed(false);
      try {
        const rows = await api<Array<{ id: string; displayName: string; provider: string }>>(
          '/integrations/connections',
        );
        const all = await Promise.all(
          rows.map(async (row) => {
            const access = await api<
              Array<{ staffId: string; canRead: boolean; canSend: boolean }>
            >(`/integrations/connections/${row.id}/staff-access`);
            return [
              row.id,
              access.find((grant) => grant.staffId === account.id) ?? {
                canRead: false,
                canSend: false,
              },
            ] as const;
          }),
        );
        if (active) {
          setChannels(rows);
          setGrants(Object.fromEntries(all));
        }
      } catch (error) {
        if (active) {
          setFailed(true);
          onError(errorText(error));
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [account.id, onError, attempt]);
  if (account.permissions.includes('connectors.manage'))
    return (
      <p>
        Vai trò hiện có quyền quản lý kết nối, nên xem và quản lý mọi tài khoản kênh trong đơn vị.
      </p>
    );
  if (loading) return <p role="status">Đang tải quyền kênh…</p>;
  if (failed)
    return <button onClick={() => setAttempt((value) => value + 1)}>Thử tải lại quyền kênh</button>;
  async function save(id: string) {
    setSaving(id);
    setNotice('');
    onError('');
    try {
      await api(`/integrations/connections/${id}/staff-access/${account.id}`, {
        method: 'PUT',
        body: JSON.stringify(grants[id]),
      });
      setNotice('Đã lưu quyền kênh. Quyền xem/gửi còn phụ thuộc vai trò nghiệp vụ của nhân viên.');
    } catch (error) {
      onError(errorText(error));
    } finally {
      setSaving('');
    }
  }
  return (
    <div>
      {notice && <p role="status">{notice}</p>}
      {!account.permissions.includes('integrations.read') && (
        <p>Nhân viên cần vai trò có quyền xem hộp thư trước khi sử dụng quyền kênh.</p>
      )}
      {!channels.length && <p>Chưa có tài khoản kênh trong đơn vị.</p>}
      {channels.map((channel) => {
        const value = grants[channel.id] ?? { canRead: false, canSend: false };
        return (
          <fieldset key={channel.id} disabled={disabled || !!saving || account.status === 'LOCKED'}>
            <legend>
              {channel.displayName} · {channel.provider}
            </legend>
            <label className="staff-check">
              <input
                type="checkbox"
                checked={value.canRead}
                onChange={(event) =>
                  setGrants((current) => ({
                    ...current,
                    [channel.id]: {
                      canRead: event.target.checked,
                      canSend: event.target.checked && value.canSend,
                    },
                  }))
                }
              />
              Xem hộp thư
            </label>
            <label className="staff-check">
              <input
                type="checkbox"
                checked={value.canSend}
                disabled={!value.canRead}
                onChange={(event) =>
                  setGrants((current) => ({
                    ...current,
                    [channel.id]: { ...value, canSend: event.target.checked },
                  }))
                }
              />
              Gửi trả lời khi vai trò và Meta cho phép
            </label>
            <button onClick={() => void save(channel.id)}>
              {saving === channel.id ? 'Đang lưu…' : 'Lưu quyền kênh'}
            </button>
          </fieldset>
        );
      })}
      {account.status === 'LOCKED' && <p>Mở khóa tài khoản trước khi cấp lại quyền kênh.</p>}
    </div>
  );
}
