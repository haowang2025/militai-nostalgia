import { create } from 'zustand';
import { tracks as demoTracks } from '../../demoData';
import type { Track } from '../../types';
import type { SearchSong } from '../search/searchApi';
import { audioUrlForSong, trackIdForSong } from '../search/searchApi';

export type LocalTrack = Track & {
  source: 'online' | 'demo';
  provider_id?: number;
  artists: string[];
  cover_url?: string;
  created_at: string;
  last_opened_at: string;
  last_position_s: number;
};

type TrackEnvelope = { version: 1; tracks: LocalTrack[] };
type PlaybackEnvelope = { currentTrackId?: string; positions: Record<string, number>; updatedAt: string };

export type PlaybackMediaState = {
  ready: boolean;
  atStart: boolean;
  ended: boolean;
  matchesTrack: boolean;
};

const TRACK_KEY = 'militai-nostalgia/tracks/v1';
const PLAYBACK_KEY = 'militai-nostalgia/playback/v1';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const nowIso = () => new Date().toISOString();

export const shouldAcceptPositionUpdate = (
  previousPosition: number,
  nextPosition: number,
  mediaState?: PlaybackMediaState,
) => {
  if (nextPosition > 0.05 || previousPosition <= 0.05) return true;
  if (!mediaState?.matchesTrack) return false;
  return mediaState.ended || (mediaState.ready && mediaState.atStart);
};

const readPlayerMediaState = (audioUrl: string): PlaybackMediaState | undefined => {
  if (typeof document === 'undefined') return undefined;
  const media = document.querySelector('.sf-player-page > audio');
  if (!(media instanceof HTMLAudioElement)) return undefined;
  let expectedUrl: string;
  try {
    expectedUrl = new URL(audioUrl, window.location.href).href;
  } catch {
    return undefined;
  }
  return {
    ready: media.readyState >= 1,
    atStart: media.currentTime <= 0.05,
    ended: media.ended,
    matchesTrack: media.src === expectedUrl || media.currentSrc === expectedUrl,
  };
};

const demoLocalTracks = (): LocalTrack[] => demoTracks.map((track, index) => ({
  ...track,
  source: 'demo',
  artists: [track.artist],
  cover_url: undefined,
  created_at: new Date(index).toISOString(),
  last_opened_at: new Date(index).toISOString(),
  last_position_s: 0,
}));

const parseTrack = (value: unknown): LocalTrack | null => {
  if (!isRecord(value)) return null;
  if (typeof value.id !== 'string' || typeof value.title !== 'string' || typeof value.audio_url !== 'string') return null;
  const artist = typeof value.artist === 'string' ? value.artist : '';
  const artists = Array.isArray(value.artists)
    ? value.artists.filter((item): item is string => typeof item === 'string')
    : artist ? [artist] : [];
  const providerId = typeof value.provider_id === 'number' && Number.isFinite(value.provider_id)
    ? value.provider_id
    : undefined;
  const source = value.source === 'demo' || providerId === undefined ? 'demo' : 'online';
  const track: LocalTrack = {
    id: value.id,
    source,
    title: value.title,
    artist,
    artists,
    duration_s: typeof value.duration_s === 'number' && Number.isFinite(value.duration_s) ? value.duration_s : 0,
    cover: typeof value.cover === 'string' && value.cover ? value.cover : value.title.slice(0, 1) || '音',
    audio_url: value.audio_url,
    friday_url: typeof value.friday_url === 'string' ? value.friday_url : '',
    mood: Array.isArray(value.mood) ? value.mood.filter((item): item is string => typeof item === 'string') : [],
    description: typeof value.description === 'string' ? value.description : '',
    created_at: typeof value.created_at === 'string' ? value.created_at : nowIso(),
    last_opened_at: typeof value.last_opened_at === 'string' ? value.last_opened_at : nowIso(),
    last_position_s: typeof value.last_position_s === 'number' && Number.isFinite(value.last_position_s)
      ? Math.max(0, value.last_position_s)
      : 0,
  };
  if (providerId !== undefined) track.provider_id = providerId;
  if (typeof value.album === 'string') track.album = value.album;
  if (typeof value.cover_url === 'string') track.cover_url = value.cover_url;
  return track;
};

