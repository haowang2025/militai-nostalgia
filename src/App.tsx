import { useEffect, useMemo, useRef, useState } from 'react';
import { companionSeed, tracks } from './demoData';
import { useNostalgiaStore } from './store';
import type { FridayPayload, FridaySegment, Moment, Track } from './types';

type View = 'player' | 'library' | 'settings';
type AudioGraph = { context: AudioContext; analyser: AnalyserNode; source: MediaElementAudioSourceNode };
type PayloadMedia = { type?: string; url?: string; caption?: string; role?: string; source?: string };

type MomentSurfaceData = {
  id: string;
  content: string;
  tags: string[];
  media: PayloadMedia[];
};

const formatTime = (value: number) => {
  const safe = Math.max(0, Number.isFinite(value) ? value : 0);
  const minutes = Math.floor(safe / 60).toString().padStart(2, '0');
  const seconds = Math.floor(safe % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
};

const segmentId = (trackId: string, segment: FridaySegment, index: number) =>
  segment.id ?? `seg_${trackId}_${Math.round(segment.start)}_${Math.round(segment.end)}_${index}`;

const stringArray = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
  if (typeof value === 'string' && value.trim()) return [value];
  return [];
};

const unique = (items: string[]) => Array.from(new Set(items.filter(Boolean)));

const segmentMeme = (segment?: FridaySegment) => unique([
  ...(segment?.evidence.crowd_signals.meme ?? []),
  ...stringArray(segment?.payload?.meme),
]);

const momentTags = (segment?: FridaySegment, fallback: string[] = []) => unique([
  ...segmentMeme(segment),
  ...stringArray(segment?.payload?.sensory),
  ...stringArray(segment?.payload?.imagery),
  ...(segment?.evidence.danmaku_examples ?? []),
  ...fallback,
]).slice(0, 5);

const segmentMedia = (payload?: FridayPayload): PayloadMedia[] => {
  const media = payload?.media;
  if (!Array.isArray(media)) return [];
  return media
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
    .map((item) => ({
      type: typeof item.type === 'string' ? item.type : 'media',
      url: typeof item.url === 'string' ? item.url : undefined,
      caption: typeof item.caption === 'string' ? item.caption : undefined,
      role: typeof item.role === 'string' ? item.role : undefined,
      source: typeof item.source === 'string' ? item.source : undefined,
    }))
    .filter((item) => item.url || item.caption || item.type);
};

