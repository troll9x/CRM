import { createHmac, timingSafeEqual } from 'node:crypto';

export function verifyFacebookSignature(
  raw: Buffer,
  signature: string,
  appSecret: string,
): boolean {
  if (!/^sha256=[a-f0-9]{64}$/i.test(signature)) return false;
  const expected = `sha256=${createHmac('sha256', appSecret).update(raw).digest('hex')}`;
  return safeEquals(signature, expected);
}

export function safeEquals(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}
