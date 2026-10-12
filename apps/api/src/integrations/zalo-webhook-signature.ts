import { createHash, timingSafeEqual } from 'node:crypto';

export function verifyZaloSignature(rawBody: Buffer, header: string, appSecret: string): boolean {
  if (!appSecret || rawBody.length === 0) return false;
  let body: unknown;
  try {
    body = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return false;
  }
  if (!isRecord(body)) return false;
  const appId = stringValue(body.app_id);
  const timestamp = stringValue(body.timestamp);
  if (!appId || !timestamp) return false;

  const received = header
    .trim()
    .replace(/^mac\s*=\s*/i, '')
    .toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(received)) return false;
  const expected = createHash('sha256')
    .update(appId + rawBody.toString('utf8') + timestamp + appSecret, 'utf8')
    .digest();
  const supplied = Buffer.from(received, 'hex');
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  if (typeof value === 'string' && value.length > 0) return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return undefined;
}
