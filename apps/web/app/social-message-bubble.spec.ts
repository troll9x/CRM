import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SocialMessageBubble } from './social-message-bubble';

describe('Conversation sender identity', () => {
  const render = (direction: string) =>
    renderToStaticMarkup(
      createElement(SocialMessageBubble, {
        direction,
        account: 'Cửa hàng thử',
        providerAt: '2026-11-12T10:00:00Z',
        body: 'Nội dung thử',
      }),
    );
  it('shows the persisted OUTBOUND_ECHO as a Page reply, not a customer message', () => {
    const html = render('OUTBOUND_ECHO');
    expect(html).toContain('social-bubble outbound');
    expect(html).toContain('Cửa hàng thử');
    expect(html).not.toContain('Khách');
  });
  it('keeps customer messages on the inbound side', () => {
    expect(render('INBOUND')).toContain('social-bubble inbound');
    expect(render('INBOUND')).toContain('Khách');
  });
  it('does not label system records as a customer message', () => {
    expect(render('SYSTEM')).toContain('Hệ thống');
    expect(render('SYSTEM')).not.toContain('Khách');
  });
});
