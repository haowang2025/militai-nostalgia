import { useEffect, useMemo, useRef, useState } from 'react';
import { companionSeed, tracks } from './demoData';
import { useNostalgiaStore } from './store';
import type { FridaySegment, Moment, Track } from './types';

type View = 'player' | 'library' | 'settings';
type AudioGraph = { context: AudioContext; analyser: AnalyserNode; source: MediaElementAudioSourceNode };

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
    track: { id: track.id, title: track.title, artist: track.artist, album: track.album ?? '' },
    segments: moments.map((moment) => {
      const publicSegment = segments.find((segment, index) => segmentId(track.id, segment, index) === moment.public_segment_id);
      return {
        start: moment.start_s,
        end: moment.end_s,
        peak_t: moment.timestamp_s,
        source: 'user',
        content: moment.note || defaultMomentText,
        confidence: { score: 0.95, scope: 'user_record', meaning: '由用户主动点击保存，表示这一刻对用户有私人意义。' },
        function: ['用户标记', '私人记忆', ...(publicSegment?.function ?? [])],
        evidence: {
          user_note: moment.note || defaultMomentText,
          user_selected_mood: moment.mood,
          danmaku_examples: publicSegment?.evidence.danmaku_examples ?? [],
          crowd_signals: publicSegment?.evidence.crowd_signals ?? { burst: 'unknown', sync_level: 'unknown', meme: [] },
        },
        payload: {
          mood: moment.mood,
          tags: moment.tags,
          moment_ids: [moment.id],
          track: { id: track.id, title: track.title, artist: track.artist },
          public_segment_id: moment.public_segment_id,
          ai_usage: { allow_recall: moment.allow_recall, recall_style: moment.recall_style, visibility: 'private', do_not_use_for_ads: true },
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
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioGraphRef = useRef<AudioGraph | null>(null);

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

  const currentSegment = useMemo(
    () => segments.find((segment) => currentTime >= segment.start && currentTime <= segment.end) ?? segments[0],
    [segments, currentTime],
  );

  const activeMoments = useMemo(
    () => moments.filter((moment) => moment.allow_recall && currentTime >= moment.start_s - 3 && currentTime <= moment.end_s),
    [currentTime, moments],
  );

  const selectedMoment = moments.find((moment) => moment.id === selectedMomentId) ?? moments[0];

  const ensureAudioGraph = async () => {
    const audio = audioRef.current;
    if (!audio) return null;
    if (!audioGraphRef.current) {
      const AudioCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtor) return null;
      const context = new AudioCtor();
      const source = context.createMediaElementSource(audio);
      const nextAnalyser = context.createAnalyser();
      nextAnalyser.fftSize = 2048;
      nextAnalyser.smoothingTimeConstant = 0.84;
      nextAnalyser.minDecibels = -88;
      nextAnalyser.maxDecibels = -12;
      source.connect(nextAnalyser);
      nextAnalyser.connect(context.destination);
      audioGraphRef.current = { context, source, analyser: nextAnalyser };
      setAnalyser(nextAnalyser);
    }
    if (audioGraphRef.current.context.state !== 'running') {
      await audioGraphRef.current.context.resume();
    }
    return audioGraphRef.current;
  };

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
    setToast(`已记录 ${formatTime(timestamp)}，可以补写或导出`);
    addResponse({ title: '米粒太的陪伴', body: companionSeed[Math.floor(Math.random() * companionSeed.length)], tone: 'gentle' });
  };

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
      if (event.code === 'Space' && !event.repeat) {
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
      await ensureAudioGraph();
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

  const exportCurrent = () => downloadJson(`${track.id}-friday-memory.json`, createFridayExport(track, moments, segments));

  const chooseTrack = (nextTrack: Track) => {
    setTrack(nextTrack);
    setCurrentTime(0);
    setDuration(nextTrack.duration_s);
    setIsPlaying(false);
    setSelectedMomentId(null);
    setView('player');
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
      {view === 'library' ? <Library activeTrack={track} onPick={chooseTrack} /> : null}
      {view === 'settings' ? <Settings /> : null}
      {view === 'player' ? (
        <>
          <HeroBoard
            analyser={analyser}
            track={track}
            segment={currentSegment}
            moments={moments}
            activeMoments={activeMoments}
            currentTime={currentTime}
            duration={duration}
            isPlaying={isPlaying}
            selectedMoment={selectedMoment}
          />
          <Transport
            currentTime={currentTime}
            duration={duration}
            moments={moments}
            isPlaying={isPlaying}
            toast={toast}
            onToggle={togglePlay}
            onSeek={seek}
            onRecord={recordMoment}
            onExport={exportCurrent}
          />
          <ResponseArea selectedMoment={selectedMoment} onUpdateMoment={updateMoment} onExport={exportCurrent} />
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
  analyser,
  track,
  segment,
  moments,
  activeMoments,
  currentTime,
  duration,
  isPlaying,
  selectedMoment,
}: {
  analyser: AnalyserNode | null;
  track: Track;
  segment?: FridaySegment;
  moments: Moment[];
  activeMoments: Moment[];
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  selectedMoment?: Moment;
}) {
  const confidence = segment?.confidence.score ?? 0.95;
  return (
    <section className="hero-board card-shell">
      <Spectrogram analyser={analyser} isPlaying={isPlaying} />
      <div className="track-panel">
        <div className="cover-card"><span>{track.cover}</span></div>
        <div>
          <span className="pill">Friday Sample</span>
          <h1>{track.title}</h1>
          <p>{track.artist}</p>
          <div className="meta-row"><span>样例音频</span><span>{formatTime(duration)}</span></div>
          <blockquote>当前 demo 直接使用 nilimaoma.mp3 播放，并用 nilimaoma.json 驱动公共情绪段落。</blockquote>
          <strong className="clock">{formatTime(currentTime)} <small>/ {formatTime(duration)}</small></strong>
        </div>
      </div>
      <div className="frequency-labels" aria-hidden="true"><span>8kHz</span><span>4kHz</span><span>2kHz</span><span>1kHz</span><span>512Hz</span><span>256Hz</span></div>
      <article className="segment-floating">
        <small>当前公共段落 {segment ? `${formatTime(segment.start)} - ${formatTime(segment.end)}` : '加载中'}</small>
        <h2>{segment?.function.join(' · ') ?? '等待 Friday JSON'}</h2>
        <p>{segment?.content ?? '正在读取 nilimaoma.json 的公共情绪段落。'}</p>
        <div className="tag-row">{(segment?.evidence.danmaku_examples ?? ['读取中']).map((item) => <span key={item}>{item}</span>)}</div>
        <div className="confidence"><span>置信度</span><b>{confidence.toFixed(2)}</b><i style={{ width: `${confidence * 100}%` }} /></div>
      </article>
      <div className="timeline-spike" style={{ left: `${Math.min(88, Math.max(48, (currentTime / Math.max(duration, 1)) * 100))}%` }} />
      <article className="moment-card">
        <h3>{selectedMoment ? `${formatTime(selectedMoment.timestamp_s)} 的 Moment` : '还没有 Moment'}</h3>
        <p>{activeMoments.length ? '正在提前召回这个时间段的私人记忆' : `${moments.length} 个私人锚点已保存在本地`}</p>
        <div className="tag-row quiet-tags">{(selectedMoment?.tags.length ? selectedMoment.tags : ['支持阿坤', '升华', '上头']).map((tag) => <span key={tag}>{tag}</span>)}</div>
        <p className="moment-note">{selectedMoment?.note || '播放时点击“记住此刻”，这里会出现你的私人记录。'}</p>
        <small>记录于 {selectedMoment?.created_at.slice(0, 10) ?? '本地浏览器'}</small>
      </article>
    </section>
  );
}

function Spectrogram({ analyser, isPlaying }: { analyser: AnalyserNode | null; isPlaying: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let raf = 0;
    const buffer = analyser ? new Uint8Array(analyser.frequencyBinCount) : null;

    const drawIdle = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
      ctx.fillStyle = 'rgba(153, 162, 91, 0.08)';
      for (let index = 0; index < 90; index += 1) {
        const x = (index / 90) * width;
        const idleHeight = 8 + ((index * 17) % 23);
        ctx.fillRect(x, height - idleHeight, Math.max(2, width / 120), idleHeight);
      }
    };

    const draw = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const width = Math.max(1, Math.floor(rect.width * dpr));
      const height = Math.max(1, Math.floor(rect.height * dpr));
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, width, height);

      if (!analyser || !buffer || !isPlaying) {
        drawIdle(ctx, width, height);
        raf = requestAnimationFrame(draw);
        return;
      }

      analyser.getByteFrequencyData(buffer);
      const columns = 132;
      const barWidth = width / columns;
      for (let column = 0; column < columns; column += 1) {
        const start = Math.floor((column / columns) ** 1.55 * buffer.length);
        const end = Math.max(start + 1, Math.floor(((column + 1) / columns) ** 1.55 * buffer.length));
        let sum = 0;
        for (let i = start; i < end; i += 1) sum += buffer[i] ?? 0;
        const value = sum / Math.max(1, end - start);
        const normalized = Math.min(1, value / 245);
        const barHeight = Math.max(2, normalized * height * 0.86);
        const alpha = 0.1 + normalized * 0.56;
        ctx.fillStyle = `rgba(153, 162, 91, ${alpha})`;
        ctx.fillRect(column * barWidth, height - barHeight, Math.max(1, barWidth - 2), barHeight);
      }
      raf = requestAnimationFrame(draw);
    };

    draw();
    return () => cancelAnimationFrame(raf);
  }, [analyser, isPlaying]);

  return <canvas className="spectrogram" ref={canvasRef} aria-label="真实音频频谱图" />;
}

