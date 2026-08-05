import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNostalgiaStore } from './store';
import type { SearchSong } from './features/search/searchApi';
import { SearchPanel, Cover } from './features/search/SearchPanel';
import { PlayerPage } from './features/player/SearchFirstPlayer';
import { probeSong } from './features/tracks/probeSong';
import { useTrackStore, type LocalTrack } from './features/tracks/trackStore';

type Route =
  | { view: 'search' }
  | { view: 'library' }
  | { view: 'settings' }
  | { view: 'player'; trackId: string };

type PendingSelection = {
  controller: AbortController;
  token: number;
};

const repoUrl = 'https://github.com/haowang2025/militai-nostalgia';

const basePath = () => window.location.pathname.startsWith('/nostalgia') ? '/nostalgia' : '';
const routeFromPath = (path: string): Route => {
  const normalized = path.replace(/\/+$/, '') || '/';
  const base = basePath();
  if (normalized === `${base}/library`) return { view: 'library' };
  if (normalized === `${base}/settings`) return { view: 'settings' };
  const prefix = `${base}/player/`;
  if (normalized.startsWith(prefix)) return { view: 'player', trackId: decodeURIComponent(normalized.slice(prefix.length)) };
  return { view: 'search' };
};

const pathForRoute = (route: Route) => {
  const base = basePath();
  if (route.view === 'library') return `${base}/library` || '/library';
  if (route.view === 'settings') return `${base}/settings` || '/settings';
  if (route.view === 'player') return `${base}/player/${encodeURIComponent(route.trackId)}` || `/player/${encodeURIComponent(route.trackId)}`;
  return base || '/';
};

