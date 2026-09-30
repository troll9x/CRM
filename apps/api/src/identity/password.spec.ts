import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from './password';

describe('password hashing', () => {
  it('xác minh đúng mật khẩu và từ chối mật khẩu sai', async () => {
    const hash = await hashPassword('Mat-khau-thu-123!');
    expect(hash).not.toContain('Mat-khau-thu-123!');
    await expect(verifyPassword('Mat-khau-thu-123!', hash)).resolves.toBe(true);
    await expect(verifyPassword('sai-mat-khau', hash)).resolves.toBe(false);
  });
});
