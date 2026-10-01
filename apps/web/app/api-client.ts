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

export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    credentials: 'include',
    headers: { 'content-type': 'application/json', ...options?.headers },
  });
  const payload = (await response.json()) as ApiSuccess<T> | ApiFailure;
  if (!response.ok || !('data' in payload)) {
    const failure = payload as ApiFailure;
    throw new Error(failure.error?.message ?? 'Không thể kết nối API.');
  }
  return payload.data;
}
