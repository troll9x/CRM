import type { Prisma } from '../generated/prisma/client';

export type ZaloMessageEvent = {
  oaId: string;
  idempotencyKey: string;
  messageId: string;
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
    displayName?: string;
  };
};

const userMessageEvents = new Set([
  'user_send_text',
  'user_send_image',
  'user_send_link',
  'user_send_audio',
  'user_send_video',
  'user_send_sticker',
  'user_send_location',
  'user_send_business_card',
  'user_send_file',
]);

export function parseZaloWebhook(input: unknown): ZaloMessageEvent | null {
  const body = record(input);
  if (!body || typeof body.event_name !== 'string') throw new Error('INVALID_ZALO_WEBHOOK_PAYLOAD');
  if (!userMessageEvents.has(body.event_name)) return null;

  const message = record(body.message);
  const sender = record(body.sender);
  const recipient = record(body.recipient);
  const oaId = stringValue(recipient?.id);
  const externalUserId = stringValue(sender?.id);
  const messageId = stringValue(message?.msg_id);
  const timestamp = toDate(body.timestamp);
  if (!oaId || !externalUserId || !messageId || !message)
    throw new Error('INVALID_ZALO_MESSAGE_EVENT');
  const attachments = Array.isArray(message.attachments) ? message.attachments.slice(0, 10) : [];
  const contentType = body.event_name.slice('user_send_'.length);
  return {
    oaId,
    idempotencyKey: `zalo-message:${messageId}`,
    messageId,
    providerAt: timestamp,
    payload: {
      type: 'message',
      conversationId: externalUserId,
      externalUserId,
      messageId,
      ...(typeof message.text === 'string' ? { body: message.text.slice(0, 20_000) } : {}),
      contentType,
      ...(attachments.length ? { mediaMetadata: toJson(attachments) } : {}),
      timestamp: timestamp.toISOString(),
      ...(typeof sender?.display_name === 'string'
        ? { displayName: sender.display_name.slice(0, 190) }
        : {}),
    },
  };
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringValue(value: unknown): string | undefined {
  if (typeof value === 'string' && value.length > 0) return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return undefined;
}

function toDate(value: unknown): Date {
  const numeric = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : Number.NaN;
  const date = Number.isFinite(numeric) ? new Date(numeric) : new Date(String(value));
  if (!Number.isFinite(date.getTime())) throw new Error('INVALID_ZALO_EVENT_TIMESTAMP');
  return date;
}

function toJson(value: unknown): Prisma.InputJsonValue {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')
    return value;
  if (Array.isArray(value))
    return value.filter((item) => item !== undefined && item !== null).map(toJson);
  const object = record(value);
  if (object)
    return Object.fromEntries(
      Object.entries(object)
        .filter(([, item]) => item !== undefined && item !== null)
        .map(([key, item]) => [key, toJson(item)]),
    );
  return String(value);
}
