import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { SearchApiError, searchSongs, type SearchSong } from './searchApi';
import type { LocalTrack } from '../tracks/trackStore';

type SearchState =
  | { status: 'idle' }
  | { status: 'loading'; query: string }
  | { status: 'success'; query: string; songs: SearchSong[] }
  | { status: 'empty'; query: string }
  | { status: 'error'; query: string; message: string };

const formatTime = (value: number) => {
  const safe = Math.max(0, Number.isFinite(value) ? value : 0);
  const minutes = Math.floor(safe / 60).toString().padStart(2, '0');
  const seconds = Math.floor(safe % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
};

export function SearchPanel({
  recentTracks,
  onSelectSong,
  onOpenTrack,
  autoFocus = false,
}: {
  recentTracks: LocalTrack[];
  onSelectSong: (song: SearchSong) => Promise<void>;
  onOpenTrack: (track: LocalTrack) => void;
  autoFocus?: boolean;
}) {
  const [query, setQuery] = useState('');
  const [state, setState] = useState<SearchState>({ status: 'idle' });
  const [countdown, setCountdown] = useState(10);
  const [autoSelect, setAutoSelect] = useState(false);
  const [openingId, setOpeningId] = useState<number | null>(null);
  const [unavailable, setUnavailable] = useState<number[]>([]);
  const [openError, setOpenError] = useState<string | null>(null);
  const requestRef = useRef<AbortController | null>(null);

  const cancelAutoSelect = useCallback(() => setAutoSelect(false), []);

  const choose = useCallback(async (song: SearchSong) => {
    cancelAutoSelect();
    setOpeningId(song.providerId);
    setOpenError(null);
    try {
      await onSelectSong(song);
    } catch (error) {
      setUnavailable((items) => Array.from(new Set([...items, song.providerId])));
      setOpenError(error instanceof Error ? error.message : '这首歌当前无法加载。');
    } finally {
      setOpeningId(null);
    }
  }, [cancelAutoSelect, onSelectSong]);

  useEffect(() => {
    if (state.status !== 'success' || !autoSelect) return;
    if (countdown <= 0) {
      const first = state.songs[0];
      setAutoSelect(false);
      if (first) void choose(first);
      return;
    }
    const timer = window.setTimeout(() => setCountdown((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [autoSelect, choose, countdown, state]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) cancelAutoSelect();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [cancelAutoSelect]);

  useEffect(() => () => requestRef.current?.abort(), []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const keyword = query.trim();
    if (!keyword) return;
    requestRef.current?.abort();
    cancelAutoSelect();
    setUnavailable([]);
    setOpenError(null);
    const controller = new AbortController();
    requestRef.current = controller;
    setState({ status: 'loading', query: keyword });
    try {
      const songs = await searchSongs(keyword, controller.signal);
      setState({ status: 'success', query: keyword, songs });
      setCountdown(10);
      setAutoSelect(true);
    } catch (error) {
      if (error instanceof SearchApiError && error.code === 'aborted') return;
      const message = error instanceof Error ? error.message : '搜索失败，请稍后重试。';
      if (error instanceof SearchApiError && error.code === 'empty_result') setState({ status: 'empty', query: keyword });
      else setState({ status: 'error', query: keyword, message });
    }
  };

  return (
    <div className="sf-search-panel">
      <form className="sf-search-form" onSubmit={(event) => { void submit(event); }}>
        <input
          value={query}
          autoFocus={autoFocus}
          placeholder="歌曲、歌手，例如：海阔天空 黄家驹"
          aria-label="搜索歌曲或歌手"
          onChange={(event) => setQuery(event.target.value)}
        />
        <button type="submit" disabled={state.status === 'loading' || !query.trim()}>
          {state.status === 'loading' ? '搜索中…' : '搜索'}
        </button>
      </form>

      {state.status === 'success' ? (
        <section className="sf-results" aria-label="音乐搜索结果">
          <div className="sf-countdown" aria-live="polite">
            {autoSelect ? <span>{countdown} 秒后自动打开第一首</span> : <span>已取消自动打开</span>}
            {autoSelect ? <button onClick={cancelAutoSelect}>取消自动打开</button> : null}
          </div>
          <div className="sf-result-list">
            {state.songs.map((song, index) => {
              const failed = unavailable.includes(song.providerId);
              const isOpening = openingId === song.providerId;
              return (
                <article className={`sf-song-row ${failed ? 'is-unavailable' : ''}`} key={song.providerId}>
                  <Cover title={song.name} url={song.coverUrl} />
                  <div className="sf-song-copy">
                    <div><strong>{song.name}</strong>{index === 0 ? <span className="sf-default-badge">默认选择</span> : null}</div>
                    <span>{song.artists.join(' / ') || '未知歌手'}</span>
                    <small>{song.albumName || '未知专辑'}{song.durationMs ? ` · ${formatTime(song.durationMs / 1000)}` : ''}</small>
                  </div>
                  <button disabled={Boolean(openingId)} onClick={() => { void choose(song); }}>
                    {isOpening ? '正在准备…' : failed ? '重试' : '打开'}
                  </button>
                </article>
              );
            })}
          </div>
        </section>
      ) : null}

      {openError ? <p className="sf-inline-status is-error" role="status">{openError}</p> : null}
      {state.status === 'loading' ? <p className="sf-inline-status" role="status">正在搜索“{state.query}”……</p> : null}
      {state.status === 'empty' ? <p className="sf-inline-status" role="status">没有找到“{state.query}”，请换一个关键词。</p> : null}
      {state.status === 'error' ? <p className="sf-inline-status is-error" role="status">{state.message}</p> : null}

      {state.status === 'idle' && recentTracks.length ? (
        <section className="sf-recent">
          <div className="sf-section-title"><h2>最近打开</h2><span>保存在当前浏览器</span></div>
          <div className="sf-recent-grid">
            {recentTracks.map((track) => (
              <button key={track.id} onClick={() => onOpenTrack(track)}>
                <Cover title={track.title} url={track.cover_url} />
                <span><strong>{track.title}</strong><small>{track.artist}</small></span>
              </button>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

export function Cover({ title, url }: { title: string; url?: string }) {
  return url
    ? <img className="sf-cover" src={url} alt="" loading="lazy" />
    : <span className="sf-cover sf-cover-fallback" aria-hidden="true">{title.slice(0, 1) || '音'}</span>;
}
