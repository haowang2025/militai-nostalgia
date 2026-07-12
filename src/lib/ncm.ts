import { useAuthStore } from '../store/auth';

const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
const BASE = (env?.VITE_NCM_BASE || '/api').replace(/\/+$/, '');

function qs(params: Record<string, string | number | boolean | undefined | null>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value != null) query.set(key, String(value));
  }
  return query.toString();
}

export async function ncm<T = unknown>(path: string, params: Record<string, string | number | boolean | undefined | null> = {}): Promise<T> {
  const cookie = useAuthStore.getState().cookie;
  const query = qs({
    ...params,
    timestamp: Date.now(),
    noCookie: 1,
    ...(cookie ? { cookie } : {}),
  });
  const response = await fetch(`${BASE}${path}?${query}`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    credentials: 'same-origin',
  });
  const payload = await response.json().catch(() => null) as T;
  if (!response.ok) throw new Error(`网易云 API 请求失败（HTTP ${response.status}）`);
  return payload;
}

export const audioProxyUrl = (streamUrl: string) => `${BASE}/audio-proxy?${qs({ url: streamUrl })}`;