function Transport({
  currentTime,
  duration,
  moments,
  isPlaying,
  toast,
  onToggle,
  onSeek,
  onRecord,
  onExport,
}: {
  currentTime: number;
  duration: number;
  moments: Moment[];
  isPlaying: boolean;
  toast: string;
  onToggle: () => void;
  onSeek: (time: number) => void;
  onRecord: () => void;
  onExport: () => void;
}) {
  return (
    <section className="transport-card card-shell">
      <div className="shortcut"><kbd>空格</kbd><span>{toast}</span></div>
      <div className="progress-area">
        <span>{formatTime(currentTime)}</span>
        <div className="progress-line">
          <input min={0} max={duration || 1} step={0.1} value={currentTime} type="range" onChange={(event) => onSeek(Number(event.target.value))} />
          <div className="progress-fill" style={{ width: `${(currentTime / Math.max(duration, 1)) * 100}%` }} />
          {moments.map((moment, index) => <button key={moment.id} className="moment-dot" style={{ left: `${(moment.timestamp_s / Math.max(duration, 1)) * 100}%` }} onClick={() => onSeek(moment.timestamp_s)}>{index + 1}</button>)}
        </div>
        <span>{formatTime(duration)}</span>
      </div>
      <div className="controls">
        <button title="previous">◀</button>
        <button className="play" onClick={onToggle}>{isPlaying ? 'Ⅱ' : '▶'}</button>
        <button title="next">▶</button>
      </div>
      <div className="transport-actions">
        <button className="remember-action" onClick={onRecord}>记住此刻</button>
        <button className="export-mini" onClick={onExport}>导出 JSON</button>
      </div>
    </section>
  );
}

