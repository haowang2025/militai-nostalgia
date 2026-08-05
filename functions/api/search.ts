type Env = {
  NETEASE_API_BASE?: string;
};

type FunctionContext = {
  request: Request;
  env: Env;
};

type Upstream = {
  base: string;
  path: '/search' | '/cloudsearch';
  label: string;
};

type UpstreamResult = {
  payload: unknown;
  songCount: number;
  label: string;
};

const DEFAULT_UPSTREAMS: Upstream[] = [
  { base: 'https://ezmusic-api.vercel.app', path: '/search', label: 'ezmusic' },
  {
    base: 'https://netease-cloud-music-api-backup-roan-alpha.vercel.app',
    path: '/cloudsearch',
    label: 'netease-backup',
  },
];
const UPSTREAM_TIMEOUT_MS = 7_000;

const normalizeBase = (base: string) => base.trim().replace(/\/+$/, '');

const upstreamsFor = (env: Env): Upstream[] => {
  const configured = env.NETEASE_API_BASE?.trim();
  const candidates = configured
    ? [{ base: configured, path: '/cloudsearch' as const, label: 'configured' }, ...DEFAULT_UPSTREAMS]
    : DEFAULT_UPSTREAMS;
  const seen = new Set<string>();
  return candidates.filter((upstream) => {
    const key = `${normalizeBase(upstream.base)}${upstream.path}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const songCountFrom = (payload: unknown) => {
  if (!isRecord(payload)) return 0;
  const body = isRecord(payload.body) ? payload.body : isRecord(payload.data) ? payload.data : undefined;
  const result = isRecord(payload.result) ? payload.result : body && isRecord(body.result) ? body.result : undefined;
  return result && Array.isArray(result.songs) ? result.songs.length : 0;
};

const fetchUpstream = async (upstream: Upstream, keyword: string): Promise<UpstreamResult> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const url = new URL(upstream.path, normalizeBase(upstream.base));
    url.searchParams.set('keywords', keyword);
    url.searchParams.set('type', '1');
    url.searchParams.set('limit', '10');
    url.searchParams.set('offset', '0');

    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    return { payload, songCount: songCountFrom(payload), label: upstream.label };
  } finally {
    clearTimeout(timeout);
  }
};

const jsonResponse = (payload: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...headers,
    },
  });

export async function onRequestGet(context: FunctionContext) {
  const requestUrl = new URL(context.request.url);
  const keyword = requestUrl.searchParams.get('keywords')?.trim() ?? '';
  if (!keyword) return jsonResponse({ code: 400, message: '缺少搜索关键词。' }, 400);
  if (keyword.length > 120) return jsonResponse({ code: 400, message: '搜索关键词过长。' }, 400);

  const attempts = upstreamsFor(context.env).map((upstream) => fetchUpstream(upstream, keyword));
  try {
    const winner = await Promise.any(attempts.map(async (attempt) => {
      const result = await attempt;
      if (!result.songCount) throw new Error('empty result');
      return result;
    }));
    return jsonResponse(winner.payload, 200, { 'X-Search-Upstream': winner.label });
  } catch {
    const settled = await Promise.allSettled(attempts);
    const validEmpty = settled.find(
      (result): result is PromiseFulfilledResult<UpstreamResult> => result.status === 'fulfilled',
    );
    if (validEmpty) {
      return jsonResponse(validEmpty.value.payload, 200, { 'X-Search-Upstream': validEmpty.value.label });
    }

    const timedOut = settled.some(
      (result) => result.status === 'rejected'
        && result.reason instanceof DOMException
        && result.reason.name === 'AbortError',
    );
    return jsonResponse(
      {
        code: timedOut ? 504 : 502,
        message: timedOut ? '音乐搜索上游响应超时。' : '音乐搜索上游暂时不可用。',
      },
      timedOut ? 504 : 502,
    );
  }
}
