import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from './api-client';

afterEach(() => vi.unstubAllGlobals());

describe('Expired session user experience', () => {
  it('returns the error and signals sign-in when a protected request loses its session', async () => {
    const dispatchEvent = vi.fn();
    vi.stubGlobal('window', { dispatchEvent });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: { code: 'AUTHENTICATION_REQUIRED', message: 'Vui lòng đăng nhập.' },
          }),
          { status: 401 },
        ),
      ),
    );
    await expect(api('/staff')).rejects.toThrow('Vui lòng đăng nhập.');
    expect(dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'crm:session-expired' }),
    );
  });
  it('keeps normal first-visit and incorrect-password errors out of the expiry flow', async () => {
    const dispatchEvent = vi.fn();
    vi.stubGlobal('window', { dispatchEvent });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              error: { code: 'INVALID_CREDENTIALS', message: 'Không đăng nhập được.' },
            }),
            { status: 401 },
          ),
        ),
      ),
    );
    await expect(api('/me')).rejects.toThrow();
    await expect(api('/auth/sessions', { method: 'POST' })).rejects.toThrow();
    expect(dispatchEvent).not.toHaveBeenCalled();
  });
});
