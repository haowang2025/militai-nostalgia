import { useEffect, useMemo, useRef, useState } from 'react';
import { companionSeed, tracks } from './demoData';
import { useNostalgiaStore } from './store';
import type { FridaySegment, Moment, Track } from './types';

type View = 'player' | 'library' | 'settings';

const formatTime = (value: number) => {
  const safe = Math.max(0, Number.isFinite(value) ? value : 0);
  const minutes = Math.floor(safe / 60).toString().padStart(2, '0');
  const seconds = Math.floor(safe % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
};

const segmentId = (trackId: string, segment: FridaySegment, index: number) =>
  segment.id ?? `seg_${trackId}_${Math.round(segment.start)}_${Math.round(segment.end)}_${index}`;

const defaultMomentText = '这段让我想起一个突然被大家一起接住的梗。';

function createFridayExport(track: Track, moments: Moment[], segments: FridaySegment[]) {
  return {
    $schema: 'https://militai.me/schemas/friday-compatible-memory-v1.json',
    version: '1.0.0',
    exported_at: new Date().toISOString(),
    track: {
      id: track.id,
      title: track.title,
      artist: track.artist,
      album: track.album ?? '',
    },
    segments: moments.map((moment) => {
      const publicSegment = segments.find((segment, index) => segmentId(track.id, segment, index) === moment.public_segment_id);
      return {
        start: moment.start_s,
        end: moment.end_s,
        peak_t: moment.timestamp_s,
        source: 'user',
        content: moment.note || defaultMomentText,
        confidence: {
          score: 0.95,
          scope: 'user_record',
          meaning: '由用户主动点击保存，表示这一刻对用户有私人意义。',
        },
        function: ['用户标记', '私人记忆', ...(publicSegment?.function ?? [])],
        evidence: {
          user_note: moment.note || defaultMomentText,
          user_selected_mood: moment.mood,
          danmaku_examples: publicSegment?.evidence.danmaku_examples ?? [],
          crowd_signals: publicSegment?.evidence.crowd_signals ?? {
            burst: 'unknown',
            sync_level: 'unknown',
            meme: [],
          },
        },
        payload: {
          mood: moment.mood,
          tags: moment.tags,
          moment_ids: [moment.id],
          track: { id: track.id, title: track.title, artist: track.artist },
          public_segment_id: moment.public_segment_id,
          ai_usage: {
            allow_recall: moment.allow_recall,
            recall_style: moment.recall_style,
            visibility: 'private',
            do_not_use_for_ads: true,
          },
        },
      };
    }),
  };
}

function downloadJson(filename: string, payload: unknown) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function App() {
  const [view, setView] = useState<View>('player');
  const [track, setTrack] = useState<Track>(tracks[0]);
  const [segments, setSegments] = useState<FridaySegment[]>([]);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(track.duration_s);
  const [isPlaying, setIsPlaying] = useState(false);
  const [toast, setToast] = useState('按空格，记住此刻');
  const [selectedMomentId, setSelectedMomentId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const allMoments = useNostalgiaStore((state) => state.moments);
  const moments = allMoments.filter((moment) => moment.track_id === track.id);
  const addMoment = useNostalgiaStore((state) => state.addMoment);
  const updateMoment = useNostalgiaStore((state) => state.updateMoment);
  const addResponse = useNostalgiaStore((state) => state.addResponse);

  useEffect(() => {
    fetch(track.friday_url)
      .then((response) => response.json())
      .then((data: FridaySegment[]) => setSegments(data))
      .catch(() => setSegments([]));
  }, [track.friday_url]);

  useEffect(() => {
    const path = window.location.pathname;
    if (path.includes('/library')) setView('library');
    if (path.includes('/settings')) setView('settings');
  }, []);

  const currentSegment = useMemo(() => {
    return segments.find((segment) => currentTime >= segment.start && currentTime <= segment.end) ?? segments[0];
  }, [segments, currentTime]);

  const activeMoments = useMemo(() => {
    return moments.filter((moment) => moment.allow_recall && currentTime >= moment.start_s - 3 && currentTime <= moment.end_s);
  }, [currentTime, moments]);

  const selectedMoment = moments.find((moment) => moment.id === selectedMomentId) ?? moments[0];

  const recordMoment = () => {
    const audio = audioRef.current;
    const timestamp = audio?.currentTime ?? currentTime;
    const segmentIndex = segments.findIndex((segment) => timestamp >= segment.start && timestamp <= segment.end);
    const publicSegment = segmentIndex >= 0 ? segments[segmentIndex] : currentSegment;
    const moment = addMoment({
      track_id: track.id,
      timestamp_s: timestamp,
      start_s: Math.max(0, timestamp - 5),
      end_s: Math.min(duration || track.duration_s, timestamp + 5),
      public_segment_id: publicSegment ? segmentId(track.id, publicSegment, Math.max(0, segmentIndex)) : undefined,
      note: defaultMomentText,
      mood: publicSegment?.function.slice(0, 2) ?? ['私人记忆'],
      tags: publicSegment?.evidence.danmaku_examples.slice(0, 2) ?? [],
    });
    setSelectedMomentId(moment.id);
    setToast(`已记录 ${formatTime(timestamp)}`);
    addResponse({
      title: '米粒太的陪伴',
      body: companionSeed[Math.floor(Math.random() * companionSeed.length)],
      tone: 'gentle',
    });
  };

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
      if (event.code === 'Space') {
        event.preventDefault();
        recordMoment();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });

  const togglePlay = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      await audio.play();
      setIsPlaying(true);
    } else {
      audio.pause();
      setIsPlaying(false);
    }
  };

  const seek = (time: number) => {
    const audio = audioRef.current;
    if (audio) audio.currentTime = time;
    setCurrentTime(time);
  };

  const exportCurrent = () => {
    downloadJson(`${track.id}-friday-memory.json`, createFridayExport(track, moments, segments));
  };

  return (
    <div className="app">
      <audio
        ref={audioRef}
        src={track.audio_url}
        preload="metadata"
        onLoadedMetadata={(event) => setDuration(event.currentTarget.duration || track.duration_s)}
        onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => setIsPlaying(false)}
      />
      <TopBar view={view} onView={setView} onExport={exportCurrent} />
      {view === 'library' ? (
        <Library activeTrack={track} onPick={(nextTrack) => { setTrack(nextTrack); setView('player'); }} />
      ) : null}
      {view === 'settings' ? <Settings /> : null}
      {view === 'player' ? (
        <>
          <HeroBoard
            audioRef={audioRef}
            track={track}
            segment={currentSegment}
            moments={moments}
            activeMoments={activeMoments}
            currentTime={currentTime}
            duration={duration}
            isPlaying={isPlaying}
            selectedMoment={selectedMoment}
            onRecord={recordMoment}
            onUpdateMoment={updateMoment}
          />
          <Transport
            track={track}
            currentTime={currentTime}
            duration={duration}
            moments={moments}
            isPlaying={isPlaying}
            toast={toast}
            onToggle={togglePlay}
            onSeek={seek}
            onRecord={recordMoment}
          />
          <ResponseArea selectedMoment={selectedMoment} onExport={exportCurrent} />
        </>
      ) : null}
    </div>
  );
}