function createFridayExport(track: Track, moments: Moment[], segments: FridaySegment[]) {
  return {
    $schema: 'https://militai.me/schemas/friday-compatible-memory-v1.json',
    version: '1.0.0',
    exported_at: new Date().toISOString(),
    track: { id: track.id, title: track.title, artist: track.artist, album: track.album ?? '' },
    segments: moments.map((moment) => {
      const inherited = segments.find((segment, index) => segmentId(track.id, segment, index) === moment.public_segment_id);
      return {
        start: moment.start_s,
        end: moment.end_s,
        peak_t: moment.timestamp_s,
        source: 'user',
        content: moment.note,
        confidence: { score: 1, scope: 'user_record', meaning: '用户主动保存并可补写的私人 Moment' },
        function: ['私人 Moment', ...(inherited?.function ?? [])],
        evidence: {
          user_note: moment.note,
          user_selected_mood: moment.mood,
          danmaku_examples: inherited?.evidence.danmaku_examples ?? [],
          crowd_signals: inherited?.evidence.crowd_signals ?? { burst: 'unknown', sync_level: 'unknown', meme: [] },
        },
        payload: {
          ...(inherited?.payload ?? {}),
          meme: unique([...segmentMeme(inherited), ...moment.tags]),
          mood: moment.mood,
          tags: moment.tags,
          moment_ids: [moment.id],
          seed_from: { source: 'friday', public_segment_id: moment.public_segment_id },
          track: { id: track.id, title: track.title, artist: track.artist },
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
    () => segments.find((segment) => currentTime >= segment.start && currentTime <= segment.end) ?? segments.find((segment) => currentTime < segment.start) ?? segments[segments.length - 1],
    [segments, currentTime],
  );

  const activeMoments = useMemo(
    () => moments.filter((moment) => moment.allow_recall && currentTime >= moment.start_s - 3 && currentTime <= moment.end_s),
    [currentTime, moments],
  );

  const selectedMoment = activeMoments.find((moment) => moment.id === selectedMomentId)
    ?? activeMoments[0]
    ?? moments.find((moment) => moment.id === selectedMomentId);

  const segmentForMoment = (moment?: Moment) => {
    if (!moment?.public_segment_id) return undefined;
    return segments.find((segment, index) => segmentId(track.id, segment, index) === moment.public_segment_id);
  };

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
    if (audioGraphRef.current.context.state !== 'running') await audioGraphRef.current.context.resume();
    return audioGraphRef.current;
  };

  const recordMoment = () => {
    const audio = audioRef.current;
    const timestamp = audio?.currentTime ?? currentTime;
    const directIndex = segments.findIndex((segment) => timestamp >= segment.start && timestamp <= segment.end);
    const seed = directIndex >= 0 ? segments[directIndex] : currentSegment;
    const seedIndex = directIndex >= 0 ? directIndex : Math.max(0, segments.findIndex((segment) => segment === seed));
    const anchorTime = seed?.peak_t ?? timestamp;
    const moment = addMoment({
      track_id: track.id,
      timestamp_s: anchorTime,
      start_s: seed?.start ?? Math.max(0, timestamp - 5),
      end_s: seed?.end ?? Math.min(duration || track.duration_s, timestamp + 5),
      public_segment_id: seed ? segmentId(track.id, seed, seedIndex) : undefined,
      note: seed?.content ?? '这一刻值得记住。',
      mood: unique([...stringArray(seed?.payload?.mood), ...(seed?.function ?? [])]).slice(0, 4),
      tags: momentTags(seed),
    });
    setSelectedMomentId(moment.id);
    setToast(`已记录 ${formatTime(anchorTime)}`);
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
            seedSegment={currentSegment}
            activeMoments={activeMoments}
            selectedMoment={selectedMoment}
            segmentForMoment={segmentForMoment}
            currentTime={currentTime}
            duration={duration}
            isPlaying={isPlaying}
          />
          <Transport currentTime={currentTime} duration={duration} moments={moments} isPlaying={isPlaying} toast={toast} onToggle={togglePlay} onSeek={seek} onRecord={recordMoment} onExport={exportCurrent} />
          <ResponseArea selectedMoment={selectedMoment} onUpdateMoment={updateMoment} onExport={exportCurrent} />
        </>
      ) : null}
    </div>
  );
}

function TopBar({ view, onView, onExport }: { view: View; onView: (view: View) => void; onExport: () => void }) {
  return <header className="topbar"><button className="logo" onClick={() => onView('player')}><span className="wave-mark"><i /><i /><i /><i /></span><strong>MilitAIre Nostalgia</strong><em>Beta</em></button><nav><button className={view === 'library' ? 'active' : ''} onClick={() => onView('library')}>Library</button><button onClick={onExport}>Export JSON</button><button className={view === 'settings' ? 'active' : ''} onClick={() => onView('settings')}>Settings</button><span className="avatar">米</span></nav></header>;
}

function toSurfaceData(moment: Moment | undefined, segment: FridaySegment | undefined, fallbackId: string): MomentSurfaceData {
  return {
    id: moment?.id ?? fallbackId,
    content: moment?.note || segment?.content || '这一刻值得记住。',
    tags: segment ? momentTags(segment, moment?.tags ?? []) : (moment?.tags ?? []).slice(0, 5),
    media: segmentMedia(segment?.payload),
  };
}

function HeroBoard({ analyser, seedSegment, activeMoments, selectedMoment, segmentForMoment, currentTime, duration, isPlaying }: { analyser: AnalyserNode | null; seedSegment?: FridaySegment; activeMoments: Moment[]; selectedMoment?: Moment; segmentForMoment: (moment?: Moment) => FridaySegment | undefined; currentTime: number; duration: number; isPlaying: boolean }) {
  const visibleMoments = activeMoments.length ? activeMoments : selectedMoment ? [selectedMoment] : [];
  const mainMoment = visibleMoments[0];
  const mainSegment = mainMoment ? segmentForMoment(mainMoment) : seedSegment;
  const mainSurface = toSurfaceData(mainMoment, mainSegment, 'seed');
  const sideSurfaces = visibleMoments.slice(1, 5).map((moment) => toSurfaceData(moment, segmentForMoment(moment), moment.id));

  return (
    <section className="hero-board card-shell clean-board">
      <Spectrogram analyser={analyser} isPlaying={isPlaying} />
      <div className="bulletin-layer">
        <MomentSurface surface={mainSurface} size="primary" />
        {sideSurfaces.map((surface, index) => <MomentSurface key={surface.id} surface={surface} size="mini" index={index} />)}
      </div>
      <div className="timeline-spike" style={{ left: `${Math.min(88, Math.max(12, (currentTime / Math.max(duration, 1)) * 100))}%` }} />
    </section>
  );
}

function MomentSurface({ surface, size, index = 0 }: { surface: MomentSurfaceData; size: 'primary' | 'mini'; index?: number }) {
  return (
    <article className={size === 'primary' ? 'bulletin-card' : `recall-card recall-${index % 4}`}>
      <h2>{surface.content}</h2>
      {surface.tags.length ? <div className="tag-row moment-hooks">{surface.tags.map((item) => <span key={item}>{item}</span>)}</div> : null}
      {surface.media.length ? <div className="media-hooks">{surface.media.slice(0, 3).map((item, mediaIndex) => <span key={`${item.url ?? item.caption ?? item.type}-${mediaIndex}`}>{item.type ?? 'media'}{item.caption ? ` · ${item.caption}` : ''}</span>)}</div> : null}
    </article>
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
      for (let index = 0; index < 90; index += 1) ctx.fillRect((index / 90) * width, height - (8 + ((index * 17) % 23)), Math.max(2, width / 120), 8 + ((index * 17) % 23));
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
        const normalized = Math.min(1, (sum / Math.max(1, end - start)) / 245);
        ctx.fillStyle = `rgba(153, 162, 91, ${0.1 + normalized * 0.56})`;
        ctx.fillRect(column * barWidth, height - Math.max(2, normalized * height * 0.86), Math.max(1, barWidth - 2), Math.max(2, normalized * height * 0.86));
      }
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [analyser, isPlaying]);
  return <canvas className="spectrogram" ref={canvasRef} aria-label="真实音频频谱图" />;
}

