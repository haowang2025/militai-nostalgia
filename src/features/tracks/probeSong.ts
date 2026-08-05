import type { SearchSong } from '../search/searchApi';
import { localTrackFromSearchSong, type LocalTrack } from './trackStore';

export const isAbortError = (error: unknown) =>
  error instanceof DOMException && error.name === 'AbortError';

export const probeSong = (song: SearchSong, signal?: AbortSignal) => new Promise<LocalTrack>((resolve, reject) => {
  const audio = document.createElement('audio');
  const fallbackDuration = song.durationMs ? song.durationMs / 1000 : undefined;
  let settled = false;
  let timeout = 0;

  const cleanup = () => {
    window.clearTimeout(timeout);
    signal?.removeEventListener('abort', abort);
    audio.removeEventListener('loadedmetadata', succeed);
    audio.removeEventListener('canplay', succeed);
    audio.removeEventListener('error', fail);
    audio.removeAttribute('src');
    audio.load();
  };

  const finish = (track?: LocalTrack, error?: Error) => {
    if (settled) return;
    settled = true;
    cleanup();
    if (track) resolve(track);
    else reject(error ?? new Error('这首歌当前无法加载，请选择其他版本或稍后重试。'));
  };

  function succeed() {
    if (signal?.aborted) {
      abort();
      return;
    }
    const duration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : fallbackDuration;
    finish(localTrackFromSearchSong(song, duration));
  }

  function fail() {
    finish(undefined, new Error('这首歌当前无法加载，请选择其他版本或稍后重试。'));
  }

  function abort() {
    finish(undefined, new DOMException('歌曲准备已取消。', 'AbortError'));
  }

  timeout = window.setTimeout(
    () => finish(undefined, new Error('歌曲加载超时，请选择其他版本或稍后重试。')),
    12_000,
  );
  audio.preload = 'metadata';
  audio.addEventListener('loadedmetadata', succeed, { once: true });
  audio.addEventListener('canplay', succeed, { once: true });
  audio.addEventListener('error', fail, { once: true });
  signal?.addEventListener('abort', abort, { once: true });

  if (signal?.aborted) {
    abort();
    return;
  }

  audio.src = localTrackFromSearchSong(song).audio_url;
  audio.load();
});