function TopBar({ view, onView, onExport }: { view: View; onView: (view: View) => void; onExport: () => void }) {
  return (
    <header className="topbar">
      <button className="logo" onClick={() => onView('player')}>
        <span className="wave-mark"><i /><i /><i /><i /></span>
        <strong>MilitAIre Nostalgia</strong>
        <em>Beta</em>
      </button>
      <nav>
        <button className={view === 'library' ? 'active' : ''} onClick={() => onView('library')}>Library</button>
        <button onClick={onExport}>Export JSON</button>
        <button className={view === 'settings' ? 'active' : ''} onClick={() => onView('settings')}>Settings</button>
        <span className="avatar">米</span>
      </nav>
    </header>
  );
}

function HeroBoard({
  audioRef,
  track,
  segment,
  moments,
  activeMoments,
  currentTime,
  duration,
  isPlaying,
  selectedMoment,
  onRecord,
  onUpdateMoment,
}: {
  audioRef: React.RefObject<HTMLAudioElement>;
  track: Track;
  segment?: FridaySegment;
  moments: Moment[];
  activeMoments: Moment[];
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  selectedMoment?: Moment;
  onRecord: () => void;
  onUpdateMoment: (id: string, patch: Partial<Pick<Moment, 'note' | 'mood' | 'tags' | 'allow_recall' | 'recall_style'>>) => void;
}) {
  const confidence = segment?.confidence.score ?? 0.95;
  return (
    <section className="hero-board card-shell">
      <Spectrogram audioRef={audioRef} isPlaying={isPlaying} />
      <div className="track-panel">
        <div className="cover-card"><span>{track.cover}</span></div>
        <div>
          <span className="pill">Friday Sample</span>
          <h1>{track.title}</h1>
          <p>{track.artist}</p>
          <div className="meta-row">
            <span>样例音频</span><span>{formatTime(duration)}</span>
          </div>
          <blockquote>“{track.description}”</blockquote>
          <strong className="clock">{formatTime(currentTime)} <small>/ {formatTime(duration)}</small></strong>
        </div>
      </div>

      <div className="frequency-labels" aria-hidden="true">
        <span>8kHz</span><span>4kHz</span><span>2kHz</span><span>1kHz</span><span>512Hz</span><span>256Hz</span>
      </div>

      <article className="segment-floating">
        <small>当前片段 {segment ? `${formatTime(segment.start)} - ${formatTime(segment.end)}` : '加载中'}</small>
        <h2>{segment?.function.join(' · ') ?? '等待 Friday JSON'}</h2>
        <p>{segment?.content ?? '正在读取 nilimaoma.json 的公共情绪段落。'}</p>
        <div className="tag-row">
          {(segment?.evidence.danmaku_examples ?? ['读取中']).map((item) => <span key={item}>{item}</span>)}
        </div>
        <div className="confidence"><span>置信度</span><b>{confidence.toFixed(2)}</b><i style={{ width: `${confidence * 100}%` }} /></div>
      </article>

      <div className="timeline-spike" style={{ left: `${Math.min(88, Math.max(48, (currentTime / Math.max(duration, 1)) * 100))}%` }} />

      <article className="moment-card">
        <h3>{selectedMoment ? `${formatTime(selectedMoment.timestamp_s)} 的 Moments` : '还没有 Moments'}</h3>
        <p>{activeMoments.length || moments.length} 个回忆同时出现</p>
        <div className="tag-row quiet-tags">
          {(selectedMoment?.tags.length ? selectedMoment.tags : ['支持阿坤', '升华', '上头']).map((tag) => <span key={tag}>{tag}</span>)}
        </div>
        <p className="moment-note">{selectedMoment?.note || defaultMomentText}</p>
        <small>记录于 {selectedMoment?.created_at.slice(0, 10) ?? '本地浏览器'}</small>
        <div className="moment-actions">
          <button className="solid" onClick={onRecord}>录一段</button>
          <button onClick={() => selectedMoment && onUpdateMoment(selectedMoment.id, { note: `${selectedMoment.note || defaultMomentText} 继续写。` })}>继续写</button>
          <button onClick={onRecord}>♡ 记录这一刻</button>
        </div>
        <div className="dots"><b /><i /><i /></div>
      </article>
    </section>
  );
}

