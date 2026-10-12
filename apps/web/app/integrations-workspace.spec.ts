import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { facebookConnectionHint, IntegrationsWorkspace } from './integrations-workspace';

describe('Facebook connection entry point', () => {
  it('keeps provider setup separate from the Page owner flow', () => {
    const markup = renderToStaticMarkup(
      createElement(IntegrationsWorkspace, {
        staff: {
          id: 'staff-test',
          displayName: 'Quản lý thử',
          email: 'manager@example.test',
          businessId: 'business-test',
          roles: [],
          permissions: ['connectors.manage'],
        },
        onLogout: () => undefined,
        loggingOut: false,
      }),
    );

    expect(markup).toContain('Kết nối Facebook');
    expect(markup).toContain('Bạn không cần tạo ứng dụng Meta');
    expect(markup).toContain('Kết nối Facebook chưa sẵn sàng');
    expect(markup).toContain('<details');
    expect(markup).toContain('Thông tin kỹ thuật dành cho người triển khai');
    expect(markup).toContain('Khai báo tài khoản để chuẩn bị tích hợp (không cấp quyền)');
    expect(markup).not.toContain('name="appId"');
    expect(markup).not.toContain('name="appSecret"');
    expect(markup).not.toContain('chưa có tài khoản API nào được xác minh');
  });
});

describe('Facebook connection readiness copy', () => {
  it('distinguishes an authorized Page from a verified app webhook', () => {
    expect(
      facebookConnectionHint({
        id: 'connection-1',
        provider: 'FACEBOOK',
        externalAccountIdMasked: '123…789',
        displayName: 'Page test',
        status: 'CONNECTED',
        capabilities: {
          authorization: 'VERIFIED',
          pageSubscription: 'VERIFIED',
          webhookSubscription: 'APP_CONFIGURATION_PENDING',
        },
        lastSyncAt: null,
        lastErrorCode: null,
      }),
    ).toContain('webhook của ứng dụng Meta chưa xác minh/lưu');
  });

  it('does not show a Facebook webhook warning after an event sync is recorded', () => {
    expect(
      facebookConnectionHint({
        id: 'connection-1',
        provider: 'FACEBOOK',
        externalAccountIdMasked: '123…789',
        displayName: 'Page test',
        status: 'CONNECTED',
        capabilities: { webhookSubscription: 'VERIFIED' },
        lastSyncAt: '2026-10-11T00:00:00.000Z',
        lastErrorCode: null,
      }),
    ).toBeNull();
  });
});
