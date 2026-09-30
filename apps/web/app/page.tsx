'use client';

import { FormEvent, useEffect, useState } from 'react';

type Staff = {
  id: string;
  displayName: string;
  email: string;
  businessId: string;
  roles: string[];
  permissions: string[];
};

type ApiSuccess<T> = { data: T; meta: { requestId: string } };
type ApiFailure = { error: { code: string; message: string }; meta?: { requestId: string } };

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    credentials: 'include',
    headers: { 'content-type': 'application/json', ...options?.headers },
  });
  const payload = (await response.json()) as ApiSuccess<T> | ApiFailure;
  if (!response.ok || !('data' in payload)) {
    const failure = payload as ApiFailure;
    throw new Error(failure.error?.message ?? 'Không thể kết nối API.');
  }
  return payload.data;
}

export default function Home() {
  const [staff, setStaff] = useState<Staff | null>(null);
  const [checking, setChecking] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let active = true;
    api<Staff>('/me')
      .then((currentStaff) => {
        if (active) setStaff(currentStaff);
      })
      .catch(() => {
        if (active) setStaff(null);
      })
      .finally(() => {
        if (active) setChecking(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setMessage('');
    const form = new FormData(event.currentTarget);
    try {
      const result = await api<{ staff: Staff }>('/auth/sessions', {
        method: 'POST',
        body: JSON.stringify({ email: form.get('email'), password: form.get('password') }),
      });
      setStaff(result.staff);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Đăng nhập không thành công.');
    } finally {
      setSubmitting(false);
    }
  }

  async function logout() {
    setSubmitting(true);
    try {
      await api('/auth/session', { method: 'DELETE' });
      setStaff(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Đăng xuất không thành công.');
    } finally {
      setSubmitting(false);
    }
  }

  if (checking) {
    return (
      <main className="center-page">
        <div className="loading">Đang kiểm tra phiên đăng nhập…</div>
      </main>
    );
  }

  if (!staff) {
    return (
      <main className="login-page">
        <section className="login-brand">
          <div className="brand-mark">S</div>
          <p className="eyebrow">CRM BÁN SỈ & BÁN LẺ</p>
          <h1>Một nơi để theo dõi khách, đơn, kho và công nợ.</h1>
          <p className="brand-copy">
            Đợt 01 đang kích hoạt nền tảng bảo mật và phân quyền. Dữ liệu bán hàng sẽ chỉ xuất hiện
            khi các module tương ứng dùng API và cơ sở dữ liệu thật.
          </p>
          <div className="security-note">
            <span>✓</span> Phiên đăng nhập HttpOnly · Quyền kiểm tra tại backend · Có nhật ký
          </div>
        </section>
        <section className="login-panel">
          <form className="login-card" onSubmit={login}>
            <p className="eyebrow">KHU VỰC NHÂN VIÊN</p>
            <h2>Đăng nhập Sơn CRM</h2>
            <p className="muted">Dùng tài khoản owner được tạo bằng lệnh seed local.</p>
            <label>
              Email
              <input
                name="email"
                type="email"
                autoComplete="username"
                placeholder="owner@crm.local"
                required
              />
            </label>
            <label>
              Mật khẩu
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                minLength={12}
                required
              />
            </label>
            {message && (
              <div className="error-message" role="alert">
                {message}
              </div>
            )}
            <button className="primary" disabled={submitting}>
              {submitting ? 'Đang đăng nhập…' : 'Đăng nhập'}
            </button>
            <small>Không đưa mật khẩu thật vào Git, frontend hoặc log.</small>
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className="dashboard-shell">
      <aside>
        <div className="sidebar-brand">
          <span>S</span>
          <strong>Sơn CRM</strong>
        </div>
        <nav>
          <button className="active">Tổng quan nền tảng</button>
          <button disabled>
            Khách hàng <small>Đợt 02</small>
          </button>
          <button disabled>
            Sản phẩm <small>Đợt 03</small>
          </button>
          <button disabled>
            Kho <small>Đợt 04</small>
          </button>
        </nav>
        <div className="staff-mini">
          <b>{staff.displayName}</b>
          <span>{staff.email}</span>
        </div>
      </aside>
      <section className="dashboard-content">
        <header>
          <div>
            <p className="eyebrow">ĐỢT 01 · NỀN TẢNG</p>
            <h1>Hệ thống đã nhận diện bạn</h1>
          </div>
          <button className="ghost" onClick={logout} disabled={submitting}>
            Đăng xuất
          </button>
        </header>
        <div className="notice">
          <b>Chưa có dữ liệu bán hàng giả.</b>
          <span>Các thẻ dưới đây phản ánh năng lực nền tảng thật đã được API trả về.</span>
        </div>
        <div className="foundation-grid">
          <article>
            <i>01</i>
            <h3>Phiên nhân viên</h3>
            <p>Cookie HttpOnly, có thời hạn và có thể thu hồi khi đăng xuất hoặc khóa tài khoản.</p>
            <strong>Sẵn sàng</strong>
          </article>
          <article>
            <i>02</i>
            <h3>Vai trò hiện tại</h3>
            <p>{staff.roles.length ? staff.roles.join(', ') : 'Chưa được gán vai trò'}</p>
            <strong>{staff.roles.length} vai trò</strong>
          </article>
          <article>
            <i>03</i>
            <h3>Quyền backend</h3>
            <p>API kiểm tra quyền trực tiếp, không chỉ ẩn nút trên giao diện.</p>
            <strong>{staff.permissions.length} quyền</strong>
          </article>
          <article>
            <i>04</i>
            <h3>Audit</h3>
            <p>Đăng nhập, đăng xuất, tạo/khóa nhân viên và đổi vai trò được ghi nhật ký.</p>
            <strong>Đang hoạt động</strong>
          </article>
        </div>
        <section className="permissions-card">
          <div>
            <p className="eyebrow">QUYỀN ĐƯỢC CẤP</p>
            <h2>Tài khoản {staff.displayName}</h2>
          </div>
          <div className="permission-list">
            {staff.permissions.map((permission) => (
              <span key={permission}>{permission}</span>
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}
