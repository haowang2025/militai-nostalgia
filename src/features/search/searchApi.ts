export type SearchSong = {
  provider: 'n';
  providerId: number;
  name: string;
  artists: string[];
  albumName?: string;
  coverUrl?: string;
  durationMs?: number;
};

export type SearchErrorCode = 'network' | 'timeout' | 'invalid_response' | 'empty_result' | 'aborted';

export class SearchApiError extends Error {
  code: SearchErrorCode;

  constructor(code: SearchErrorCode, message: string) {
    super(message);
    this.name = 'SearchApiError';
    this.code = code;
  }
}

export type SearchEndpoint = {
  base: string;
  path: '/api/search' | '/search' | '/cloudsearch';
  timeoutMs: number;
};

type SearchEndpointOptions = {
  production?: boolean;
  origin?: string;
};

const configuredBase = import.meta.env.VITE_NETEASE_API_BASE?.trim();
const DEPRECATED_BASES = new Set([
  'https://netease-cloud-music-api-sandy-xi.vercel.app',
]);
const DEFAULT_DIRECT_ENDPOINTS: SearchEndpoint[] = [
  { base: 'https://ezmusic-api.vercel.app', path: '/search', timeoutMs: 4_500 },
  {
    base: 'https://netease-cloud-music-api-backup-roan-alpha.vercel.app',
    path: '/cloudsearch',
    timeoutMs: 4_500,
  },
];
const PROXY_TIMEOUT_MS = 10_000;

const normalizeBase = (base: string) => base.replace(/\/+$/, '');

export const searchEndpoints = (options: SearchEndpointOptions = {}): SearchEndpoint[] => {
  const production = options.production ?? import.meta.env.PROD;
  const origin = options.origin
    ?? (typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
  if (production) {
    return [{ base: origin, path: '/api/search', timeoutMs: PROXY_TIMEOUT_MS }];
  }

  const configuredEndpoints: SearchEndpoint[] = configuredBase && !DEPRECATED_BASES.has(normalizeBase(configuredBase))
    ? [{ base: configuredBase, path: '/cloudsearch', timeoutMs: 4_500 }]
    : [];
  const candidates = [...configuredEndpoints, ...DEFAULT_DIRECT_ENDPOINTS];
  const seen = new Set<string>();
  return candidates.filter((endpoint) => {
    const key = `${normalizeBase(endpoint.base)}${endpoint.path}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const firstRecord = (...values: unknown[]) => values.find(isRecord);

const readSongs = (payload: unknown): unknown[] => {
  if (!isRecord(payload)) return [];
  const body = firstRecord(payload.body, payload.data);
  const result = firstRecord(payload.result, body?.result);
  return Array.isArray(result?.songs) ? result.songs : [];
};

const readArtists = (song: Record<string, unknown>) => {
  const source = Array.isArray(song.ar) ? song.ar : Array.isArray(song.artists) ? song.artists : [];
  return source
    .map((item) => isRecord(item) && typeof item.name === 'string' ? item.name.trim() : '')
    .filter(Boolean);
};

const readErrorMessage = (payload: unknown) =>
  isRecord(payload) && typeof payload.message === 'string' && payload.message.trim()
    ? payload.message.trim()
    : null;

export const adaptSearchResponse = (payload: unknown): SearchSong[] => readSongs(payload)
  .map((value): SearchSong | null => {
    if (!isRecord(value)) return null;
    const providerId = typeof value.id === 'number' && Number.isFinite(value.id) ? value.id : Number.NaN;
    const name = typeof value.name === 'string' ? value.name.trim() : '';
    if (!Number.isFinite(providerId) || !name) return null;

    const album = firstRecord(value.al, value.album);
    const item: SearchSong = {
      provider: 'n',
      providerId,
      name,
      artists: readArtists(value),
    };
    if (typeof album?.name === 'string' && album.name.trim()) item.albumName = album.name.trim();
    const cover = album?.picUrl ?? album?.pic_url;
    if (typeof cover === 'string' && cover.trim()) item.coverUrl = cover.trim();
    const duration = value.dt ?? value.duration;
    if (typeof duration === 'number' && Number.isFinite(duration) && duration > 0) item.durationMs = duration;
    return item;
  })
  .filter((item): item is SearchSong => Boolean(item))
  .slice(0, 10);

const searchEndpoint = async (
  endpoint: SearchEndpoint,
  keyword: string,
  signal?: AbortSignal,
): Promise<SearchSong[]> => {
  const controller = new AbortController();
  let timedOut = false;
  const timeout = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, endpoint.timeoutMs);
  const forwardAbort = () => controller.abort();
  signal?.addEventListener('abort', forwardAbort, { once: true });

  try {
    const url = new URL(endpoint.path, endpoint.base);
    url.searchParams.set('keywords', keyword);
    url.searchParams.set('type', '1');
    url.searchParams.set('limit', '10');
    url.searchParams.set('offset', '0');

    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      let message: string | null = null;
      try {
        message = readErrorMessage(await response.json());
      } catch {
        message = null;
      }
      if (response.status === 504) {
        throw new SearchApiError('timeout', message ?? '音乐搜索服务响应超时。');
      }
      throw new SearchApiError('network', message ?? `音乐搜索服务暂时不可用（HTTP ${response.status}）。`);
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new SearchApiError('invalid_response', '音乐搜索服务返回了无法识别的数据。');
    }

    const songs = adaptSearchResponse(payload);
    if (!songs.length) throw new SearchApiError('empty_result', '没有找到可用歌曲，请换一个关键词。');
    return songs;
  } catch (error) {
    if (signal?.aborted) throw new SearchApiError('aborted', '搜索已取消。');
    if (timedOut) throw new SearchApiError('timeout', '音乐搜索服务响应超时。');
    if (error instanceof SearchApiError) throw error;
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new SearchApiError('aborted', '搜索已取消。');
    }
    throw new SearchApiError('network', '无法连接音乐搜索服务。');
  } finally {
    window.clearTimeout(timeout);
    signal?.removeEventListener('abort', forwardAbort);
  }
};

export const searchSongs = async (query: string, signal?: AbortSignal): Promise<SearchSong[]> => {
  const keyword = query.trim();
  if (!keyword) return [];

  const endpoints = searchEndpoints();
  const failures: SearchApiError[] = [];
  for (const endpoint of endpoints) {
    try {
      return await searchEndpoint(endpoint, keyword, signal);
    } catch (error) {
      if (error instanceof SearchApiError && error.code === 'aborted') throw error;
      failures.push(error instanceof SearchApiError
        ? error
        : new SearchApiError('network', '无法连接音乐搜索服务。'));
    }
  }

  if (failures.some((error) => error.code === 'empty_result')) {
    throw new SearchApiError('empty_result', '没有找到可用歌曲，请换一个关键词。');
  }
  if (failures.length && failures.every((error) => error.code === 'timeout')) {
    throw new SearchApiError(
      'timeout',
      endpoints.length > 1 ? '音乐搜索服务响应超时，备用节点也未能及时响应。' : '音乐搜索服务响应超时。',
    );
  }
  throw new SearchApiError('network', '音乐搜索服务暂时不可用。');
};

export const audioUrlForSong = (providerId: number) =>
  `https://music.163.com/song/media/outer/url?id=${providerId}.mp3`;

export const trackIdForSong = (providerId: number) => `netease-${providerId}`;
