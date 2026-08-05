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

type SearchEndpoint = {
  base: string;
  path: '/search' | '/cloudsearch';
};

const configuredBase = import.meta.env.VITE_NETEASE_API_BASE?.trim();
const DEFAULT_ENDPOINTS: SearchEndpoint[] = [
  { base: 'https://ezmusic-api.vercel.app', path: '/search' },
  { base: 'https://netease-cloud-music-api-backup-roan-alpha.vercel.app', path: '/cloudsearch' },
];
const ENDPOINT_TIMEOUT_MS = 4_500;

export const searchEndpoints = (): SearchEndpoint[] => {
  const candidates: SearchEndpoint[] = configuredBase
    ? [{ base: configuredBase, path: '/cloudsearch' }, ...DEFAULT_ENDPOINTS]
    : DEFAULT_ENDPOINTS;
  const seen = new Set<string>();
  return candidates.filter((endpoint) => {
    const key = `${endpoint.base.replace(/\/+$/, '')}${endpoint.path}`;
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
  }, ENDPOINT_TIMEOUT_MS);
  const forwardAbort = () => controller.abort();
  signal?.addEventListener('abort', forwardAbort, { once: true });

  try {
    const url = new URL(endpoint.path, endpoint.base);
    url.searchParams.set('keywords', keyword);
    url.searchParams.set('type', '1');
    url.searchParams.set('limit', '10');
    url.searchParams.set('offset', '0');

    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new SearchApiError('network', `音乐搜索节点暂时不可用（HTTP ${response.status}）。`);

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new SearchApiError('invalid_response', '音乐搜索节点返回了无法识别的数据。');
    }

    const songs = adaptSearchResponse(payload);
    if (!songs.length) throw new SearchApiError('empty_result', '没有找到可用歌曲，请换一个关键词。');
    return songs;
  } catch (error) {
    if (signal?.aborted) throw new SearchApiError('aborted', '搜索已取消。');
    if (timedOut) throw new SearchApiError('timeout', '音乐搜索节点响应超时。');
    if (error instanceof SearchApiError) throw error;
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new SearchApiError('aborted', '搜索已取消。');
    }
    throw new SearchApiError('network', '无法连接音乐搜索节点。');
  } finally {
    window.clearTimeout(timeout);
    signal?.removeEventListener('abort', forwardAbort);
  }
};

export const searchSongs = async (query: string, signal?: AbortSignal): Promise<SearchSong[]> => {
  const keyword = query.trim();
  if (!keyword) return [];

  const failures: SearchApiError[] = [];
  for (const endpoint of searchEndpoints()) {
    try {
      return await searchEndpoint(endpoint, keyword, signal);
    } catch (error) {
      if (error instanceof SearchApiError && error.code === 'aborted') throw error;
      failures.push(error instanceof SearchApiError
        ? error
        : new SearchApiError('network', '无法连接音乐搜索节点。'));
    }
  }

  if (failures.some((error) => error.code === 'empty_result')) {
    throw new SearchApiError('empty_result', '没有找到可用歌曲，请换一个关键词。');
  }
  if (failures.length && failures.every((error) => error.code === 'timeout')) {
    throw new SearchApiError('timeout', '音乐搜索服务响应超时，备用节点也未能及时响应。');
  }
  throw new SearchApiError('network', '音乐搜索服务暂时不可用，已尝试备用节点。');
};

export const audioUrlForSong = (providerId: number) =>
  `https://music.163.com/song/media/outer/url?id=${providerId}.mp3`;

export const trackIdForSong = (providerId: number) => `netease-${providerId}`;
