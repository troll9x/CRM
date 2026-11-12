'use client';
import { Component, type ReactNode } from 'react';
import { CrmIcon } from './crm-icon';

export class WorkspaceBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <section className="crm-no-access" role="alert">
        <span className="crm-no-access-icon">
          <CrmIcon name="returns" />
        </span>
        <h1>Chưa mở được màn hình này</h1>
        <p>Bạn có thể thử lại hoặc chuyển sang chức năng khác từ menu.</p>
        <button type="button" className="primary" onClick={() => this.setState({ failed: false })}>
          Thử tải lại màn hình
        </button>
      </section>
    );
  }
}
