import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { verifyZaloSignature } from './zalo-webhook-signature';

describe('Zalo webhook signature verification', () => {
  const appSecret = 'fixture-only-zalo-secret';
  const rawBody = Buffer.from(
    JSON.stringify({
      app_id: 'fixture-app',
      timestamp: '154390853474',
      event_name: 'user_send_text',
    }),
  );
  const digest = createHash('sha256')
    .update('fixture-app' + rawBody.toString('utf8') + '154390853474' + appSecret)
    .digest('hex');

  it('accepts the provider signature only for the exact raw body', () => {
    expect(verifyZaloSignature(rawBody, `mac=${digest}`, appSecret)).toBe(true);
    expect(
      verifyZaloSignature(Buffer.from(`${rawBody.toString()} `), `mac=${digest}`, appSecret),
    ).toBe(false);
    expect(verifyZaloSignature(rawBody, `mac=${digest}`, 'different-secret')).toBe(false);
  });

  it('rejects malformed or unsupported signature headers', () => {
    expect(verifyZaloSignature(rawBody, 'sha256=not-a-zalo-mac', appSecret)).toBe(false);
    expect(verifyZaloSignature(Buffer.from('{'), `mac=${digest}`, appSecret)).toBe(false);
  });
});