const useAppRoute = () => {
  const [route, setRoute] = useState<Route>(() => routeFromPath(window.location.pathname));
  useEffect(() => {
    const onPopState = () => setRoute(routeFromPath(window.location.pathname));
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);
  const navigate = useCallback((next: Route, replace = false) => {
    const path = pathForRoute(next);
    if (window.location.pathname !== path) window.history[replace ? 'replaceState' : 'pushState']({}, '', path);
    setRoute(next);
  }, []);
  return { route, navigate };
};

const formatTime = (value: number) => {
  const safe = Math.max(0, Number.isFinite(value) ? value : 0);
  const minutes = Math.floor(safe / 60).toString().padStart(2, '0');
  const seconds = Math.floor(safe % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
};

function SearchFirstApp() {
  const { route, navigate } = useAppRoute();
  const tracks = useTrackStore((state) => state.tracks);
  const upsertTrack = useTrackStore((state) => state.upsertTrack);
  const setCurrentTrack = useTrackStore((state) => state.setCurrentTrack);
  const trackStorageError = useTrackStore((state) => state.storageError);
  const clearTrackStorageError = useTrackStore((state) => state.clearStorageError);
  const momentStorageError = useNostalgiaStore((state) => state.storageError);
  const clearMomentStorageError = useNostalgiaStore((state) => state.clearStorageError);
  const selectionRef = useRef<PendingSelection | null>(null);
  const selectionSequenceRef = useRef(0);
  const [notice, setNotice] = useState<string | null>(null);

  const recentTracks = useMemo(
    () => [...tracks].sort((a, b) => b.last_opened_at.localeCompare(a.last_opened_at)),
    [tracks],
  );

  const cancelPendingSelection = useCallback(() => {
    selectionSequenceRef.current += 1;
    selectionRef.current?.controller.abort();
    selectionRef.current = null;
  }, []);

  const navigateSafely = useCallback((next: Route, replace = false) => {
    cancelPendingSelection();
    navigate(next, replace);
  }, [cancelPendingSelection, navigate]);

  useEffect(() => {
    const cancelWhenHidden = () => {
      if (document.hidden) cancelPendingSelection();
    };
    window.addEventListener('popstate', cancelPendingSelection);
    document.addEventListener('visibilitychange', cancelWhenHidden);
    return () => {
      window.removeEventListener('popstate', cancelPendingSelection);
      document.removeEventListener('visibilitychange', cancelWhenHidden);
      cancelPendingSelection();
    };
  }, [cancelPendingSelection]);

  const selectSong = useCallback(async (song: SearchSong) => {
    cancelPendingSelection();
    const controller = new AbortController();
    const token = selectionSequenceRef.current;
    selectionRef.current = { controller, token };

    try {
      const prepared = await probeSong(song, controller.signal);
      if (controller.signal.aborted || selectionRef.current?.token !== token) {
        throw new DOMException('歌曲准备已取消。', 'AbortError');
      }
      const saved = upsertTrack(prepared);
      setCurrentTrack(saved.id);
      selectionRef.current = null;
      navigate({ view: 'player', trackId: saved.id });
    } finally {
      if (selectionRef.current?.token === token) selectionRef.current = null;
    }
  }, [cancelPendingSelection, navigate, setCurrentTrack, upsertTrack]);

  useEffect(() => {
    if (route.view !== 'player') return;
    if (tracks.some((track) => track.id === route.trackId)) return;
    setNotice('这首歌曲尚未保存在当前浏览器，请重新搜索。');
    navigateSafely({ view: 'search' }, true);
  }, [navigateSafely, route, tracks]);

  const openLocalTrack = useCallback((track: LocalTrack) => {
    cancelPendingSelection();
    setCurrentTrack(track.id);
    navigate({ view: 'player', trackId: track.id });
  }, [cancelPendingSelection, navigate, setCurrentTrack]);

  return (
    <div className="search-first-app">
      <TopBar
        route={route}
        onHome={() => navigateSafely({ view: 'search' })}
        onSearch={() => navigateSafely({ view: 'search' })}
        onLibrary={() => navigateSafely({ view: 'library' })}
        onSettings={() => navigateSafely({ view: 'settings' })}
      />
      {notice ? <StatusBanner message={notice} onDismiss={() => setNotice(null)} /> : null}
      {trackStorageError ? <StatusBanner message={trackStorageError} onDismiss={clearTrackStorageError} /> : null}
      {momentStorageError ? <StatusBanner message={momentStorageError} onDismiss={clearMomentStorageError} /> : null}

      {route.view === 'search' ? (
        <SearchPage recentTracks={recentTracks} onSelectSong={selectSong} onOpenTrack={openLocalTrack} />
      ) : null}
      {route.view === 'library' ? (
        <LibraryPage tracks={recentTracks} onOpenTrack={openLocalTrack} onSearch={() => navigateSafely({ view: 'search' })} />
      ) : null}
      {route.view === 'settings' ? <SettingsPage tracks={tracks} /> : null}
      {route.view === 'player' ? (
        <PlayerPage trackId={route.trackId} tracks={recentTracks} onSelectSong={selectSong} onOpenTrack={openLocalTrack} />
      ) : null}
    </div>
  );
}

function TopBar({ route, onHome, onSearch, onLibrary, onSettings }: { route: Route; onHome: () => void; onSearch: () => void; onLibrary: () => void; onSettings: () => void }) {
  return (
    <header className="sf-topbar">
      <button className="sf-logo" onClick={onHome} aria-label="返回音乐搜索首页">
        <span className="sf-wave"><i /><i /><i /><i /></span><strong>MilitAIre Nostalgia</strong><em>Local first</em>
      </button>
      <nav aria-label="Primary navigation">
        <button className={route.view === 'search' ? 'active' : ''} onClick={onSearch}>Search</button>
        <button className={route.view === 'library' ? 'active' : ''} onClick={onLibrary}>Library</button>
        <button className={route.view === 'settings' ? 'active' : ''} onClick={onSettings}>Settings</button>
        <a href={repoUrl} target="_blank" rel="noreferrer" aria-label="打开 GitHub 仓库">GitHub</a>
      </nav>
    </header>
  );
}

function StatusBanner({ message, onDismiss }: { message: string; onDismiss?: () => void }) {
  return <aside className="sf-status" role="status"><span>{message}</span>{onDismiss ? <button onClick={onDismiss}>关闭</button> : null}</aside>;
}

function SearchPage({ recentTracks, onSelectSong, onOpenTrack }: { recentTracks: LocalTrack[]; onSelectSong: (song: SearchSong) => Promise<void>; onOpenTrack: (track: LocalTrack) => void }) {
  return (
    <main className="sf-search-page">
      <section className="sf-search-hero">
        <p className="sf-kicker">SEARCH · LISTEN · REMEMBER</p>
        <h1>搜索一首歌，留下它唤起的私人记忆。</h1>
        <p>歌曲入口与播放进度保存在当前浏览器；Moment 不会发送给音乐搜索服务。</p>
        <SearchPanel recentTracks={recentTracks.slice(0, 6)} onSelectSong={onSelectSong} onOpenTrack={onOpenTrack} autoFocus />
      </section>
    </main>
  );
}

function LibraryPage({ tracks, onOpenTrack, onSearch }: { tracks: LocalTrack[]; onOpenTrack: (track: LocalTrack) => void; onSearch: () => void }) {
  const moments = useNostalgiaStore((state) => state.moments);
  return (
    <main className="sf-library-page">
      <div className="sf-page-heading"><div><span>LOCAL LIBRARY</span><h1>本地曲库</h1><p>这里保存歌曲入口、播放进度和 Moment，不缓存远程 MP3。</p></div><button onClick={onSearch}>搜索新歌曲</button></div>
      {tracks.length ? (
        <div className="sf-library-grid">
          {tracks.map((track) => {
            const count = moments.filter((moment) => moment.track_id === track.id).length;
            return (
              <button key={track.id} onClick={() => onOpenTrack(track)}>
                <Cover title={track.title} url={track.cover_url} />
                <span><strong>{track.title}</strong><em>{track.artist}</em><small>{count} 个 Moment · 上次播放 {formatTime(track.last_position_s)}</small></span>
              </button>
            );
          })}
        </div>
      ) : <div className="sf-empty"><h2>还没有本地歌曲</h2><p>搜索并打开一首歌后，它会出现在这里。</p><button onClick={onSearch}>开始搜索</button></div>}
    </main>
  );
}

function SettingsPage({ tracks }: { tracks: LocalTrack[] }) {
  const moments = useNostalgiaStore((state) => state.moments);
  return (
    <main className="sf-settings-page">
      <div className="sf-page-heading"><div><span>DATA & NETWORK</span><h1>Settings</h1></div></div>
      <section className="sf-settings-grid">
        <article><strong>{tracks.length}</strong><span>本地歌曲</span></article>
        <article><strong>{moments.length}</strong><span>Moment</span></article>
        <article><strong>v1 / v2</strong><span>曲库 / Moment 存储</span></article>
      </section>
      <section className="sf-privacy-card">
        <h2>数据与网络</h2>
        <p>歌曲、播放进度和 Moment 默认保存在当前浏览器。</p>
        <p>搜索关键词会发送到配置的音乐搜索 API；歌曲音频会从远程音频服务加载。</p>
        <p>Moment 文本、标签和本地媒体不会自动上传。清除浏览器站点数据会删除本地曲库和 Moment。</p>
      </section>
    </main>
  );
}

export default SearchFirstApp;
