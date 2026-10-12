import { describe, expect, it } from 'vitest';
import { parseZaloWebhook } from './zalo-webhook-parser';

describe('Zalo message webhook normalization', () => {
  it('normalizes a customer message and keeps the original message id for deduplication', () => {
    const event = parseZaloWebhook({
      app_id: 'test-app',
      recipient: { id: 'test-oa' },
      sender: { id: 'test-user', display_name: 'Fixture user' },
      event_name: 'user_send_text',
      message: { msg_id: 'message-1', text: 'Fixture only' },
      timestamp: '154390853474',
    });
    expect(event).toMatchObject({
      oaId: 'test-oa',
      idempotencyKey: 'zalo-message:message-1',
      payload: {
        conversationId: 'test-user',
        externalUserId: 'test-user',
        messageId: 'message-1',
        body: 'Fixture only',
        contentType: 'text',
        displayName: 'Fixture user',
      },
    });
    expect(event?.providerAt.toISOString()).toBe('1974-11-22T22:20:53.474Z');
  });

  it('ignores non-inbound events and rejects malformed inbound messages', () => {
    expect(
      parseZaloWebhook({ app_id: 'test-app', event_name: 'oa_send_text', timestamp: '1' }),
    ).toBeNull();
    expect(() =>
      parseZaloWebhook({
        app_id: 'test-app',
        event_name: 'user_send_text',
        timestamp: '1',
        message: { msg_id: 'message-1' },
      }),
    ).toThrow('INVALID_ZALO_MESSAGE_EVENT');
  });
});
