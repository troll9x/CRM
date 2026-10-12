import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { verifyFacebookSignature } from './facebook-webhook-signature';

describe('Facebook webhook signature verification', () => {
  const raw = Buffer.from('{"object":"page","entry":[]}');
  const secret = 'test-secret-only';
  const valid = `sha256=${createHmac('sha256', secret).update(raw).digest('hex')}`;

  it('accepts only the exact raw-body HMAC signature', () => {
    expect(verifyFacebookSignature(raw, valid, secret)).toBe(true);
    expect(verifyFacebookSignature(Buffer.from(`${raw.toString()} `), valid, secret)).toBe(false);
    expect(verifyFacebookSignature(raw, valid, 'another-secret')).toBe(false);
  });

  it('rejects malformed signatures before comparing', () => {
    expect(verifyFacebookSignature(raw, 'sha1=abc', secret)).toBe(false);
    expect(verifyFacebookSignature(raw, 'sha256=abc', secret)).toBe(false);
  });
});
