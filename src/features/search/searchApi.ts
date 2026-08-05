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

const API_BASE = import.meta.env.VITE_NETEASE_API_BASE
  ?? 'https://netease-cloud-music-api-sandy-xi.vercel.app';

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
  .filter((item): item is SearchSong => Boolean(item));

export const searchSongs = async (query: string, signal?: AbortSignal): Promise<SearchSong[]> => {
  const keyword = query.trim();
  if (!keyword) return [];

  const controller = new AbortController();
  let timedOut = false;
  const timeout = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, 10_000);
  const forwardAbort = () => controller.abort();
  signal?.addEventListener('abort', forwardAbort, { once: true });

  try {
    const url = new URL('/cloudsearch', API_BASE);
    url.searchParams.set('keywords', keyword);
    url.searchParams.set('type', '1');
    url.searchParams.set('limit', '10');
    url.searchParams.set('offset', '0');

    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new SearchApiError('network', `音乐搜索服务暂时不可用（HTTP ${response.status}）。`);

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
    if (error instanceof SearchApiError) throw error;
    if (error instanceof DOMException && error.name === 'AbortError') {
      if (signal?.aborted) throw new SearchApiError('aborted', '搜索已取消。');
      if (timedOut) throw new SearchApiError('timeout', '搜索超时，请稍后重试。');
      throw new SearchApiError('aborted', '搜索已取消。');
    }
    throw new SearchApiError('network', '无法连接音乐搜索服务，请检查网络后重试。');
  } finally {
    window.clearTimeout(timeout);
    signal?.removeEventListener('abort', forwardAbort);
  }
};

export const audioUrlForSong = (providerId: number) =>
  `https://music.163.com/song/media/outer/url?id=${providerId}.mp3`;

export const trackIdForSong = (providerId: number) => `netease-${providerId}`;