function Transport({ currentTime, duration, moments, isPlaying, toast, onToggle, onSeek, onRecord, onExport }: { currentTime: number; duration: number; moments: Moment[]; isPlaying: boolean; toast: string; onToggle: () => void; onSeek: (time: number) => void; onRecord: () => void; onExport: () => void }) {
  return <section className="transport-card card-shell"><div className="shortcut"><kbd>空格</kbd><span>{toast}</span></div><div className="progress-area"><span>{formatTime(currentTime)}</span><div className="progress-line"><input min={0} max={duration || 1} step={0.1} value={currentTime} type="range" onChange={(event) => onSeek(Number(event.target.value))} /><div className="progress-fill" style={{ width: `${(currentTime / Math.max(duration, 1)) * 100}%` }} />{moments.map((moment, index) => <button key={moment.id} className="moment-dot" style={{ left: `${(moment.timestamp_s / Math.max(duration, 1)) * 100}%` }} onClick={() => onSeek(moment.timestamp_s)}>{index + 1}</button>)}</div><span>{formatTime(duration)}</span></div><div className="controls"><button title="previous">◀</button><button className="play" onClick={onToggle}>{isPlaying ? 'Ⅱ' : '▶'}</button><button title="next">▶</button></div><div className="transport-actions"><button className="remember-action" onClick={onRecord}>记住此刻</button><button className="export-mini" onClick={onExport}>导出 JSON</button></div></section>;
}

function ResponseArea({ selectedMoment, onUpdateMoment, onExport }: { selectedMoment?: Moment; onUpdateMoment: (id: string, patch: Partial<Pick<Moment, 'note' | 'mood' | 'tags' | 'allow_recall' | 'recall_style'>>) => void; onExport: () => void }) {
  const responses = useNostalgiaStore((state) => state.responses);
  const [note, setNote] = useState(selectedMoment?.note ?? '');
  useEffect(() => setNote(selectedMoment?.note ?? ''), [selectedMoment?.id, selectedMoment?.note]);
  const saveNote = () => selectedMoment && onUpdateMoment(selectedMoment.id, { note });
  return <section className="response-grid focused"><article className="analysis-card card-shell"><div className="panel-title"><h2>当前 Moment</h2><span>本地私有</span></div>{selectedMoment ? <><p>时间点：{formatTime(selectedMoment.timestamp_s)}，范围：{formatTime(selectedMoment.start_s)} - {formatTime(selectedMoment.end_s)}</p><textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="给这一刻补写一句话" /><div className="tag-row">{selectedMoment.tags.slice(0, 5).map((tag) => <span key={tag}>{tag}</span>)}</div><div className="panel-actions"><button className="remember-action" onClick={saveNote}>保存补写</button><button onClick={onExport}>导出 Friday JSON</button></div></> : <p>还没有私人锚点。播放时点击“记住此刻”或按空格。</p>}</article><article className="letter-card card-shell"><div className="panel-title"><h2>米粒太反馈</h2><span>MCP 降级演示</span></div><p>{responses[0]?.body ?? '先把记录链路跑通：播放、保存、补写、导出。MCP 和 LLM 后续再接真实服务。'}</p><p>这里不替用户定义情绪，只把 Friday seed 和私人 Moment 放在一起，作为回忆召回的入口。</p><em>— MilitAIre</em></article></section>;
}

function Library({ activeTrack, onPick }: { activeTrack: Track; onPick: (track: Track) => void }) {
  return <section className="library-page card-shell"><h1>Library</h1><p>当前 demo 使用 nilimaoma.mp3 + nilimaoma.json。新增样例时，给每首歌各放一个 mp3 和一个 Friday segment JSON。</p><div className="library-list">{tracks.map((track) => <button key={track.id} className={track.id === activeTrack.id ? 'chosen' : ''} onClick={() => onPick(track)}><span>{track.cover}</span><strong>{track.title}</strong><small>{track.description}</small></button>)}</div></section>;
}

function Settings() {
  return <section className="settings-page card-shell"><h1>Settings</h1><p>Cloudflare 静态 demo 不保存 API Key。服务端版本再接 `data/config.json`、MCP endpoint 和 LLM provider。</p><label>LLM Provider<input placeholder="openai / compatible" /></label><label>Model<input placeholder="gpt-4o / local model" /></label><label>MCP Endpoint<input placeholder="https://mcp.militai.me" /></label></section>;
}

export default App;
