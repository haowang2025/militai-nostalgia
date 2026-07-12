import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent, type SyntheticEvent } from 'react';
import QrLogin from './features/auth/QrLogin';
import { audioProxyUrl, ncm } from './lib/ncm';
import { lyricAt, parseLrc, type LyricLine } from './lib/lrc';
import { useNostalgiaStore } from './store';
import { useAuthStore } from './store/auth';
import type { Moment } from './types';
import './cloud.css';

type NcmArtist = { id: number; name: string };
type NcmAlbum = { id: number; name: string; picUrl?: string };
type NcmSong = {
  id: number;
  name: string;
  ar?: NcmArtist[];
  artists?: NcmArtist[];
  al?: NcmAlbum;
  album?: NcmAlbum;
  dt?: number;
  duration?: number;
};

type CloudTrack = {
  id: string;
  source: 'netease';
  songId: number;
  title: string;
  artist: string;
  album: string;
  cover?: string;
  durationMs: number;
};

type NcmComment = {
  commentId: number;
  content: string;
  likedCount?: number;
  user?: { nickname?: string; avatarUrl?: string };
};

type SearchResponse = { code?: number; result?: { songs?: NcmSong[]; songCount?: number } };
type DetailResponse = { code?: number; songs?: NcmSong[] };
type UrlResponse = { code?: number; data?: Array<{ id: number; url: string | null; time?: number; level?: string; type?: string }> };
type LyricResponse = { code?: number; lrc?: { lyric?: string }; tlyric?: { lyric?: string } };
type CommentResponse = { code?: number; hotComments?: NcmComment[]; comments?: NcmComment[] };

type AudioGraph = {
  context: AudioContext;
  source: MediaElementAudioSourceNode;
  analyser: AnalyserNode;
};

const formatTime = (seconds: number) => {
  const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const minutes = Math.floor(safe / 60).toString().padStart(2, '0');
  const rest = Math.floor(safe % 60).toString().padStart(2, '0');
  return `${minutes}:${rest}`;
};

const songArtists = (song: NcmSong) => (song.ar ?? song.artists ?? []).map((artist) => artist.name).filter(Boolean).join(' / ') || '未知歌手';
const songAlbum = (song: NcmSong) => song.al ?? song.album;
const songDurationMs = (song: NcmSong) => song.dt ?? song.duration ?? 0;

const toTrack = (song: NcmSong): CloudTrack => ({
  id: `netease-${song.id}`,
  source: 'netease',
  songId: song.id,
  title: song.name,
  artist: songArtists(song),
  album: songAlbum(song)?.name || '未知专辑',
  cover: songAlbum(song)?.picUrl,
  durationMs: songDurationMs(song),
});

const downloadJson = (filename: string, value: unknown) => {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
};

function CloudSpectrum({ analyser, playing }: { analyser: AnalyserNode | null; playing: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let frame = 0;
    const buffer = analyser ? new Uint8Array(analyser.frequencyBinCount) : null;
    const draw = () => {
      const rect = canvas.getBoundingClientRect();
      const ratio = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.floor(rect.width * ratio));
      canvas.height = Math.max(1, Math.floor(rect.height * ratio));
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (!analyser || !buffer || !playing) {
        for (let i = 0; i < 52; i += 1) {
          const height = 5 + ((i * 13) % 19);
          ctx.fillStyle = 'rgba(212,60,51,.11)';
          ctx.fillRect((i / 52) * canvas.width, canvas.height - height, Math.max(2, canvas.width / 85), height);
        }
      } else {
        analyser.getByteFrequencyData(buffer);
        const columns = 72;
        const width = canvas.width / columns;
        for (let i = 0; i < columns; i += 1) {
          const index = Math.floor((i / columns) ** 1.45 * buffer.length);
          const value = (buffer[index] ?? 0) / 255;
          const height = Math.max(3, value * canvas.height * .9);
          ctx.fillStyle = `rgba(212,60,51,${.15 + value * .7})`;
          ctx.fillRect(i * width, canvas.height - height, Math.max(1, width - 2), height);
        }
      }
      frame = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(frame);
  }, [analyser, playing]);
  return <canvas className="cloud-spectrum" ref={canvasRef} aria-label="网易云音频频谱" />;
}

