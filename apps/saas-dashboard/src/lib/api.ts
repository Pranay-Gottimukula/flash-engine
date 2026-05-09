import Cookies from 'js-cookie';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

export const AUTH_TOKEN_COOKIE = 'flash_token';

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = Cookies.get(AUTH_TOKEN_COOKIE);

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const adminSecret = process.env.NEXT_PUBLIC_ADMIN_SECRET;
  if (adminSecret && path.startsWith('/api/admin')) {
    headers['x-admin-secret'] = adminSecret;
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401) {
    Cookies.remove(AUTH_TOKEN_COOKIE);
    if (typeof window !== 'undefined') window.location.href = '/login';
    throw new Error('Session expired');
  }

  // Treat empty body (204, DELETE, etc.) as success with no data
  if (res.status === 204 || res.headers.get('content-length') === '0') {
    return undefined as T;
  }

  const json = await res.json().catch(() => ({}));

  if (res.status === 403) {
    const msg = (json as { error?: string; message?: string }).error
      ?? (json as { message?: string }).message
      ?? '';
    if (msg.toLowerCase().includes('suspended') && typeof window !== 'undefined') {
      window.location.href = '/suspended';
    }
    throw new Error(msg || 'Forbidden');
  }

  if (!res.ok) {
    throw new Error((json as { error?: string; message?: string }).error
      ?? (json as { message?: string }).message
      ?? `Request failed with status ${res.status}`);
  }

  return json as T;
}

export const api = {
  get:    <T>(path: string)                 => request<T>('GET',    path),
  post:   <T>(path: string, body?: unknown) => request<T>('POST',   path, body),
  put:    <T>(path: string, body?: unknown) => request<T>('PUT',    path, body),
  delete: <T>(path: string)                => request<T>('DELETE', path),
};