const readJson = (key: string): unknown => {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const loadInitial = () => {
  if (typeof window === 'undefined') return { tracks: demoLocalTracks(), currentTrackId: null as string | null };
  const rawTracks = readJson(TRACK_KEY);
  const stored = isRecord(rawTracks) && Array.isArray(rawTracks.tracks)
    ? rawTracks.tracks.map(parseTrack).filter((item): item is LocalTrack => Boolean(item))
    : [];
  const byId = new Map(stored.map((track) => [track.id, track]));
  for (const demo of demoLocalTracks()) if (!byId.has(demo.id)) byId.set(demo.id, demo);

  const rawPlayback = readJson(PLAYBACK_KEY);
  const currentTrackId = isRecord(rawPlayback) && typeof rawPlayback.currentTrackId === 'string'
    ? rawPlayback.currentTrackId
    : null;
  return { tracks: Array.from(byId.values()), currentTrackId };
};

const persist = (tracks: LocalTrack[], currentTrackId: string | null) => {
  if (typeof window === 'undefined') return null;
  try {
    const envelope: TrackEnvelope = { version: 1, tracks };
    const positions = Object.fromEntries(tracks.map((track) => [track.id, track.last_position_s]));
    const playback: PlaybackEnvelope = { positions, updatedAt: nowIso() };
    if (currentTrackId) playback.currentTrackId = currentTrackId;
    window.localStorage.setItem(TRACK_KEY, JSON.stringify(envelope));
    window.localStorage.setItem(PLAYBACK_KEY, JSON.stringify(playback));
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : '无法保存本地曲库。';
  }
};

export const localTrackFromSearchSong = (song: SearchSong, durationSeconds?: number): LocalTrack => {
  const now = nowIso();
  const artist = song.artists.join(' / ') || '未知歌手';
  const track: LocalTrack = {
    id: trackIdForSong(song.providerId),
    source: 'online',
    provider_id: song.providerId,
    title: song.name,
    artist,
    artists: song.artists,
    duration_s: durationSeconds && Number.isFinite(durationSeconds)
      ? durationSeconds
      : song.durationMs ? song.durationMs / 1000 : 0,
    cover: song.name.slice(0, 1) || '音',
    audio_url: audioUrlForSong(song.providerId),
    friday_url: '',
    mood: [],
    description: '来自在线音乐搜索，本地仅保存歌曲入口、播放进度和 Moment。',
    created_at: now,
    last_opened_at: now,
    last_position_s: 0,
  };
  if (song.albumName) track.album = song.albumName;
  if (song.coverUrl) track.cover_url = song.coverUrl;
  return track;
};

type TrackStore = {
  tracks: LocalTrack[];
  currentTrackId: string | null;
  storageError: string | null;
  upsertTrack: (track: LocalTrack) => LocalTrack;
  setCurrentTrack: (id: string) => void;
  updatePosition: (id: string, position: number) => void;
  touchTrack: (id: string) => void;
  clearStorageError: () => void;
};

const initial = loadInitial();

export const useTrackStore = create<TrackStore>((set, get) => ({
  tracks: initial.tracks,
  currentTrackId: initial.currentTrackId,
  storageError: null,

  upsertTrack: (incoming) => {
    const existing = get().tracks.find((track) =>
      track.id === incoming.id
      || (incoming.provider_id !== undefined && track.provider_id === incoming.provider_id),
    );
    const nextTrack: LocalTrack = existing
      ? {
          ...existing,
          ...incoming,
          id: existing.id,
          created_at: existing.created_at,
          last_position_s: existing.last_position_s,
          last_opened_at: nowIso(),
        }
      : incoming;
    const tracks = [nextTrack, ...get().tracks.filter((track) =>
      track.id !== nextTrack.id
      && (nextTrack.provider_id === undefined || track.provider_id !== nextTrack.provider_id),
    )];
    const storageError = persist(tracks, nextTrack.id);
    set({ tracks, currentTrackId: nextTrack.id, storageError });
    return nextTrack;
  },

  setCurrentTrack: (id) => {
    const tracks = get().tracks.map((track) => track.id === id ? { ...track, last_opened_at: nowIso() } : track);
    set({ tracks, currentTrackId: id, storageError: persist(tracks, id) });
  },

  updatePosition: (id, position) => {
    const safePosition = Math.max(0, Number.isFinite(position) ? position : 0);
    const existing = get().tracks.find((track) => track.id === id);
    if (existing && !shouldAcceptPositionUpdate(existing.last_position_s, safePosition, readPlayerMediaState(existing.audio_url))) {
      return;
    }
    const tracks = get().tracks.map((track) => track.id === id ? { ...track, last_position_s: safePosition } : track);
    set({ tracks, storageError: persist(tracks, get().currentTrackId) });
  },

  touchTrack: (id) => {
    const tracks = get().tracks.map((track) => track.id === id ? { ...track, last_opened_at: nowIso() } : track);
    set({ tracks, storageError: persist(tracks, get().currentTrackId) });
  },

  clearStorageError: () => set({ storageError: null }),
}));