function CloudApp() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<NcmSong[]>([]);
  const [track, setTrack] = useState<CloudTrack | null>(null);
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [quality, setQuality] = useState<string | null>(null);
  const [lyrics, setLyrics] = useState<LyricLine[]>([]);
  const [comments, setComments] = useState<NcmComment[]>([]);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [status, setStatus] = useState('搜索歌曲，或先扫码连接网易云。');
  const [searching, setSearching] = useState(false);
  const [loadingSongId, setLoadingSongId] = useState<number | null>(null);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioGraphRef = useRef<AudioGraph | null>(null);

  const authStatus = useAuthStore((state) => state.status);
  const profile = useAuthStore((state) => state.profile);
  const restore = useAuthStore((state) => state.restore);
  const logout = useAuthStore((state) => state.logout);
  const allMoments = useNostalgiaStore((state) => state.moments);
  const addMoment = useNostalgiaStore((state) => state.addMoment);
  const updateMoment = useNostalgiaStore((state) => state.updateMoment);
  const deleteMoment = useNostalgiaStore((state) => state.deleteMoment);

  const moments = useMemo(
    () => allMoments.filter((moment) => moment.track_id === track?.id).sort((a, b) => a.timestamp_s - b.timestamp_s),
    [allMoments, track?.id],
  );
  const currentLyric = lyricAt(lyrics, currentTime);

  useEffect(() => { void restore(); }, [restore]);

  const ensureAudioGraph = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (!audioGraphRef.current) {
      const AudioCtor = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtor) return;
      const context = new AudioCtor();
      const source = context.createMediaElementSource(audio);
      const nextAnalyser = context.createAnalyser();
      nextAnalyser.fftSize = 512;
      nextAnalyser.smoothingTimeConstant = .82;
      source.connect(nextAnalyser);
      nextAnalyser.connect(context.destination);
      audioGraphRef.current = { context, source, analyser: nextAnalyser };
      setAnalyser(nextAnalyser);
    }
    if (audioGraphRef.current.context.state !== 'running') await audioGraphRef.current.context.resume();
  };

  const search = async (event: FormEvent) => {
    event.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    setStatus('正在搜索网易云音乐…');
    try {
      const payload = await ncm<SearchResponse>('/cloudsearch', { keywords: query.trim(), type: 1, limit: 24 });
      const songs = payload.result?.songs ?? [];
      setResults(songs);
      setStatus(songs.length ? `找到 ${songs.length} 首歌曲` : '没有找到匹配歌曲');
    } catch (error) {
      setResults([]);
      setStatus(error instanceof Error ? error.message : '搜索失败');
    } finally {
      setSearching(false);
    }
  };

  const selectSong = async (song: NcmSong) => {
    audioRef.current?.pause();
    setLoadingSongId(song.id);
    setStatus('正在获取歌曲信息、播放地址、歌词和热评…');
    setStreamUrl(null);
    setLyrics([]);
    setComments([]);
    try {
      const [detail, urlResult, lyricResult, commentResult] = await Promise.all([
        ncm<DetailResponse>('/song/detail', { ids: song.id }),
        ncm<UrlResponse>('/song/url/v1', { id: song.id, level: 'standard' }),
        ncm<LyricResponse>('/lyric', { id: song.id }),
        ncm<CommentResponse>('/comment/music', { id: song.id, limit: 20 }),
      ]);
      const detailedSong = detail.songs?.[0] ?? song;
      const nextTrack = toTrack(detailedSong);
      const stream = urlResult.data?.find((item) => item.id === song.id) ?? urlResult.data?.[0];
      if (!stream?.url) throw new Error('该歌曲没有可用播放地址，可能受版权、VIP、地区或登录状态限制');
      setTrack(nextTrack);
      setStreamUrl(stream.url);
      setQuality(stream.level ?? stream.type ?? null);
      setDuration(nextTrack.durationMs / 1000 || (stream.time ?? 0) / 1000);
      setCurrentTime(0);
      setLyrics(parseLrc(lyricResult.lrc?.lyric));
      setComments((commentResult.hotComments ?? commentResult.comments ?? []).slice(0, 12));
      setStatus('歌曲已载入。播放时按空格可钉住当前歌词。');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '歌曲载入失败');
    } finally {
      setLoadingSongId(null);
    }
  };

  const captureMoment = () => {
    if (!track) {
      setStatus('请先选择一首歌曲');
      return;
    }
    const time = audioRef.current?.currentTime ?? currentTime;
    const anchorLyric = lyricAt(lyrics, time);
    const moment = addMoment({
      track_id: track.id,
      timestamp_s: time,
      start_s: Math.max(0, time - 5),
      end_s: Math.min(duration || track.durationMs / 1000, time + 5),
      note: '',
      tags: anchorLyric ? ['歌词锚点'] : [],
      anchor_lyric: anchorLyric,
      payload: {
        track: { source: 'netease', song_id: track.songId, title: track.title, artist: track.artist, album: track.album, cover: track.cover },
      },
    });
    setStatus(anchorLyric ? `已记住 ${formatTime(moment.timestamp_s)} · ${anchorLyric}` : `已记住 ${formatTime(moment.timestamp_s)}`);
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, button, [contenteditable="true"]')) return;
      if (event.code !== 'Space' || event.repeat) return;
      event.preventDefault();
      captureMoment();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  const seek = (seconds: number) => {
    if (audioRef.current) audioRef.current.currentTime = seconds;
    setCurrentTime(seconds);
  };

  const exportMoments = () => {
    if (!track) return;
    downloadJson(`${track.id}-memory.json`, {
      $schema: 'https://militai.me/schemas/friday-compatible-memory-v1.json',
      version: '1.1.0',
      exported_at: new Date().toISOString(),
      track: {
        id: track.id,
        source: track.source,
        song_id: track.songId,
        title: track.title,
        artist: track.artist,
        album: track.album,
        cover: track.cover,
        duration_ms: Math.round((duration || track.durationMs / 1000) * 1000),
      },
      segments: moments.map((moment) => ({
        start: moment.start_s,
        end: moment.end_s,
        peak_t: moment.timestamp_s,
        source: 'user',
        content: moment.note,
        anchor_lyric: moment.anchor_lyric,
        confidence: { score: 1, scope: 'user_record', meaning: '用户主动保存的私人 Moment' },
        function: ['私人 Moment'],
        evidence: { user_note: moment.note, anchor_lyric: moment.anchor_lyric },
        payload: { privacy: { visibility: 'local_first', exported_by_user: true } },
      })),
    });
  };

  const proxiedAudio = streamUrl ? audioProxyUrl(streamUrl) : undefined;

  return (
    <main className="cloud-app">
      <header className="cloud-topbar">
        <a className="cloud-brand" href="/nostalgia"><span className="cloud-wave">▥</span><strong>MilitAIre Nostalgia</strong></a>
        <div className="cloud-account">
          <span className="cloud-badge">网易云模式</span>
          {authStatus === 'authed' && profile ? <><span>{profile.nickname}</span><button onClick={() => void logout()}>退出</button></> : null}
          <a href="/nostalgia">返回本地播放器</a>
        </div>
      </header>

      <section className="cloud-layout">
        <aside className="cloud-search-panel cloud-card">
          <div className="cloud-section-title"><div><span>NETEASE CLOUD MUSIC</span><h1>找一首歌</h1></div></div>
          <form className="cloud-search-form" onSubmit={search}>
            <input value={query} onChange={(event: ChangeEvent<HTMLInputElement>) => setQuery(event.target.value)} placeholder="歌名 / 歌手 / 专辑" aria-label="搜索网易云歌曲" />
            <button disabled={searching}>{searching ? '搜索中…' : '搜索'}</button>
          </form>
          <p className="cloud-status" role="status">{status}</p>
          {authStatus !== 'authed' ? <QrLogin /> : null}
          <div className="cloud-results">
            {results.map((song) => {
              const album = songAlbum(song);
              return (
                <button key={song.id} className="cloud-result" onClick={() => void selectSong(song)} disabled={loadingSongId !== null}>
                  {album?.picUrl ? <img src={album.picUrl} alt="" /> : <span className="cloud-cover-fallback">♪</span>}
                  <span><strong>{song.name}</strong><small>{songArtists(song)}</small><em>{album?.name || '未知专辑'} · {formatTime(songDurationMs(song) / 1000)}</em></span>
                  <b>{loadingSongId === song.id ? '载入中' : '播放'}</b>
                </button>
              );
            })}
          </div>
        </aside>

        <section className="cloud-player-column">
          <article className="cloud-player cloud-card">
            <CloudSpectrum analyser={analyser} playing={playing} />
            <div className="cloud-record-art">{track?.cover ? <img src={track.cover} alt={`${track.title} 封面`} /> : <span>♪</span>}</div>
            <div className="cloud-track-copy">
              <span className="cloud-kicker">NOW PLAYING</span>
              <h2>{track?.title ?? '还没有选择歌曲'}</h2>
              <p>{track ? `${track.artist} · ${track.album}` : '从左侧搜索结果中选择一首歌。'}</p>
              {quality ? <small>音质：{quality}</small> : null}
              <blockquote className={currentLyric ? '' : 'cloud-muted-lyric'}>{currentLyric ?? '歌词会在播放时显示在这里。'}</blockquote>
            </div>
            <audio
              ref={audioRef}
              src={proxiedAudio}
              controls
              preload="metadata"
              crossOrigin="anonymous"
              onPlay={() => { setPlaying(true); void ensureAudioGraph(); }}
              onPause={() => setPlaying(false)}
              onEnded={() => setPlaying(false)}
              onTimeUpdate={(event: SyntheticEvent<HTMLAudioElement>) => setCurrentTime(event.currentTarget.currentTime)}
              onLoadedMetadata={(event: SyntheticEvent<HTMLAudioElement>) => setDuration(event.currentTarget.duration || (track?.durationMs ?? 0) / 1000)}
              onError={() => setStatus('音频代理加载失败，请确认本地 API/Pages Function 已配置 audio-proxy')}
            />
            <div className="cloud-progress-copy"><span>{formatTime(currentTime)}</span><span>{formatTime(duration || (track?.durationMs ?? 0) / 1000)}</span></div>
            <div className="cloud-player-actions"><button className="cloud-remember" onClick={captureMoment} disabled={!track}>记住此刻</button><button onClick={exportMoments} disabled={!moments.length}>导出 JSON</button></div>
          </article>

          <div className="cloud-lower-grid">
            <article className="cloud-moments cloud-card">
              <div className="cloud-section-title"><div><span>ME</span><h2>私人 Moment</h2></div><b>{moments.length}</b></div>
              {!moments.length ? <p className="cloud-empty">播放歌曲，在某一刻按下空格。歌曲 ID、时间点与当时歌词会保存在本地。</p> : null}
              <div className="cloud-moment-list">
                {moments.map((moment: Moment) => (
                  <div className="cloud-moment" key={moment.id}>
                    <button className="cloud-time" onClick={() => seek(moment.timestamp_s)}>{formatTime(moment.timestamp_s)}</button>
                    <div><textarea value={moment.note} onChange={(event: ChangeEvent<HTMLTextAreaElement>) => updateMoment(moment.id, { note: event.target.value })} placeholder="这一刻让你想起了什么？" />{moment.anchor_lyric ? <q>{moment.anchor_lyric}</q> : null}</div>
                    <button className="cloud-delete" onClick={() => deleteMoment(moment.id)}>删除</button>
                  </div>
                ))}
              </div>
            </article>

            <article className="cloud-crowd cloud-card">
              <div className="cloud-section-title"><div><span>CROWD</span><h2>群体记忆</h2></div><b>{comments.length}</b></div>
              {!comments.length ? <p className="cloud-empty">选择歌曲后，这里展示网易云热评。它们不会写入你的私人 Moment。</p> : null}
              <div className="cloud-comment-list">{comments.map((comment) => <blockquote key={comment.commentId}><p>{comment.content}</p><footer>{comment.user?.nickname || '网易云用户'}{comment.likedCount ? ` · ${comment.likedCount} 赞` : ''}</footer></blockquote>)}</div>
            </article>
          </div>
        </section>
      </section>
      <footer className="cloud-footer">登录 token 只存浏览器应用存储，不写 document.cookie，也不会进入导出的 Friday 记忆包。</footer>
    </main>
  );
}

export default CloudApp;
