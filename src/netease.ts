export type NeteaseSong = {
  id: number;
  name: string;
  ar?: Array<{ id: number; name: string }>;
  artists?: Array<{ id: number; name: string }>;
  al?: { id: number; name: string; picUrl?: string };
  album?: { id: number; name: string; picUrl?: string };
  dt?: number;
  duration?: number;
};

export type CloudTrack = {
  id: string;
  neteaseId: number;
  title: string;
  artist: string;
  album: string;
  coverUrl?: string;
  durationS: number;
  audioUrl: string;
  quality?: string;
};

type SearchResponse = {
  code?: number;
  result?: { songs?: NeteaseSong[]; songCount?: number };
};

type SongDetailResponse = {
  code?: number;
  songs?: NeteaseSong[];
};

type SongUrlResponse = {
  code?: number;
  data?: Array<{
    id: number;
    url: string | null;
    time?: number;
    level?: string;
    type?: string;
  }>;
};

const trimBase = (value: string) => value.trim().replace(/\/+$/, '');

export const defaultNeteaseApiBase = () => {
  const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
  return trimBase(env?.VITE_NETEASE_API_BASE || 'http://localhost:3000');
};

const requestJson = async <T>(url: string): Promise<T> => {
  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
    credentials: 'omit',
  });
  if (!response.ok) throw new Error(`网易云 API 请求失败（HTTP ${response.status}）`);
  return response.json() as Promise<T>;
};

export const searchNeteaseSongs = async (apiBase: string, keywords: string, limit = 20) => {
  const base = trimBase(apiBase);
  if (!base) throw new Error('请先填写网易云 API 地址');
  const query = new URLSearchParams({ keywords: keywords.trim(), type: '1', limit: String(limit) });
  const payload = await requestJson<SearchResponse>(`${base}/cloudsearch?${query}`);
  if (payload.code !== undefined && payload.code !== 200) throw new Error(`网易云搜索失败（code ${payload.code}）`);
  return payload.result?.songs ?? [];
};

const artistNames = (song: NeteaseSong) => (song.ar ?? song.artists ?? []).map((artist) => artist.name).filter(Boolean).join(' / ') || '未知歌手';
const albumInfo = (song: NeteaseSong) => song.al ?? song.album;
const durationMs = (song: NeteaseSong) => song.dt ?? song.duration ?? 0;

export const songSummary = (song: NeteaseSong) => ({
  title: song.name,
  artist: artistNames(song),
  album: albumInfo(song)?.name || '未知专辑',
  coverUrl: albumInfo(song)?.picUrl,
  durationS: Math.max(0, durationMs(song) / 1000),
});

export const resolveNeteaseTrack = async (apiBase: string, song: NeteaseSong): Promise<CloudTrack> => {
  const base = trimBase(apiBase);
  if (!base) throw new Error('请先填写网易云 API 地址');

  const id = String(song.id);
  const [detailPayload, urlPayload] = await Promise.all([
    requestJson<SongDetailResponse>(`${base}/song/detail?${new URLSearchParams({ ids: id })}`),
    requestJson<SongUrlResponse>(`${base}/song/url/v1?${new URLSearchParams({ id, level: 'standard' })}`),
  ]);

  const detailedSong = detailPayload.songs?.[0] ?? song;
  const stream = urlPayload.data?.find((item) => item.id === song.id) ?? urlPayload.data?.[0];
  if (!stream?.url) {
    throw new Error('该歌曲暂时没有可播放地址，可能受版权、地区或登录状态限制');
  }

  const summary = songSummary(detailedSong);
  return {
    id: `netease-${song.id}`,
    neteaseId: song.id,
    title: summary.title,
    artist: summary.artist,
    album: summary.album,
    coverUrl: summary.coverUrl,
    durationS: summary.durationS || Math.max(0, (stream.time ?? 0) / 1000),
    audioUrl: stream.url,
    quality: stream.level ?? stream.type,
  };
};
