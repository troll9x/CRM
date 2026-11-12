'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { api, type Staff } from './api-client';
import { CustomerWorkspace } from './customer-workspace';
import { InventoryWorkspace } from './inventory-workspace';
import { OverviewWorkspace } from './overview-workspace';
import { ProductWorkspace } from './product-workspace';
import { PurchasingWorkspace } from './purchasing-workspace';
import { PricingWorkspace } from './pricing-workspace';
import { QuotesWorkspace } from './quotes-workspace';
import { OrdersWorkspace } from './orders-workspace';
import { ReturnsWorkspace } from './returns-workspace';
import { ReceivablesWorkspace } from './receivables-workspace';
import { ShipmentsWorkspace } from './shipments-workspace';
import { IntegrationsWorkspace } from './integrations-workspace';
import { StaffWorkspace } from './staff-workspace';
import { CrmShell } from './crm-shell';
import { CrmIcon } from './crm-icon';
import { useWorkspaceNavigation } from './use-workspace-navigation';

export default function Home() {
  const [staff, setStaff] = useState<Staff | null>(null);
  const [checking, setChecking] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [quoteFromChat, setQuoteFromChat] = useState<{
    customerId: string;
    conversationId: string;
    accountName: string;
  } | null>(null);
  const { view, navigate, items } = useWorkspaceNavigation(staff?.permissions ?? []);

  useEffect(() => {
    let active = true;
    function expired() {
      setStaff(null);
      setMessage(
        'Phiên đăng nhập đã hết hạn hoặc quyền truy cập đã thay đổi. Vui lòng đăng nhập lại.',
      );
    }
    window.addEventListener('crm:session-expired', expired);
    api<Staff>('/me')
      .then((current) => {
        if (active) setStaff(current);
      })
      .catch(() => {
        if (active) setStaff(null);
      })
      .finally(() => {
        if (active) setChecking(false);
      });
    return () => {
      active = false;
      window.removeEventListener('crm:session-expired', expired);
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
      setShowPassword(false);
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
      setMessage('');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Đăng xuất không thành công.');
    } finally {
      setSubmitting(false);
    }
  }

  if (checking)
    return (
      <main className="center-page crm-loading-page">
        <span className="crm-brand-mark">S</span>
        <div role="status" className="loading">
          Đang mở không gian làm việc…
        </div>
      </main>
    );

  if (!staff)
    return (
      <main className="login-page commercial-login">
        <section className="login-brand">
          <div className="crm-login-logo">
            <span className="crm-brand-mark">S</span>
            <strong>Sơn CRM</strong>
          </div>
          <div className="crm-login-intro">
            <p className="eyebrow">KHÔNG GIAN KINH DOANH CỦA BẠN</p>
            <h1>
              Từ cuộc trò chuyện
              <br />
              đến đơn hàng.
            </h1>
            <p className="brand-copy">
              Chăm sóc khách hàng, quản lý bán hàng và vận hành cửa hàng trong một không gian làm
              việc.
            </p>
            <div className="crm-login-workflow" aria-label="Quy trình bán hàng">
              <span>
                <CrmIcon name="customers" />
                Khách hàng
              </span>
              <CrmIcon name="chevron" />
              <span>
                <CrmIcon name="orders" />
                Đơn hàng
              </span>
              <CrmIcon name="chevron" />
              <span>
                <CrmIcon name="shipments" />
                Giao hàng
              </span>
            </div>
          </div>
          <p className="crm-login-footnote">Sơn CRM · Dành cho cửa hàng bán sỉ & bán lẻ</p>
        </section>
        <section className="login-panel">
          <form
            className="login-card"
            onSubmit={(event) => void login(event)}
            aria-busy={submitting}
          >
            <span className="crm-login-welcome">CHÀO MỪNG TRỞ LẠI</span>
            <h2>Đăng nhập Sơn CRM</h2>
            <p className="muted">Tiếp tục công việc của bạn hôm nay.</p>
            <fieldset disabled={submitting}>
              <label>
                Email đăng nhập
                <input
                  name="email"
                  type="email"
                  autoComplete="username"
                  placeholder="ten@cuahang.vn"
                  required
                  autoCapitalize="none"
                  spellCheck={false}
                />
              </label>
              <label htmlFor="crm-password">Mật khẩu</label>
              <div className="crm-password-input">
                <input
                  id="crm-password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  minLength={12}
                  required
                  placeholder="Nhập mật khẩu của bạn"
                />
                <button
                  type="button"
                  aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                  aria-pressed={showPassword}
                  onClick={() => setShowPassword((current) => !current)}
                >
                  <CrmIcon name={showPassword ? 'eye-off' : 'eye'} />
                </button>
              </div>
              {message && (
                <div className="error-message" role="alert">
                  {message}
                </div>
              )}
              <button className="primary" type="submit">
                {submitting ? 'Đang đăng nhập…' : 'Đăng nhập'}
                <CrmIcon name="chevron" />
              </button>
            </fieldset>
            <p className="crm-login-help">
              Chưa có tài khoản hoặc quên mật khẩu?
              <br />
              Liên hệ người quản trị cửa hàng để được hỗ trợ.
            </p>
            <div className="crm-login-links">
              <Link href="/privacy">Quyền riêng tư</Link>
              <span>·</span>
              <Link href="/data-deletion">Yêu cầu dữ liệu</Link>
            </div>
          </form>
        </section>
      </main>
    );

  const common = { staff, onLogout: logout, loggingOut: submitting };
  return (
    <CrmShell {...common} view={view} items={items} onNavigate={navigate}>
      {message && (
        <p className="error-message crm-shell-error" role="alert">
          {message}
        </p>
      )}
      {view === 'staff' ? (
        <StaffWorkspace {...common} />
      ) : view === 'customers' ? (
        <CustomerWorkspace {...common} />
      ) : view === 'products' ? (
        <ProductWorkspace {...common} />
      ) : view === 'purchasing' ? (
        <PurchasingWorkspace {...common} />
      ) : view === 'inventory' ? (
        <InventoryWorkspace {...common} />
      ) : view === 'pricing' ? (
        <PricingWorkspace {...common} />
      ) : view === 'quotes' ? (
        <QuotesWorkspace {...common} fromChat={quoteFromChat} />
      ) : view === 'orders' ? (
        <OrdersWorkspace {...common} />
      ) : view === 'returns' ? (
        <ReturnsWorkspace {...common} />
      ) : view === 'receivables' ? (
        <ReceivablesWorkspace {...common} />
      ) : view === 'shipments' ? (
        <ShipmentsWorkspace {...common} />
      ) : view === 'integrations' ? (
        <IntegrationsWorkspace
          {...common}
          onCreateQuote={(source) => {
            setQuoteFromChat(source);
            navigate('quotes');
          }}
        />
      ) : view === 'overview' ? (
        <OverviewWorkspace {...common} onNavigate={navigate} />
      ) : (
        <section className="crm-no-access">
          <span className="crm-no-access-icon">
            <CrmIcon name="staff" />
          </span>
          <p className="eyebrow">QUYỀN TRUY CẬP</p>
          <h1>Tài khoản đã sẵn sàng</h1>
          <p>
            Bạn chưa được phân quyền sử dụng chức năng nào. Liên hệ người quản trị để được gán vai
            trò phù hợp.
          </p>
          <button
            type="button"
            className="ghost"
            disabled={submitting}
            onClick={() => window.location.reload()}
          >
            Kiểm tra lại quyền
          </button>
        </section>
      )}
    </CrmShell>
  );
}
