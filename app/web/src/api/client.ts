const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:4000/api';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/** Notified when the server says the session is gone, so the app can send the
 *  user back to login instead of silently rendering empty screens. */
let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: (() => void) | null) {
  onUnauthorized = fn;
}

/** Endpoints where a 401 is an expected answer rather than an expired session
 *  — bouncing the user to login from these would be wrong. */
const AUTH_PROBE_PATHS = ['/auth/me', '/auth/login', '/auth/register'];

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      credentials: 'include',
      headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
      ...options,
    });
  } catch {
    // fetch only rejects on network-level failure, which reads very
    // differently to a user than a server error.
    throw new ApiError('Sem conexão com o servidor. Verifique sua internet e tente de novo.', 0);
  }

  if (res.status === 401 && !AUTH_PROBE_PATHS.some((p) => path.startsWith(p))) onUnauthorized?.();

  if (res.status === 204) return undefined as T;
  const isJson = res.headers.get('content-type')?.includes('application/json');
  const data = isJson ? await res.json() : await res.text();
  if (!res.ok) {
    const message = isJson && data && typeof data === 'object' && 'error' in data ? String((data as { error: unknown }).error) : 'Erro inesperado';
    throw new ApiError(message, res.status);
  }
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body: body !== undefined ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PUT', body: body !== undefined ? JSON.stringify(body) : undefined }),
  del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};
