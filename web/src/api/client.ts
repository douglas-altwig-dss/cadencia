import { currentLocale } from '../i18n/runtime';
import type { ApiErrorDetail } from './types';

/** An API failure with the backend's human cause and suggested action (RF-35). */
export class ApiError extends Error {
  readonly status: number;
  readonly detail: ApiErrorDetail & Record<string, unknown>;

  constructor(status: number, detail: ApiErrorDetail & Record<string, unknown>) {
    super(detail.message ?? detail.cause ?? `HTTP ${status}`);
    this.status = status;
    this.detail = detail;
  }

  get reason(): string {
    return this.detail.cause ?? 'falha na requisição';
  }

  get action(): string | undefined {
    return this.detail.action;
  }
}

type Params = Record<string, string | number | boolean | null | undefined | (string | number)[]>;

export function qs(params: Params = {}): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      if (value.length) search.set(key, value.join(','));
    } else {
      search.set(key, String(value));
    }
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}

async function request<T>(method: string, path: string, body?: unknown, isForm = false): Promise<T> {
  // The chosen language travels on every call: the API answers its own text in it (docs/i18n.md).
  const init: RequestInit = { method, headers: { Accept: 'application/json', 'Accept-Language': currentLocale() } };
  if (body !== undefined) {
    if (isForm) {
      init.body = body as FormData;
    } else {
      init.body = JSON.stringify(body);
      (init.headers as Record<string, string>)['Content-Type'] = 'application/json';
    }
  }
  let response: Response;
  try {
    response = await fetch(`/api${path}`, init);
  } catch {
    throw new ApiError(0, {
      cause: 'API inacessível',
      action: 'Confira se o serviço da API está no ar (cadencia serve ou make up).',
    });
  }
  if (!response.ok) {
    let detail: ApiErrorDetail & Record<string, unknown> = { message: response.statusText };
    try {
      const payload = await response.json();
      const raw = payload?.detail;
      if (raw && typeof raw === 'object' && !Array.isArray(raw)) detail = raw;
      else if (Array.isArray(raw)) detail = { cause: 'requisição inválida', message: raw.map((e) => e.msg).join('; ') };
      else if (raw) detail = { message: String(raw) };
    } catch {
      /* body is not JSON */
    }
    throw new ApiError(response.status, detail);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body ?? {}),
  put: <T>(path: string, body: unknown) => request<T>('PUT', path, body),
  patch: <T>(path: string, body: unknown) => request<T>('PATCH', path, body),
  del: <T>(path: string) => request<T>('DELETE', path),
  upload: <T>(path: string, form: FormData) => request<T>('POST', path, form, true),
};

export const exportUrl = (dataset: string, params: Params & { format?: 'csv' | 'json' }) =>
  `/api/export/${dataset}${qs(params)}`;