function Spectrogram({ audioRef, isPlaying }: { audioRef: React.RefObject<HTMLAudioElement>; isPlaying: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const connectedRef = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const audio = audioRef.current;
    if (!canvas || !audio) return;
    let raf = 0;

    const connect = () => {
      if (connectedRef.current) return;
      const AudioCtor = window.AudioContext || (window as Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtor) return;
      const context = new AudioCtor();
      const analyser = context.createAnalyser();
      analyser.fftSize = 256;
      const source = context.createMediaElementSource(audio);
      source.connect(analyser);
      analyser.connect(context.destination);
      analyserRef.current = analyser;
      connectedRef.current = true;
    };

    const draw = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, rect.width * dpr);
      canvas.height = Math.max(1, rect.height * dpr);
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const analyser = analyserRef.current;
      const data = analyser ? new Uint8Array(analyser.frequencyBinCount) : new Uint8Array(128);
      if (analyser) analyser.getByteFrequencyData(data);
      const barWidth = canvas.width / data.length;
      data.forEach((bin, index) => {
        const simulated = isPlaying ? 45 + Math.sin(Date.now() / 170 + index * 0.33) * 42 + Math.sin(index * 1.7) * 18 : 18 + Math.sin(index * 0.4) * 6;
        const value = analyser ? bin : simulated;
        const barHeight = Math.max(3, (value / 255) * canvas.height * 0.68);
        ctx.fillStyle = `rgba(153, 162, 91, ${0.13 + value / 620})`;
        ctx.fillRect(index * barWidth, canvas.height - barHeight, Math.max(1, barWidth - 2), barHeight);
      });
      raf = requestAnimationFrame(draw);
    };

    audio.addEventListener('play', connect);
    draw();
    return () => {
      audio.removeEventListener('play', connect);
      cancelAnimationFrame(raf);
    };
  }, [audioRef, isPlaying]);

  return <canvas className="spectrogram" ref={canvasRef} aria-hidden="true" />;
}

