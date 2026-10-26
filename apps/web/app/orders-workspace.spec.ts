import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { OrdersWorkspace } from './orders-workspace';

describe('OrdersWorkspace', () => {
  it('renders the empty order list before any order is selected', () => {
    const markup = renderToStaticMarkup(
      createElement(OrdersWorkspace, {
        staff: {
          id: 'staff-test',
          displayName: 'Quản lý thử',
          email: 'manager@example.test',
          businessId: 'business-test',
          roles: [],
          permissions: ['orders.read', 'orders.create'],
        },
        onLogout: () => undefined,
        loggingOut: false,
      }),
    );

    expect(markup).toContain('Đơn hàng');
    expect(markup).toContain('Đang tải…');
    expect(markup).toContain('Tạo đơn nháp thủ công');
  });
});