function ResponseArea({ selectedMoment, onUpdateMoment, onExport }: { selectedMoment?: Moment; onUpdateMoment: (id: string, patch: Partial<Pick<Moment, 'note' | 'mood' | 'tags' | 'allow_recall' | 'recall_style'>>) => void; onExport: () => void }) {
  const responses = useNostalgiaStore((state) => state.responses);
  const [note, setNote] = useState(selectedMoment?.note ?? '');

  useEffect(() => setNote(selectedMoment?.note ?? ''), [selectedMoment?.id, selectedMoment?.note]);

  const saveNote = () => {
    if (!selectedMoment) return;
    onUpdateMoment(selectedMoment.id, { note });
  };

  return (
    <section className="response-grid focused">
      <article className="analysis-card card-shell">
        <div className="panel-title"><h2>当前 Moment</h2><span>本地私有</span></div>
        {selectedMoment ? (
          <>
            <p>时间点：{formatTime(selectedMoment.timestamp_s)}，范围：{formatTime(selectedMoment.start_s)} - {formatTime(selectedMoment.end_s)}</p>
            <textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="给这一刻补写一句话" />
            <div className="tag-row">{[...selectedMoment.mood, ...selectedMoment.tags].map((tag) => <span key={tag}>{tag}</span>)}</div>
            <div className="panel-actions"><button className="remember-action" onClick={saveNote}>保存补写</button><button onClick={onExport}>导出 Friday JSON</button></div>
          </>
        ) : <p>还没有私人锚点。播放时点击“记住此刻”或按空格。</p>}
      </article>
      <article className="letter-card card-shell">
        <div className="panel-title"><h2>米粒太反馈</h2><span>MCP 降级演示</span></div>
        <p>{responses[0]?.body ?? '先把记录链路跑通：播放、保存、补写、导出。MCP 和 LLM 后续再接真实服务。'}</p>
        <p>这里不替用户定义情绪，只把公共段落和私人锚点放在一起，作为练习或回忆时的参考。</p>
        <em>— MilitAIre</em>
      </article>
    </section>
  );
}

function Library({ activeTrack, onPick }: { activeTrack: Track; onPick: (track: Track) => void }) {
  return (
    <section className="library-page card-shell">
      <h1>Library</h1>
      <p>当前 demo 使用 nilimaoma.mp3 + nilimaoma.json。新增样例时，给每首歌各放一个 mp3 和一个 Friday segment JSON。</p>
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
      <p>Cloudflare 静态 demo 不保存 API Key。服务端版本再接 `data/config.json`、MCP endpoint 和 LLM provider。</p>
      <label>LLM Provider<input placeholder="openai / compatible" /></label>
      <label>Model<input placeholder="gpt-4o / local model" /></label>
      <label>MCP Endpoint<input placeholder="https://mcp.militai.me" /></label>
    </section>
  );
}

export default App;
