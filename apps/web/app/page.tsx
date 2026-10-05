'use client';

import { FormEvent, useEffect, useState } from 'react';
import { api, type Staff } from './api-client';
import { CustomerWorkspace } from './customer-workspace';
import { InventoryWorkspace } from './inventory-workspace';
import { OverviewWorkspace } from './overview-workspace';
import { ProductWorkspace } from './product-workspace';
import { PurchasingWorkspace } from './purchasing-workspace';
import { PricingWorkspace } from './pricing-workspace';

export default function Home() {
  const [staff, setStaff] = useState<Staff | null>(null);
  const [checking, setChecking] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [view, setView] = useState<
    'overview' | 'customers' | 'products' | 'purchasing' | 'inventory' | 'pricing'
  >('overview');

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
            Theo dõi khách hàng, sản phẩm, mua hàng và tồn kho trong cùng một hệ thống.
          </p>
          <div className="security-note">
            <span>✓</span> Phiên đăng nhập HttpOnly · Quyền kiểm tra tại backend · Có nhật ký
          </div>
        </section>
        <section className="login-panel">
          <form className="login-card" onSubmit={login}>
            <p className="eyebrow">KHU VỰC NHÂN VIÊN</p>
            <h2>Đăng nhập Sơn CRM</h2>
            <p className="muted">Dùng tài khoản nhân viên đã được cấp.</p>
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
          <button
            className={view === 'overview' ? 'active' : ''}
            onClick={() => setView('overview')}
          >
            Tổng quan
          </button>
          <button
            className={view === 'customers' ? 'active' : ''}
            onClick={() => setView('customers')}
            disabled={!staff.permissions.includes('customers.read')}
          >
            Khách hàng
          </button>
          <button
            className={view === 'products' ? 'active' : ''}
            onClick={() => setView('products')}
            disabled={!staff.permissions.includes('catalog.read')}
          >
            Sản phẩm
          </button>
          <button
            className={view === 'purchasing' ? 'active' : ''}
            onClick={() => setView('purchasing')}
            disabled={!staff.permissions.includes('purchasing.read')}
          >
            Mua hàng
          </button>
          <button
            className={view === 'inventory' ? 'active' : ''}
            onClick={() => setView('inventory')}
            disabled={!staff.permissions.includes('inventory.read')}
          >
            Kho
          </button>
          {staff.permissions.includes('price.edit') && (
            <button
              className={view === 'pricing' ? 'active' : ''}
              onClick={() => setView('pricing')}
            >
              Bảng giá
            </button>
          )}
        </nav>
        <div className="staff-mini">
          <b>{staff.displayName}</b>
          <span>{staff.email}</span>
        </div>
      </aside>
      {view === 'customers' ? (
        <CustomerWorkspace staff={staff} onLogout={logout} loggingOut={submitting} />
      ) : view === 'products' ? (
        <ProductWorkspace staff={staff} onLogout={logout} loggingOut={submitting} />
      ) : view === 'purchasing' ? (
        <PurchasingWorkspace staff={staff} onLogout={logout} loggingOut={submitting} />
      ) : view === 'inventory' ? (
        <InventoryWorkspace staff={staff} onLogout={logout} loggingOut={submitting} />
      ) : view === 'pricing' ? (
        <PricingWorkspace staff={staff} onLogout={logout} loggingOut={submitting} />
      ) : (
        <OverviewWorkspace
          staff={staff}
          onLogout={logout}
          loggingOut={submitting}
          onNavigate={setView}
        />
      )}
    </main>
  );
}
