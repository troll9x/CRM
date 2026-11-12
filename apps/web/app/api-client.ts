export type Staff = {
  id: string;
  displayName: string;
  email: string;
  businessId: string;
  roles: string[];
  permissions: string[];
};

type ApiSuccess<T> = { data: T; meta: { requestId: string } };
type ApiFailure = { error: { code: string; message: string }; meta?: { requestId: string } };

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

function notifyExpiredSession(status: number, path: string) {
  if (
    status === 401 &&
    path !== '/me' &&
    !path.startsWith('/auth/') &&
    typeof window !== 'undefined'
  )
    window.dispatchEvent(new Event('crm:session-expired'));
}

export async function apiBlob(path: string): Promise<Blob> {
  const response = await fetch(`${API_URL}${path}`, { credentials: 'include' });
  notifyExpiredSession(response.status, path);
  if (!response.ok) throw new Error('Không tải được ảnh đính kèm từ Facebook.');
  return response.blob();
}

export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const headers = new Headers(options?.headers);
  const isBinaryBody =
    (typeof Blob !== 'undefined' && options?.body instanceof Blob) ||
    (typeof FormData !== 'undefined' && options?.body instanceof FormData) ||
    options?.body instanceof ArrayBuffer;
  if (!isBinaryBody && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    credentials: 'include',
    headers,
  });
  notifyExpiredSession(response.status, path);
  const payload = (await response.json()) as ApiSuccess<T> | ApiFailure;
  if (!response.ok || !('data' in payload)) {
    const failure = payload as ApiFailure;
    throw new Error(failure.error?.message ?? 'Không thể kết nối API.');
  }
  return payload.data;
}
