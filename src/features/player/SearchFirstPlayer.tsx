import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { useNostalgiaStore } from '../../store';
import type { FridaySegment, Moment, MomentMedia, MomentPayload } from '../../types';
import { parseFridaySegments } from '../../validation';
import { createFridayExport, downloadJson, segmentId } from '../moments/momentExport';
import { deleteMediaFile } from '../moments/mediaRepository';
import { useRememberShortcut } from './useRememberShortcut';
import type { SearchSong } from '../search/searchApi';
import { Cover } from '../search/SearchPanel';
import { useTrackStore, type LocalTrack } from '../tracks/trackStore';
import { MomentEditor, type MomentDraft } from './MomentEditor';
import { SearchDrawer } from './SearchDrawer';

type RememberRange = { start: number; end: number };
type PressState = { startTime: number; startedAt: number; isLong: boolean; timer: number };

const emptyPlayerCopy = '播放音乐，在某个瞬间按下“记住此刻”。';

const formatTime = (value: number) => {
  const safe = Math.max(0, Number.isFinite(value) ? value : 0);
  const minutes = Math.floor(safe / 60).toString().padStart(2, '0');
  const seconds = Math.floor(safe % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
};

const mediaKeys = (media: MomentMedia[]) => media.flatMap((item) => item.storage_key ? [item.storage_key] : []);
const mediaFromMoment = (moment?: Moment) => Array.isArray(moment?.payload?.media) ? moment.payload.media : [];
const uniqueTags = (text: string) => Array.from(new Set(text.split(/[,，\n]/).map((tag) => tag.trim()).filter(Boolean))).slice(0, 12);

export function PlayerPage({
  trackId,
  tracks,
  onSelectSong,
  onOpenTrack,
}: {
  trackId: string;
  tracks: LocalTrack[];
  onSelectSong: (song: SearchSong) => Promise<void>;
  onOpenTrack: (track: LocalTrack) => void;
}) {
  const track = tracks.find((item) => item.id === trackId);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const pressRef = useRef<PressState | null>(null);
  const lastPersistedRef = useRef(0);
  const initializedTrackRef = useRef<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(track?.duration_s ?? 0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [segments, setSegments] = useState<FridaySegment[]>([]);
  const [message, setMessage] = useState('按空格或“记住此刻”创建 Moment');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [rememberRange, setRememberRange] = useState<RememberRange | null>(null);
  const [selectedMomentId, setSelectedMomentId] = useState<string | null>(null);
  const [draft, setDraft] = useState<MomentDraft | null>(null);

  const allMoments = useNostalgiaStore((state) => state.moments);
  const addMoment = useNostalgiaStore((state) => state.addMoment);
  const updateMoment = useNostalgiaStore((state) => state.updateMoment);
  const deleteMoment = useNostalgiaStore((state) => state.deleteMoment);
  const updatePosition = useTrackStore((state) => state.updatePosition);
  const touchTrack = useTrackStore((state) => state.touchTrack);

  const moments = useMemo(
    () => track ? allMoments.filter((moment) => moment.track_id === track.id) : [],
    [allMoments, track],
  );

  useEffect(() => {
    if (!track || initializedTrackRef.current === track.id) return;
    initializedTrackRef.current = track.id;
    setCurrentTime(track.last_position_s);
    setDuration(track.duration_s);
    setSelectedMomentId(null);
    setDraft(null);
    setSegments([]);
    touchTrack(track.id);
  }, [touchTrack, track]);

  useEffect(() => {
    if (!track?.friday_url) {
      setSegments([]);
      return;
    }
    const controller = new AbortController();
    fetch(track.friday_url, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('Friday data unavailable');
        return response.json() as Promise<unknown>;
      })
      .then((payload) => setSegments(parseFridaySegments(payload)))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setSegments([]);
      });
    return () => controller.abort();
  }, [track?.friday_url]);

  const activeTrackId = track?.id;
  useEffect(() => {
    if (!activeTrackId) return;
    const persist = () => updatePosition(activeTrackId, audioRef.current?.currentTime ?? 0);
    const interval = window.setInterval(persist, 5000);
    const onVisibility = () => { if (document.hidden) persist(); };
    const onBeforeUnload = () => persist();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('beforeunload', onBeforeUnload);
      persist();
    };
  }, [activeTrackId, updatePosition]);

  const clamp = useCallback((value: number) => Math.min(Math.max(duration, 0), Math.max(0, value)), [duration]);
  const audioTime = useCallback(() => audioRef.current?.currentTime ?? currentTime, [currentTime]);
  const currentSegment = useMemo(
    () => segments.find((segment) => currentTime >= segment.start && currentTime <= segment.end),
    [currentTime, segments],
  );
  const activeMoments = useMemo(
    () => moments.filter((moment) => moment.allow_recall && currentTime >= moment.start_s - 3 && currentTime <= moment.end_s),
    [currentTime, moments],
  );
  const selectedMoment = moments.find((moment) => moment.id === selectedMomentId) ?? activeMoments[0];

  const openEditor = useCallback((moment: Moment) => {
    const media = mediaFromMoment(moment);
    setSelectedMomentId(moment.id);
    setDraft({
      momentId: moment.id,
      note: moment.note,
      tagsText: moment.tags.join('，'),
      media,
      initialMediaKeys: mediaKeys(media),
    });
  }, []);

  const createMoment = useCallback((range?: { start: number; end: number }) => {
    if (!track) return;
    const live = audioTime();
    const start = range ? clamp(Math.min(range.start, range.end)) : Math.max(0, live - 5);
    const end = range ? clamp(Math.max(range.start, range.end)) : Math.min(duration || live + 5, live + 5);
    const middle = (start + end) / 2;
    const seed = segments.find((segment) => middle >= segment.start && middle <= segment.end) ?? currentSegment;
    const index = seed ? Math.max(0, segments.indexOf(seed)) : -1;
    const payload: MomentPayload = { media: [] };
    const moment = addMoment({
      track_id: track.id,
      timestamp_s: seed?.peak_t ?? middle,
      start_s: start,
      end_s: Math.max(start + 0.35, end),
      public_segment_id: seed && index >= 0 ? segmentId(track.id, seed, index) : undefined,
      note: '',
      mood: seed?.function ?? [],
      tags: [],
      payload,
    });
    setMessage(range ? `已创建区间 Moment：${formatTime(start)} - ${formatTime(end)}` : '已创建空白 Moment');
    openEditor(moment);
  }, [addMoment, audioTime, clamp, currentSegment, duration, openEditor, segments, track]);

  const endTimeForPress = useCallback((press: PressState) => {
    const live = audioTime();
    if (Math.abs(live - press.startTime) > 0.12) return clamp(live);
    return clamp(press.startTime + (performance.now() - press.startedAt) / 1000);
  }, [audioTime, clamp]);

  const beginRemember = useCallback(() => {
    if (!track || draft || pressRef.current) return;
    const startTime = clamp(audioTime());
    const press: PressState = {
      startTime,
      startedAt: performance.now(),
      isLong: false,
      timer: window.setTimeout(() => {
        const active = pressRef.current;
        if (!active) return;
        active.isLong = true;
        setRememberRange({ start: active.startTime, end: active.startTime });
        setMessage('继续按住选择区间，松开保存');
      }, 420),
    };
    pressRef.current = press;
  }, [audioTime, clamp, draft, track]);

  const finishRemember = useCallback(() => {
    const press = pressRef.current;
    if (!press) return;
    window.clearTimeout(press.timer);
    const end = endTimeForPress(press);
    const long = press.isLong || Math.abs(end - press.startTime) >= 0.8;
    pressRef.current = null;
    setRememberRange(null);
    createMoment(long ? { start: press.startTime, end } : undefined);
  }, [createMoment, endTimeForPress]);

  const cancelRemember = useCallback(() => {
    if (pressRef.current) window.clearTimeout(pressRef.current.timer);
    pressRef.current = null;
    setRememberRange(null);
  }, []);

  useRememberShortcut({ disabled: Boolean(draft) || !track, onStart: beginRemember, onEnd: finishRemember, onCancel: cancelRemember });

  const rememberRangeActive = Boolean(rememberRange);
  useEffect(() => {
    if (!rememberRangeActive) return;
    let frame = 0;
    const tick = () => {
      const press = pressRef.current;
      if (press?.isLong) setRememberRange({ start: press.startTime, end: endTimeForPress(press) });
      frame = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, [endTimeForPress, rememberRangeActive]);

  if (!track) return null;

  const persistNow = () => {
    const next = audioRef.current?.currentTime ?? currentTime;
    if (Math.abs(next - lastPersistedRef.current) > 0.2) {
      lastPersistedRef.current = next;
      updatePosition(track.id, next);
    }
  };

  const togglePlay = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    try {
      if (audio.paused) await audio.play();
      else audio.pause();
    } catch {
      setMessage('当前音频无法播放，可能受到版权、地区或网络限制。');
    }
  };

  const seek = (value: number) => {
    const next = clamp(value);
    if (audioRef.current) audioRef.current.currentTime = next;
    setCurrentTime(next);
  };

  const chooseAdjacent = (direction: -1 | 1) => {
    const index = tracks.findIndex((item) => item.id === track.id);
    if (index < 0 || tracks.length < 2) return;
    persistNow();
    audioRef.current?.pause();
    const next = tracks[(index + direction + tracks.length) % tracks.length];
    if (next) onOpenTrack(next);
  };

  const exportMoments = () => downloadJson(`${track.id}-memory.json`, createFridayExport(track, moments, segments));

  const saveDraft = async () => {
    if (!draft) return;
    const existing = moments.find((moment) => moment.id === draft.momentId);
    if (!existing) return;
    const retained = mediaKeys(draft.media);
    const removed = draft.initialMediaKeys.filter((key) => !retained.includes(key));
    await Promise.allSettled(removed.map(deleteMediaFile));
    updateMoment(draft.momentId, {
      note: draft.note.trim(),
      tags: uniqueTags(draft.tagsText),
      payload: { ...(existing.payload ?? {}), media: draft.media },
    });
    setDraft(null);
    setMessage('Moment 已保存');
  };

  const cancelDraft = async () => {
    if (!draft) return;
    const added = mediaKeys(draft.media).filter((key) => !draft.initialMediaKeys.includes(key));
    await Promise.allSettled(added.map(deleteMediaFile));
    setDraft(null);
  };

  const removeMoment = async () => {
    if (!draft) return;
    const existing = moments.find((moment) => moment.id === draft.momentId);
    await Promise.allSettled(mediaKeys(mediaFromMoment(existing)).map(deleteMediaFile));
    deleteMoment(draft.momentId);
    setDraft(null);
    setSelectedMomentId(null);
    setMessage('Moment 已删除');
  };

  const rangeStart = rememberRange ? Math.min(rememberRange.start, rememberRange.end) : 0;
  const rangeEnd = rememberRange ? Math.max(rememberRange.start, rememberRange.end) : 0;
  const cardCopy = selectedMoment?.note || currentSegment?.content || emptyPlayerCopy;

  return (
    <main className="sf-player-page">
      <audio
        ref={audioRef}
        src={track.audio_url}
        preload="metadata"
        onLoadedMetadata={(event) => {
          const nextDuration = event.currentTarget.duration || track.duration_s;
          setDuration(nextDuration);
          if (track.last_position_s > 0 && track.last_position_s < nextDuration - 1) {
            event.currentTarget.currentTime = track.last_position_s;
            setCurrentTime(track.last_position_s);
          }
        }}
        onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
        onPlay={() => setIsPlaying(true)}
        onPause={() => { setIsPlaying(false); persistNow(); }}
        onEnded={() => { setIsPlaying(false); updatePosition(track.id, 0); }}
      />

      <section className="sf-now-playing">
        <Cover title={track.title} url={track.cover_url} />
        <div>
          <span>{track.source === 'netease' ? 'ONLINE SEARCH · LOCAL MEMORY' : 'LOCAL DEMO'}</span>
          <h1>{track.title}</h1>
          <p>{track.artist}{track.album ? ` · ${track.album}` : ''}</p>
        </div>
        <div className="sf-track-actions">
          <button onClick={() => setDrawerOpen(true)}>搜索歌曲</button>
          <button onClick={exportMoments}>导出 JSON</button>
        </div>
      </section>

      <section className="sf-memory-stage">
        <div className={`sf-spectrum ${isPlaying ? 'is-playing' : ''}`} aria-hidden="true">
          {Array.from({ length: 72 }, (_, index) => <i key={index} style={{ '--bar': `${18 + ((index * 37) % 74)}%` } as CSSProperties} />)}
        </div>
        <article className="sf-memory-card" onClick={() => { if (selectedMoment) openEditor(selectedMoment); }}>
          <span>{selectedMoment ? `Moment · ${formatTime(selectedMoment.timestamp_s)}` : 'PRIVATE MEMORY'}</span>
          <h2>{cardCopy}</h2>
          {selectedMoment?.tags.length ? <div className="sf-tags">{selectedMoment.tags.map((tag) => <em key={tag}>{tag}</em>)}</div> : null}
          {selectedMoment ? <small>点击编辑这个 Moment</small> : <small>当前歌曲有 {moments.length} 个本地 Moment</small>}
        </article>
        {activeMoments.slice(1, 4).map((moment) => (
          <button className="sf-recall-card" key={moment.id} onClick={() => openEditor(moment)}>
            <strong>{moment.note || '空白 Moment'}</strong>
            <span>{formatTime(moment.timestamp_s)}</span>
          </button>
        ))}
      </section>

      <section className="sf-transport">
        <div className="sf-progress-row">
          <span>{formatTime(currentTime)}</span>
          <div className="sf-progress-line">
            <input aria-label="播放进度" type="range" min={0} max={duration || 1} step={0.1} value={currentTime} onChange={(event) => seek(Number(event.target.value))} />
            <div className="sf-progress-fill" style={{ width: `${(currentTime / Math.max(duration, 1)) * 100}%` }} />
            {rememberRange ? <div className="sf-hold-range" style={{ left: `${(rangeStart / Math.max(duration, 1)) * 100}%`, width: `${Math.max(0.8, ((rangeEnd - rangeStart) / Math.max(duration, 1)) * 100)}%` }} /> : null}
            {moments.map((moment, index) => (
              <button
                className="sf-moment-dot"
                key={moment.id}
                style={{ left: `${(moment.timestamp_s / Math.max(duration, 1)) * 100}%` }}
                title={`Moment ${index + 1}`}
                onClick={() => { seek(moment.timestamp_s); openEditor(moment); }}
              >{index + 1}</button>
            ))}
          </div>
          <span>{formatTime(duration)}</span>
        </div>
        <div className="sf-player-controls">
          <button aria-label="上一首" onClick={() => chooseAdjacent(-1)}>◀</button>
          <button className="sf-play" aria-label={isPlaying ? '暂停' : '播放'} onClick={() => { void togglePlay(); }}>{isPlaying ? 'Ⅱ' : '▶'}</button>
          <button aria-label="下一首" onClick={() => chooseAdjacent(1)}>▶</button>
        </div>
        <div className="sf-remember-group">
          <span>{message}</span>
          <button
            className={rememberRange ? 'is-holding' : ''}
            onPointerDown={(event: ReactPointerEvent<HTMLButtonElement>) => {
              event.preventDefault();
              event.currentTarget.setPointerCapture(event.pointerId);
              beginRemember();
            }}
            onPointerUp={(event: ReactPointerEvent<HTMLButtonElement>) => {
              event.preventDefault();
              if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
              finishRemember();
            }}
            onPointerCancel={cancelRemember}
          >记住此刻</button>
        </div>
      </section>

      <section className="sf-moment-list">
        <div className="sf-section-title"><h2>本地 Moment</h2><span>{moments.length} 个</span></div>
        {moments.length ? moments.map((moment) => (
          <button key={moment.id} onClick={() => { seek(moment.timestamp_s); openEditor(moment); }}>
            <span>{formatTime(moment.timestamp_s)}</span>
            <strong>{moment.note || '空白 Moment'}</strong>
            <small>{moment.tags.join(' · ') || '尚未添加标签'}</small>
          </button>
        )) : <p>这首歌还没有 Moment。播放到某个瞬间时按下“记住此刻”。</p>}
      </section>

      {draft ? (
        <MomentEditor
          draft={draft}
          onChange={setDraft}
          onSave={() => { void saveDraft(); }}
          onCancel={() => { void cancelDraft(); }}
          onDelete={() => { void removeMoment(); }}
        />
      ) : null}

      {drawerOpen ? (
        <SearchDrawer
          tracks={tracks}
          onClose={() => setDrawerOpen(false)}
          onOpenTrack={(next) => {
            persistNow();
            audioRef.current?.pause();
            setDrawerOpen(false);
            onOpenTrack(next);
          }}
          onSelectSong={async (song) => {
            persistNow();
            audioRef.current?.pause();
            await onSelectSong(song);
            setDrawerOpen(false);
          }}
        />
      ) : null}
    </main>
  );
}
