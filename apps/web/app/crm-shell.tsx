'use client';

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { Staff } from './api-client';
import { CrmIcon } from './crm-icon';
import { searchWorkspaces, type WorkspaceId, type WorkspaceItem } from './workspace-navigation';
import { WorkspaceBoundary } from './workspace-boundary';

const subscribeMobile = (callback: () => void) => {
  const media = window.matchMedia('(max-width: 960px)');
  media.addEventListener('change', callback);
  return () => media.removeEventListener('change', callback);
};
const mobileSnapshot = () => window.matchMedia('(max-width: 960px)').matches;
const desktopSnapshot = () => false;

export function CrmShell({
  staff,
  view,
  items,
  onNavigate,
  onLogout,
  loggingOut,
  children,
}: {
  staff: Staff;
  view: WorkspaceId | null;
  items: WorkspaceItem[];
  onNavigate: (view: WorkspaceId) => void;
  onLogout: () => Promise<void>;
  loggingOut: boolean;
  children: ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [query, setQuery] = useState('');
  const isMobile = useSyncExternalStore(subscribeMobile, mobileSnapshot, desktopSnapshot);
  const dialog = useRef<HTMLDialogElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const sidebar = useRef<HTMLElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const current = items.find((item) => item.id === view);
  const currentTitle = current?.label ?? '';
  const groups = [...new Set(items.map((item) => item.group))];
  const results = searchWorkspaces(query, items);

  function openSearch() {
    setQuery('');
    if (!dialog.current?.open) dialog.current?.showModal();
    search.current?.focus();
  }
  function navigate(id: WorkspaceId) {
    setMobileOpen(false);
    dialog.current?.close();
    onNavigate(id);
    content.current?.focus({ preventScroll: true });
  }
  useEffect(() => {
    function shortcut(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setQuery('');
        if (!dialog.current?.open) dialog.current?.showModal();
        search.current?.focus();
      }
    }
    document.addEventListener('keydown', shortcut);
    return () => document.removeEventListener('keydown', shortcut);
  }, []);
  useEffect(() => {
    content.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [currentTitle]);
  useEffect(() => {
    if (!mobileOpen || !isMobile) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    sidebar.current?.querySelector<HTMLButtonElement>('.crm-drawer-close')?.focus();
    function keydown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        setMobileOpen(false);
        menuButton.current?.focus();
      }
      if (event.key !== 'Tab') return;
      const elements = sidebar.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled])',
      );
      const first = elements?.[0];
      const last = elements?.[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
    document.addEventListener('keydown', keydown);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener('keydown', keydown);
    };
  }, [mobileOpen, isMobile]);

  return (
    <div className="dashboard-shell commercial-shell">
      <title>{currentTitle ? `${currentTitle} · Sơn CRM` : 'Sơn CRM'}</title>
      <a
        className="crm-skip"
        href="#crm-content"
        onClick={(event) => {
          event.preventDefault();
          content.current?.focus();
        }}
      >
        Đến nội dung chính
      </a>
      {isMobile && mobileOpen && (
        <button
          className="crm-nav-backdrop"
          type="button"
          tabIndex={-1}
          aria-label="Đóng điều hướng"
          onClick={() => {
            setMobileOpen(false);
            menuButton.current?.focus();
          }}
        />
      )}
      <aside
        ref={sidebar}
        id="crm-navigation"
        className="crm-sidebar"
        data-mobile-open={mobileOpen}
        inert={isMobile && !mobileOpen}
        role={isMobile && mobileOpen ? 'dialog' : undefined}
        aria-modal={isMobile && mobileOpen ? true : undefined}
        aria-label="Điều hướng Sơn CRM"
      >
        <div className="crm-brand">
          <span className="crm-brand-mark">S</span>
          <div>
            <strong>Sơn CRM</strong>
            <small>Không gian kinh doanh</small>
          </div>
          <button
            type="button"
            className="crm-icon-button crm-drawer-close"
            aria-label="Đóng menu"
            onClick={() => {
              setMobileOpen(false);
              menuButton.current?.focus();
            }}
          >
            <CrmIcon name="close" />
          </button>
        </div>
        <nav className="crm-navigation" aria-label="Chức năng CRM">
          {groups.map((group) => (
            <div className="crm-nav-group" key={group}>
              <p>{group}</p>
              {items
                .filter((item) => item.group === group)
                .map((item) => (
                  <a
                    key={item.id}
                    href={`#${item.id}`}
                    className={item.id === view ? 'crm-nav-link active' : 'crm-nav-link'}
                    aria-current={item.id === view ? 'page' : undefined}
                    onClick={(event) => {
                      event.preventDefault();
                      navigate(item.id);
                    }}
                  >
                    <CrmIcon name={item.id} />
                    <span>{item.label}</span>
                  </a>
                ))}
            </div>
          ))}
        </nav>
        <div className="crm-sidebar-footer">
          <span className="crm-avatar">{staff.displayName.trim().slice(0, 1).toUpperCase()}</span>
          <div>
            <b>{staff.displayName}</b>
            <small>{staff.roles.includes('owner') ? 'Chủ cửa hàng' : 'Nhân viên'}</small>
          </div>
        </div>
      </aside>
      <div className="crm-main">
        <header className="crm-topbar">
          <div className="crm-breadcrumb">
            <button
              ref={menuButton}
              type="button"
              className="crm-icon-button crm-menu-toggle"
              aria-label="Mở điều hướng"
              aria-controls="crm-navigation"
              aria-expanded={mobileOpen}
              onClick={() => setMobileOpen(true)}
            >
              <CrmIcon name="menu" />
            </button>
            <span className="crm-breadcrumb-parent">{current?.group ?? 'Không gian làm việc'}</span>
            <CrmIcon name="chevron" />
            <strong>{current?.label ?? 'Quyền truy cập'}</strong>
          </div>
          <div className="crm-topbar-actions">
            <button
              type="button"
              className="crm-search-trigger"
              onClick={openSearch}
              aria-label="Tìm màn hình (Ctrl K)"
            >
              <CrmIcon name="search" />
              <span>Tìm màn hình…</span>
              <kbd>Ctrl K</kbd>
            </button>
            <details className="crm-user-menu">
              <summary aria-label={`Tài khoản ${staff.displayName}`}>
                <span className="crm-avatar">
                  {staff.displayName.trim().slice(0, 1).toUpperCase()}
                </span>
                <span className="crm-user-name">{staff.displayName}</span>
              </summary>
              <div className="crm-account-popover">
                <b>{staff.displayName}</b>
                <small>{staff.email}</small>
                <button type="button" disabled={loggingOut} onClick={() => void onLogout()}>
                  <CrmIcon name="logout" />
                  {loggingOut ? 'Đang đăng xuất…' : 'Đăng xuất'}
                </button>
              </div>
            </details>
          </div>
        </header>
        <div id="crm-content" ref={content} className="crm-workspace" tabIndex={-1}>
          <WorkspaceBoundary key={view}>{children}</WorkspaceBoundary>
        </div>
        <footer className="crm-footer">
          <span>Sơn CRM</span>
          <span>Quản lý bán sỉ & bán lẻ</span>
        </footer>
      </div>
      <dialog
        ref={dialog}
        className="crm-command-dialog"
        aria-labelledby="crm-command-title"
        onClick={(event) => {
          if (event.target === event.currentTarget) dialog.current?.close();
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && event.target === search.current && results[0]) {
            event.preventDefault();
            navigate(results[0].id);
            return;
          }
          if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return;
          const buttons = Array.from(
            dialog.current?.querySelectorAll<HTMLButtonElement>('[data-command-result]') ?? [],
          );
          if (!buttons.length) return;
          event.preventDefault();
          const index = buttons.findIndex((button) => button === document.activeElement);
          const next =
            event.key === 'ArrowDown'
              ? (index + 1) % buttons.length
              : index <= 0
                ? buttons.length - 1
                : index - 1;
          buttons[next]?.focus();
        }}
      >
        <div className="crm-command-content">
          <div className="crm-command-heading">
            <h2 id="crm-command-title">Bạn muốn đến đâu?</h2>
            <button
              type="button"
              className="crm-icon-button"
              aria-label="Đóng tìm kiếm"
              onClick={() => dialog.current?.close()}
            >
              <CrmIcon name="close" />
            </button>
          </div>
          <label className="crm-command-search">
            <CrmIcon name="search" />
            <input
              ref={search}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Tìm khách hàng, đơn hàng, kho…"
              aria-label="Tên màn hình cần tìm"
            />
          </label>
          <div className="crm-command-results">
            {results.length ? (
              results.map((item) => (
                <button
                  data-command-result
                  key={item.id}
                  type="button"
                  onClick={() => navigate(item.id)}
                >
                  <span className="crm-command-icon">
                    <CrmIcon name={item.id} />
                  </span>
                  <span>
                    <b>{item.label}</b>
                    <small>{item.description}</small>
                  </span>
                  <CrmIcon name="chevron" />
                </button>
              ))
            ) : (
              <div className="crm-command-empty">
                <CrmIcon name="search" />
                <b>Không tìm thấy màn hình phù hợp</b>
                <p>Thử từ khóa ngắn hơn. Chỉ những chức năng bạn có quyền sử dụng mới xuất hiện.</p>
              </div>
            )}
          </div>
          <div className="crm-command-footer">
            <span>
              <kbd>↑</kbd> <kbd>↓</kbd> chọn · <kbd>Enter</kbd> mở
            </span>
            <span>
              <kbd>Esc</kbd> đóng
            </span>
          </div>
        </div>
      </dialog>
    </div>
  );
}
