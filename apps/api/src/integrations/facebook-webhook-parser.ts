import type { Prisma } from '../generated/prisma/client';

export type FacebookNormalizedEvent =
  | {
      kind: 'MESSAGE';
      key: string;
      objectId: string;
      providerAt: Date;
      payload: {
        type: 'message';
        conversationId: string;
        externalUserId: string;
        messageId: string;
        body?: string;
        contentType: string;
        mediaMetadata?: Prisma.InputJsonValue;
        timestamp: string;
      };
    }
  | {
      kind: 'COMMENT';
      key: string;
      objectId: string;
      providerAt: Date;
      payload: {
        type: 'comment';
        commentId: string;
        postId: string;
        parentId?: string;
        authorId?: string;
        authorName?: string;
        body?: string;
        sourceUrl?: string;
        status: string;
        timestamp: string;
      };
    };

export function parseFacebookWebhook(
  input: unknown,
): Array<{ pageId: string; events: FacebookNormalizedEvent[] }> {
  const body = record(input);
  if (body?.object !== 'page' || !Array.isArray(body.entry))
    throw new Error('UNSUPPORTED_FACEBOOK_WEBHOOK_OBJECT');
  return body.entry.flatMap((entryValue) => {
    const entry = record(entryValue);
    const pageId = stringValue(entry?.id);
    if (!entry || !pageId) return [];
    const events: FacebookNormalizedEvent[] = [];
    for (const messageValue of array(entry.messaging)) {
      const event = record(messageValue);
      const message = record(event?.message);
      const sender = record(event?.sender);
      const recipient = record(event?.recipient);
      const senderId = stringValue(sender?.id);
      const recipientId = stringValue(recipient?.id);
      const messageId = stringValue(message?.mid);
      if (
        !message ||
        !senderId ||
        !recipientId ||
        !messageId ||
        recipientId !== pageId ||
        senderId === pageId ||
        message.is_echo === true
      )
        continue;
      const timestamp = toDate(event?.timestamp);
      const attachments = array(message.attachments).slice(0, 10);
      events.push({
        kind: 'MESSAGE',
        key: `fb-message:${messageId}`,
        objectId: messageId,
        providerAt: timestamp,
        payload: {
          type: 'message',
          conversationId: senderId,
          externalUserId: senderId,
          messageId,
          ...(typeof message.text === 'string' ? { body: message.text.slice(0, 20_000) } : {}),
          contentType: attachments.length ? 'attachment' : 'text',
          ...(attachments.length ? { mediaMetadata: jsonValue(attachments) } : {}),
          timestamp: timestamp.toISOString(),
        },
      });
    }
    for (const changeValue of array(entry.changes)) {
      const change = record(changeValue);
      const value = record(change?.value);
      const verb = stringValue(value?.verb);
      if (
        change?.field !== 'feed' ||
        value?.item !== 'comment' ||
        !verb ||
        !['add', 'edited', 'remove'].includes(verb)
      )
        continue;
      const commentId = stringValue(value.comment_id) ?? stringValue(value.id);
      const postId = stringValue(value.post_id);
      if (!commentId || !postId) continue;
      if (value.created_time === undefined || value.created_time === null) continue;
      const timestamp = toDate(value.created_time);
      const author = record(value.from);
      events.push({
        kind: 'COMMENT',
        key: `fb-comment:${commentId}:${verb}`,
        objectId: commentId,
        providerAt: timestamp,
        payload: {
          type: 'comment',
          commentId,
          postId,
          ...(stringValue(value.parent_id) ? { parentId: stringValue(value.parent_id) } : {}),
          ...(stringValue(author?.id) ? { authorId: stringValue(author?.id) } : {}),
          ...(stringValue(author?.name)
            ? { authorName: stringValue(author?.name)?.slice(0, 190) }
            : {}),
          ...(typeof value.message === 'string' ? { body: value.message.slice(0, 20_000) } : {}),
          ...(stringValue(value.permalink_url)
            ? { sourceUrl: stringValue(value.permalink_url)?.slice(0, 1000) }
            : {}),
          status: verb === 'remove' ? 'DELETED' : 'ACTIVE',
          timestamp: timestamp.toISOString(),
        },
      });
    }
    return [{ pageId, events }];
  });
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown): string | undefined {
  if (typeof value === 'string' && value.length > 0) return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return undefined;
}

function toDate(value: unknown): Date {
  const numeric =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && /^\d+$/.test(value)
        ? Number(value)
        : Number.NaN;
  const date = Number.isFinite(numeric)
    ? new Date(numeric < 100_000_000_000 ? numeric * 1000 : numeric)
    : new Date(String(value));
  if (!Number.isFinite(date.getTime())) throw new Error('INVALID_FACEBOOK_EVENT_TIMESTAMP');
  return date;
}
function jsonValue(value: unknown): Prisma.InputJsonValue {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')
    return value;
  if (Array.isArray(value))
    return value.filter((item) => item !== undefined && item !== null).map(jsonValue);
  const object = record(value);
  if (object)
    return Object.fromEntries(
      Object.entries(object)
        .filter(([, item]) => item !== undefined && item !== null)
        .map(([key, item]) => [key, jsonValue(item)]),
    );
  return String(value);
}
