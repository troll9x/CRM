import { describe, expect, it } from 'vitest';
import { parseFacebookWebhook } from './facebook-webhook-parser';

describe('Facebook page webhook normalization', () => {
  it('normalizes inbound messages and feed comments to idempotent event keys', () => {
    const events = parseFacebookWebhook({
      object: 'page',
      entry: [
        {
          id: 'page-01',
          messaging: [
            {
              sender: { id: 'user-01' },
              recipient: { id: 'page-01' },
              timestamp: 1_760_000_000_000,
              message: { mid: 'm.1', text: 'Xin chào' },
            },
          ],
          changes: [
            {
              field: 'feed',
              value: {
                item: 'comment',
                verb: 'add',
                comment_id: 'c.1',
                post_id: 'p.1',
                message: 'Quan tâm',
                created_time: 1_760_000_000,
              },
            },
          ],
        },
      ],
    });
    expect(events).toHaveLength(1);
    expect(events[0]?.events.map((event) => event.key)).toEqual([
      'fb-message:m.1',
      'fb-comment:c.1:add',
    ]);
    expect(events[0]?.events[0]?.payload.type).toBe('message');
    expect(events[0]?.events[1]?.payload.type).toBe('comment');
  });

  it('normalizes outbound echo for reconciliation without treating it as inbound', () => {
    const events = parseFacebookWebhook({
      object: 'page',
      entry: [
        {
          id: 'page-01',
          messaging: [
            {
              sender: { id: 'page-01' },
              recipient: { id: 'user-01' },
              timestamp: 1,
              message: { mid: 'echo.1', is_echo: true },
            },
          ],
        },
      ],
    });
    expect(events[0]?.events).toHaveLength(1);
    expect(events[0]?.events[0]?.payload).toMatchObject({
      type: 'message', direction: 'OUTBOUND_ECHO',
      externalUserId: 'user-01', conversationId: 'user-01', messageId: 'echo.1',
    });
    expect(() => parseFacebookWebhook({ object: 'user', entry: [] })).toThrow(
      'UNSUPPORTED_FACEBOOK_WEBHOOK_OBJECT',
    );
  });

  it('uses Page entry time for comment edits/removals without created_time and keeps later edits distinct', () => {
    const entry = (time: number, verb: string) => ({
      id: 'page-01',
      time,
      changes: [
        {
          field: 'feed',
          value: {
            item: 'comment',
            verb,
            comment_id: 'c.1',
            post_id: 'p.1',
            created_time: verb === 'edited' ? 1_750_000_000 : undefined,
          },
        },
      ],
    });
    const events = parseFacebookWebhook({
      object: 'page',
      entry: [
        entry(1_760_000_000, 'edited'),
        entry(1_760_000_100, 'edited'),
        entry(1_760_000_200, 'remove'),
      ],
    });
    expect(events.map((item) => item.events[0]?.key)).toEqual([
      'fb-comment:c.1:edited:1760000000000',
      'fb-comment:c.1:edited:1760000100000',
      'fb-comment:c.1:remove:1760000200000',
    ]);
    expect(events[2]?.events[0]?.payload).toMatchObject({ status: 'DELETED' });
  });
});
