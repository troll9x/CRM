import { describe, expect, it } from 'vitest';
import { filterSocialItems } from './integrations-workspace';

type Inputs = Parameters<typeof filterSocialItems>;
const items: Inputs[0] = [
  { type: 'chat', id: 'chat-1', at: '2026-10-14T10:00:00Z' },
  { type: 'comment', id: 'comment-1', at: '2026-10-14T09:00:00Z' },
  { type: 'ticket', id: 'ticket-1', at: '2026-10-14T08:00:00Z' },
];
const sources = {
  connections: [
    { id: 'page-a', provider: 'FACEBOOK', displayName: 'Page A' },
    { id: 'oa-b', provider: 'ZALO', displayName: 'OA B' },
  ],
  conversations: [
    {
      id: 'chat-1',
      connectionId: 'page-a',
      identity: { displayName: 'Lan' },
      messages: [{ body: 'Hỏi giá' }],
      unreadAt: '2026-10-14T10:00:00Z',
      status: 'OPEN',
      assignedStaff: { id: 'staff-a' },
    },
  ],
  comments: [
    {
      id: 'comment-1',
      connectionId: 'page-a',
      authorDisplayName: 'Minh',
      body: 'Hỏi vận chuyển',
      externalPostId: 'post-23',
    },
  ],
  tickets: [
    {
      id: 'ticket-1',
      conversationId: null,
      commentId: 'older-comment',
      comment: { connectionId: 'oa-b', connection: { provider: 'ZALO' } },
      summary: 'Giao chậm',
      status: 'IN_PROGRESS',
      priority: 'URGENT',
      labels: ['gấp'],
      assignedStaff: { id: 'staff-b' },
    },
  ],
} as unknown as Inputs[1];
const defaults: Inputs[2] = {
  view: 'all',
  query: '',
  provider: '',
  account: '',
  onlyUnread: false,
  onlyOpen: false,
  priority: '',
  assignee: '',
  ticketStatus: '',
  label: '',
};

describe('social inbox filters over records actually loaded', () => {
  it('keeps channel and account separate from interaction type', () => {
    expect(
      filterSocialItems(items, sources, { ...defaults, provider: 'FACEBOOK' }).map((row) => row.id),
    ).toEqual(['chat-1', 'comment-1']);
    expect(
      filterSocialItems(items, sources, { ...defaults, account: 'oa-b' }).map((row) => row.id),
    ).toEqual(['ticket-1']);
    expect(
      filterSocialItems(items, sources, { ...defaults, view: 'comment', query: 'post-23' }).map(
        (row) => row.id,
      ),
    ).toEqual(['comment-1']);
  });

  it('filters unread, assignment, priority, labels and ticket status from stored fields', () => {
    expect(
      filterSocialItems(items, sources, { ...defaults, onlyUnread: true }).map((row) => row.id),
    ).toEqual(['chat-1']);
    expect(
      filterSocialItems(items, sources, { ...defaults, assignee: 'staff-a' }).map((row) => row.id),
    ).toEqual(['chat-1']);
    expect(
      filterSocialItems(items, sources, {
        ...defaults,
        assignee: 'staff-b',
        priority: 'URGENT',
        label: 'gấp',
        ticketStatus: 'IN_PROGRESS',
      }).map((row) => row.id),
    ).toEqual(['ticket-1']);
    expect(filterSocialItems(items, sources, { ...defaults, priority: 'HIGH' })).toEqual([]);
  });
});
