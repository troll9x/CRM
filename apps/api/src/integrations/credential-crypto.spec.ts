import { describe, expect, it } from 'vitest';
import { CredentialCrypto } from './credential-crypto';

describe('CredentialCrypto', () => {
  const key = Buffer.alloc(32, 7).toString('base64');

  it('encrypts token material with context binding and unique nonce', () => {
    const crypto = new CredentialCrypto(key);
    const first = crypto.encrypt({ accessToken: 'fixture-secret' }, 'facebook:business-a');
    const second = crypto.encrypt({ accessToken: 'fixture-secret' }, 'facebook:business-a');
    expect(first).not.toBe(second);
    expect(first).not.toContain('fixture-secret');
    expect(crypto.decrypt(first, 'facebook:business-a')).toEqual({ accessToken: 'fixture-secret' });
    expect(() => crypto.decrypt(first, 'facebook:business-b')).toThrow();
  });

  it('rejects absent and malformed persistent keys', () => {
    expect(() => new CredentialCrypto(undefined)).toThrow();
    expect(() => new CredentialCrypto('not-a-32-byte-key')).toThrow();
  });
});