function Transport({
  track,
  currentTime,
  duration,
  moments,
  isPlaying,
  toast,
  onToggle,
  onSeek,
  onRecord,
}: {
  track: Track;
  currentTime: number;
  duration: number;
  moments: Moment[];
  isPlaying: boolean;
  toast: string;
  onToggle: () => void;
  onSeek: (time: number) => void;
  onRecord: () => void;
}) {
  return (
    <section className="transport-card card-shell">
      <div className="shortcut"><kbd>空格</kbd><span>{toast}</span><small>?</small></div>
      <div className="volume">⌕<i><b /></i></div>
      <div className="progress-area">
        <span>{formatTime(currentTime)}</span>
        <div className="progress-line">
          <input min={0} max={duration || 1} step={0.1} value={currentTime} type="range" onChange={(event) => onSeek(Number(event.target.value))} />
          <div className="progress-fill" style={{ width: `${(currentTime / Math.max(duration, 1)) * 100}%` }} />
          {moments.map((moment, index) => (
            <button
              key={moment.id}
              className="moment-dot"
              style={{ left: `${(moment.timestamp_s / Math.max(duration, 1)) * 100}%` }}
              onClick={() => onSeek(moment.timestamp_s)}
            >
              {index + 1}
            </button>
          ))}
        </div>
        <span>{formatTime(duration)}</span>
      </div>
      <div className="controls">
        <button title="shuffle">⌘</button>
        <button title="previous">◀</button>
        <button className="play" onClick={onToggle}>{isPlaying ? 'Ⅱ' : '▶'}</button>
        <button title="next">▶</button>
        <button title="repeat">↻</button>
      </div>
      <button className="export-mini" onClick={onRecord}>记住此刻</button>
    </section>
  );
}

function ResponseArea({ selectedMoment, onExport }: { selectedMoment?: Moment; onExport: () => void }) {
  const responses = useNostalgiaStore((state) => state.responses);
  return (
    <section className="response-grid">
      <aside className="side-tabs card-shell">
        <button className="current">米粒太反馈</button>
        <button>陪伴书信</button>
        <button>历史记录</button>
      </aside>
      <article className="analysis-card card-shell">
        <div className="panel-title"><h2>米粒太专业反馈</h2><span>分析完成</span></div>
        <p>整体音高接近目标，但句尾气息支撑略弱，情绪进入稍早。</p>
        <div className="metric-grid">
          <Metric title="音准" state="良好" body="句尾略微下滑。建议：句尾保持气息，避免摇晃和塌陷。" />
          <Metric title="气息" state="需加强" body="最后两拍支撑变弱。建议：提前半拍吸气，尾音不要急着收。" />
          <Metric title="情绪" state="良好" body="情绪进入稍早。可以更克制一点，让副歌自然放进去。" />
        </div>
        <footer>分析时间：本地 Demo　音频时长：{selectedMoment ? `${Math.round(selectedMoment.end_s - selectedMoment.start_s)}s` : '14.2s'}　模型：本地模拟 MCP</footer>
      </article>
      <article className="letter-card card-shell">
        <div className="panel-title"><h2>米粒太的陪伴</h2><span>书信式回复</span></div>
        <p>{responses[0]?.body ?? '这一段你不是没唱出感觉，反而是情绪来得很快。'}</p>
        <p>米粒太听到的问题主要在句尾：气息有点提前收掉。</p>
        <p>你可以先不要急着把这一句唱满，让声音在最后两拍多停一会儿。</p>
        <p>我在这里，陪你把这一段唱得更稳。</p>
        <button onClick={onExport}>复制 / 导出 JSON</button>
        <em>— Olivia Lin</em>
      </article>
    </section>
  );
}

function Metric({ title, state, body }: { title: string; state: string; body: string }) {
  return <article className="metric"><div><strong>{title}</strong><span>{state}</span></div><svg viewBox="0 0 100 28" aria-hidden="true"><polyline points="0,19 14,13 28,22 42,8 58,16 72,21 86,13 100,15" /></svg><p>{body}</p></article>;
}

function Library({ activeTrack, onPick }: { activeTrack: Track; onPick: (track: Track) => void }) {
  return (
    <section className="library-page card-shell">
      <h1>Library</h1>
      <p>Demo 使用同一个 `nilimaoma.mp3` 和 `nilimaoma.json` 构造 3 个 Friday Sample 入口，保证 Cloudflare Pages 静态部署即可运行。</p>
      <div className="library-list">
        {tracks.map((track) => <button key={track.id} className={track.id === activeTrack.id ? 'chosen' : ''} onClick={() => onPick(track)}><span>{track.cover}</span><strong>{track.title}</strong><small>{track.description}</small></button>)}
      </div>
    </section>
  );
}

function Settings() {
  return (
    <section className="settings-page card-shell">
      <h1>Settings</h1>
      <p>当前 Cloudflare demo 不保存 API Key。开源/服务端版本可继续接入 `data/config.json`、MCP endpoint 和 LLM provider。</p>
      <label>LLM Provider<input placeholder="openai / compatible" /></label>
      <label>Model<input placeholder="gpt-4o / local model" /></label>
      <label>MCP Endpoint<input placeholder="https://mcp.militai.me" /></label>
    </section>
  );
}

export default App;
