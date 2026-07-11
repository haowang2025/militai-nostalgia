import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  defaultNeteaseApiBase,
  resolveNeteaseTrack,
  searchNeteaseSongs,
  songSummary,
  type CloudTrack,
  type NeteaseSong,
} from './netease';
import './cloud.css';

type CloudMoment = {
  id: string;
  trackId: string;
  timestampS: number;
  note: string;
  createdAt: string;
  updatedAt: string;
};

const MOMENTS_KEY = 'militai-cloud-moments-v1';
const API_BASE_KEY = 'militai-netease-api-base-v1';

const formatTime = (seconds: number) => {
  const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const minutes = Math.floor(safe / 60).toString().padStart(2, '0');
  const rest = Math.floor(safe % 60).toString().padStart(2, '0');
  return `${minutes}:${rest}`;
};

const readMoments = (): CloudMoment[] => {
  try {
    const parsed = JSON.parse(localStorage.getItem(MOMENTS_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const createId = () => globalThis.crypto?.randomUUID?.() ?? `moment-${Date.now()}-${Math.random().toString(16).slice(2)}`;

const downloadJson = (filename: string, value: unknown) => {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
};

function CloudApp() {
  const [apiBase, setApiBase] = useState(() => localStorage.getItem(API_BASE_KEY) || defaultNeteaseApiBase());
  const [keywords, setKeywords] = useState('');
  const [results, setResults] = useState<NeteaseSong[]>([]);
  const [track, setTrack] = useState<CloudTrack | null>(null);
  const [moments, setMoments] = useState<CloudMoment[]>(readMoments);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [status, setStatus] = useState('搜索一首歌，然后在听到有感觉的地方按空格。');
  const [isSearching, setIsSearching] = useState(false);
  const [loadingSongId, setLoadingSongId] = useState<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const trackMoments = useMemo(
    () => moments.filter((moment) => moment.trackId === track?.id).sort((a, b) => a.timestampS - b.timestampS),
    [moments, track?.id],
  );

  useEffect(() => {
    localStorage.setItem(MOMENTS_KEY, JSON.stringify(moments));
  }, [moments]);

  useEffect(() => {
    localStorage.setItem(API_BASE_KEY, apiBase.trim());
  }, [apiBase]);

  const captureMoment = () => {
    if (!track) {
      setStatus('请先选择一首可播放的歌曲');
      return;
    }
    const now = audioRef.current?.currentTime ?? currentTime;
    const timestamp = new Date().toISOString();
    const moment: CloudMoment = {
      id: createId(),
      trackId: track.id,
      timestampS: now,
      note: '',
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    setMoments((items) => [...items, moment]);
    setStatus(`已记住 ${formatTime(now)}，可以在下方补写这段记忆。`);
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches('input, textarea, button, select, [contenteditable="true"]')) return;
      if (event.code !== 'Space' || event.repeat) return;
      event.preventDefault();
      captureMoment();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  const search = async (event: FormEvent) => {
    event.preventDefault();
    if (!keywords.trim()) {
      setStatus('请输入歌名、歌手或专辑');
      return;
    }
    setIsSearching(true);
    setStatus('正在搜索网易云音乐…');
    try {
      const songs = await searchNeteaseSongs(apiBase, keywords);
      setResults(songs);
      setStatus(songs.length ? `找到 ${songs.length} 首歌曲` : '没有找到匹配歌曲');
    } catch (error) {
      setResults([]);
      setStatus(error instanceof Error ? error.message : '搜索失败');
    } finally {
      setIsSearching(false);
    }
  };

  const chooseSong = async (song: NeteaseSong) => {
    setLoadingSongId(song.id);
    setStatus('正在获取播放地址…');
    audioRef.current?.pause();
    try {
      const resolved = await resolveNeteaseTrack(apiBase, song);
      setTrack(resolved);
      setCurrentTime(0);
      setDuration(resolved.durationS);
      setStatus('歌曲已载入。播放后按空格或“记住此刻”保存锚点。');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '歌曲载入失败');
    } finally {
      setLoadingSongId(null);
    }
  };

  const updateMoment = (id: string, note: string) => {
    setMoments((items) => items.map((moment) => moment.id === id ? { ...moment, note, updatedAt: new Date().toISOString() } : moment));
  };

  const deleteMoment = (id: string) => {
    setMoments((items) => items.filter((moment) => moment.id !== id));
  };

  const seek = (timestamp: number) => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = timestamp;
    setCurrentTime(timestamp);
  };

  const exportMoments = () => {
    if (!track) return;
    downloadJson(`${track.id}-memory.json`, {
      $schema: 'https://militai.me/schemas/friday-compatible-memory-v1.json',
      version: '1.0.0',
      exported_at: new Date().toISOString(),
      track: {
        id: track.id,
        source: 'netease-cloud-music',
        source_id: track.neteaseId,
        title: track.title,
        artist: track.artist,
        album: track.album,
        duration: duration || track.durationS,
        cover: track.coverUrl,
      },
      segments: trackMoments.map((moment) => ({
        start: Math.max(0, moment.timestampS - 5),
        end: Math.min(duration || track.durationS, moment.timestampS + 5),
        peak_t: moment.timestampS,
        source: 'user',
        content: moment.note,
        confidence: { score: 1, scope: 'user_record', meaning: '用户主动保存的私人 Moment' },
        function: ['私人 Moment'],
        evidence: { user_note: moment.note },
        payload: { privacy: { visibility: 'local_first', exported_by_user: true } },
      })),
    });
  };

  return (
    <main className="cloud-app">
      <header className="cloud-topbar">
        <a className="cloud-brand" href="/nostalgia"><span className="cloud-wave">▥</span><strong>MilitAIre Nostalgia</strong></a>
        <div><span className="cloud-badge">网易云模式</span><a href="/nostalgia">返回本地播放器</a></div>
      </header>

      <section className="cloud-layout">
        <aside className="cloud-search-panel cloud-card">
          <div className="cloud-section-title"><div><span>NETEASE CLOUD MUSIC</span><h1>从云端找一首歌</h1></div></div>
          <form className="cloud-search-form" onSubmit={search}>
            <input value={keywords} onChange={(event) => setKeywords(event.target.value)} placeholder="歌名 / 歌手 / 专辑" aria-label="搜索网易云歌曲" />
            <button disabled={isSearching}>{isSearching ? '搜索中…' : '搜索'}</button>
          </form>
          <details className="cloud-api-settings">
            <summary>API 设置</summary>
            <label>网易云 API 地址<input value={apiBase} onChange={(event) => setApiBase(event.target.value)} placeholder="http://localhost:3000" /></label>
            <p>运行 u3588064/NeteaseCloudMusicApi 后填写服务地址。地址只保存在当前浏览器。</p>
          </details>
          <p className="cloud-status" role="status">{status}</p>
          <div className="cloud-results">
            {results.map((song) => {
              const summary = songSummary(song);
              return (
                <button key={song.id} className="cloud-result" onClick={() => void chooseSong(song)} disabled={loadingSongId !== null}>
                  {summary.coverUrl ? <img src={summary.coverUrl} alt="" /> : <span className="cloud-cover-fallback">♪</span>}
                  <span><strong>{summary.title}</strong><small>{summary.artist}</small><em>{summary.album} · {formatTime(summary.durationS)}</em></span>
                  <b>{loadingSongId === song.id ? '载入中' : '播放'}</b>
                </button>
              );
            })}
          </div>
        </aside>

        <section className="cloud-player-column">
          <article className="cloud-player cloud-card">
            <div className="cloud-record-art">
              {track?.coverUrl ? <img src={track.coverUrl} alt={`${track.title} 封面`} /> : <span>♪</span>}
            </div>
            <div className="cloud-track-copy">
              <span className="cloud-kicker">NOW PLAYING</span>
              <h2>{track?.title ?? '还没有选择歌曲'}</h2>
              <p>{track ? `${track.artist} · ${track.album}` : '在左侧搜索网易云歌曲并选择播放。'}</p>
              {track?.quality ? <small>音质：{track.quality}</small> : null}
            </div>
            <audio
              ref={audioRef}
              src={track?.audioUrl}
              controls
              preload="metadata"
              crossOrigin="anonymous"
              onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
              onLoadedMetadata={(event) => setDuration(event.currentTarget.duration || track?.durationS || 0)}
              onError={() => setStatus('音频加载失败：播放地址可能已过期或被浏览器跨域策略拦截')}
            />
            <div className="cloud-progress-copy"><span>{formatTime(currentTime)}</span><span>{formatTime(duration || track?.durationS || 0)}</span></div>
            <div className="cloud-player-actions">
              <button className="cloud-remember" onClick={captureMoment} disabled={!track}>记住此刻</button>
              <button onClick={exportMoments} disabled={!track || !trackMoments.length}>导出 JSON</button>
            </div>
          </article>

          <article className="cloud-moments cloud-card">
            <div className="cloud-section-title"><div><span>LOCAL FIRST</span><h2>这首歌的 Moment</h2></div><b>{trackMoments.length}</b></div>
            {!track ? <p className="cloud-empty">选择歌曲后，你保存的记忆锚点会出现在这里。</p> : null}
            {track && !trackMoments.length ? <p className="cloud-empty">播放歌曲，在某一刻按下空格。记忆只保存在这个浏览器。</p> : null}
            <div className="cloud-moment-list">
              {trackMoments.map((moment) => (
                <div className="cloud-moment" key={moment.id}>
                  <button className="cloud-time" onClick={() => seek(moment.timestampS)}>{formatTime(moment.timestampS)}</button>
                  <textarea value={moment.note} onChange={(event) => updateMoment(moment.id, event.target.value)} placeholder="这一刻让你想起了什么？" />
                  <button className="cloud-delete" onClick={() => deleteMoment(moment.id)} aria-label="删除 Moment">删除</button>
                </div>
              ))}
            </div>
          </article>
        </section>
      </section>

      <footer className="cloud-footer">歌曲搜索与播放依赖用户自行运行的网易云 API；私人 Moment 始终默认保存在浏览器 localStorage。</footer>
    </main>
  );
}

export default CloudApp;
