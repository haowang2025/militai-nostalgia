import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { tracks } from './demoData';
import { useNostalgiaStore } from './store';
import type { FridayPayload, FridaySegment, Moment, MomentMedia, MomentPayload, Track } from './types';
import { parseFridaySegments } from './validation';
import { createFridayExport, downloadJson, segmentId } from './features/moments/momentExport';
import { deleteMediaFile, loadMediaBlob, saveMediaFile } from './features/moments/mediaRepository';
import { useAudioGraph } from './features/player/useAudioGraph';
import { useRememberShortcut } from './features/player/useRememberShortcut';
import { useViewRoute, type AppView } from './features/routing/useViewRoute';

type RememberRange = { start: number; end: number; active: boolean };
type PressState = { startTime: number; startedAtMs: number; long: boolean; timer: number };

type MomentSurfaceData = {
  id: string;
  content: string;
  placeholder?: string;
  tags: string[];
  tagOptions: string[];
  media: MomentMedia[];
  momentId?: string;
  seedSegment?: FridaySegment;
};

type EditDraft = {
  surfaceId: string;
  momentId?: string;
  seedSegment?: FridaySegment;
  content: string;
  selectedTags: string[];
  customMeme: string[];
  tagInput: string;
  media: MomentMedia[];
  initialMediaKeys: string[];
};

const repoUrl = 'https://github.com/haowang2025/militai-nostalgia';
const emptyMomentPrompt = '写下这一刻你想起了什么？可以是一句话、一个人、一张画面。';
const defaultTrack = (() => {
  const track = tracks[0];
  if (!track) throw new Error('The demo needs at least one track.');
  return track;
})();

const formatTime = (value: number) => {
  const safe = Math.max(0, Number.isFinite(value) ? value : 0);
  const minutes = Math.floor(safe / 60).toString().padStart(2, '0');
  const seconds = Math.floor(safe % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
};

const stringArray = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
  if (typeof value === 'string' && value.trim()) return [value];
  return [];
};

const unique = (items: string[]) => Array.from(new Set(items.map((item) => item.trim()).filter(Boolean)));
const mediaKeys = (items: MomentMedia[]) => items.flatMap((item) => item.storage_key ? [item.storage_key] : []);

const segmentMeme = (segment?: FridaySegment) => unique([
  ...(segment?.evidence.crowd_signals.meme ?? []),
  ...stringArray(segment?.payload?.meme),
]);

const tagOptionsFromSegment = (segment?: FridaySegment, extra: string[] = []) => unique([
  ...segmentMeme(segment),
  ...stringArray(segment?.payload?.sensory),
  ...stringArray(segment?.payload?.imagery),
  ...(segment?.evidence.danmaku_examples ?? []),
  ...extra,
]);

const mediaFromPayload = (payload?: FridayPayload | MomentPayload): MomentMedia[] => {
  const media = payload?.media;
  if (!Array.isArray(media)) return [];
  return media.filter((item): item is MomentMedia => Boolean(item) && typeof item === 'object' && !Array.isArray(item));
};

const buildMomentPayload = (
  seed: FridaySegment | undefined,
  selectedTags: string[],
  customMeme: string[],
  media: MomentMedia[],
  existing?: MomentPayload,
): MomentPayload => ({
  ...(seed?.payload ?? {}),
  ...(existing ?? {}),
  meme: unique([...segmentMeme(seed), ...stringArray(existing?.meme), ...customMeme]),
  media,
  selected_tags: selectedTags,
});

const toSurfaceData = (moment: Moment | undefined, segment: FridaySegment | undefined, fallbackId: string): MomentSurfaceData => {
  const tagOptions = tagOptionsFromSegment(segment, [...(moment?.tags ?? []), ...stringArray(moment?.payload?.meme)]);
  const tags = moment ? moment.tags.slice(0, 5) : tagOptions.slice(0, 5);
  const media = moment ? mediaFromPayload(moment.payload) : mediaFromPayload(segment?.payload);
  const content = moment ? moment.note : segment?.content || '这一刻值得记住。';
  const surface: MomentSurfaceData = { id: moment?.id ?? fallbackId, content, tags, tagOptions, media };
  if (moment) {
    surface.momentId = moment.id;
    surface.placeholder = emptyMomentPrompt;
  }
  if (segment) surface.seedSegment = segment;
  return surface;
};

const useResolvedMediaUrl = (item: MomentMedia) => {
  const [resolvedUrl, setResolvedUrl] = useState(item.url);
  useEffect(() => {
    if (item.url) {
      setResolvedUrl(item.url);
      return;
    }
    if (!item.storage_key) {
      setResolvedUrl(undefined);
      return;
    }
    let active = true;
    let objectUrl: string | undefined;
    void loadMediaBlob(item.storage_key).then((blob) => {
      if (!active || !blob) return;
      objectUrl = URL.createObjectURL(blob);
      setResolvedUrl(objectUrl);
    }).catch(() => { if (active) setResolvedUrl(undefined); });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [item.storage_key, item.url]);
  return resolvedUrl;
};

function App() {
  const { view, navigate } = useViewRoute();
  const [track, setTrack] = useState<Track>(defaultTrack);
  const [segments, setSegments] = useState<FridaySegment[]>([]);
  const [segmentError, setSegmentError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(track.duration_s);
  const [isPlaying, setIsPlaying] = useState(false);
  const [toast, setToast] = useState('按空格，记住此刻');
  const [selectedMomentId, setSelectedMomentId] = useState<string | null>(null);
  const [hoveredMomentId, setHoveredMomentId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<EditDraft | null>(null);
  const [deleteWarningOpen, setDeleteWarningOpen] = useState(false);
  const [previewMedia, setPreviewMedia] = useState<MomentMedia | null>(null);
  const [rememberRange, setRememberRange] = useState<RememberRange | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const rememberPressRef = useRef<PressState | null>(null);
  const previewReturnFocusRef = useRef<HTMLElement | null>(null);
  const { analyser, ensureAudioGraph } = useAudioGraph(audioRef);

  const allMoments = useNostalgiaStore((state) => state.moments);
  const storageError = useNostalgiaStore((state) => state.storageError);
  const clearStorageError = useNostalgiaStore((state) => state.clearStorageError);
  const addMoment = useNostalgiaStore((state) => state.addMoment);
  const updateMoment = useNostalgiaStore((state) => state.updateMoment);
  const deleteMoment = useNostalgiaStore((state) => state.deleteMoment);
  const moments = useMemo(() => allMoments.filter((moment) => moment.track_id === track.id), [allMoments, track.id]);

  useEffect(() => {
    const controller = new AbortController();
    setSegmentError(null);
    fetch(track.friday_url, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Friday JSON 请求失败：HTTP ${response.status}`);
        return response.json() as Promise<unknown>;
      })
      .then((data) => setSegments(parseFridaySegments(data)))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setSegments([]);
        setSegmentError(error instanceof Error ? error.message : 'Friday JSON 加载失败。');
      });
    return () => controller.abort();
  }, [track.friday_url]);

  const currentSegment = useMemo(
    () => segments.find((segment) => currentTime >= segment.start && currentTime <= segment.end)
      ?? segments.find((segment) => currentTime < segment.start)
      ?? segments.at(-1),
    [currentTime, segments],
  );

  const activeMoments = useMemo(
    () => moments.filter((moment) => moment.allow_recall && currentTime >= moment.start_s - 3 && currentTime <= moment.end_s),
    [currentTime, moments],
  );

  const selectedMoment = moments.find((moment) => moment.id === selectedMomentId) ?? activeMoments[0];
  const audioTime = useCallback(() => audioRef.current?.currentTime ?? currentTime, [currentTime]);
  const clampTime = useCallback((value: number) => Math.min(duration || track.duration_s, Math.max(0, value)), [duration, track.duration_s]);
  const segmentAt = useCallback((time: number) => segments.find((segment) => time >= segment.start && time <= segment.end), [segments]);
  const segmentForMoment = useCallback((moment?: Moment) => {
    if (!moment?.public_segment_id) return undefined;
    return segments.find((segment, index) => segmentId(track.id, segment, index) === moment.public_segment_id);
  }, [segments, track.id]);

  const openMomentEditor = useCallback((moment: Moment, seed?: FridaySegment) => {
    const surface = toSurfaceData(moment, seed, moment.id);
    setDeleteWarningOpen(false);
    setEditDraft({
      surfaceId: surface.id,
      momentId: moment.id,
      seedSegment: surface.seedSegment,
      content: surface.content,
      selectedTags: moment.tags.slice(0, 5),
      customMeme: [],
      tagInput: '',
      media: surface.media,
      initialMediaKeys: mediaKeys(surface.media),
    });
  }, []);

  const createMomentFromSeed = useCallback((
    seed: FridaySegment | undefined,
    content: string,
    tags?: string[],
    payload?: MomentPayload,
    range?: { start: number; end: number },
  ) => {
    const fallbackTime = audioTime();
    const normalizedStart = range ? clampTime(Math.min(range.start, range.end)) : undefined;
    const normalizedEnd = range ? clampTime(Math.max(range.start, range.end)) : undefined;
    const rangeStart = normalizedStart ?? seed?.start ?? Math.max(0, fallbackTime - 5);
    const rangeEnd = normalizedEnd !== undefined
      ? Math.max(normalizedEnd, rangeStart + 0.35)
      : seed?.end ?? Math.min(duration || track.duration_s, fallbackTime + 5);
    const middle = (rangeStart + rangeEnd) / 2;
    const anchorTime = seed?.peak_t && seed.peak_t >= rangeStart && seed.peak_t <= rangeEnd
      ? seed.peak_t
      : range ? middle : seed?.peak_t ?? fallbackTime;
    const seedIndex = Math.max(0, segments.findIndex((segment) => segment === seed));
    const nextTags = tags ?? tagOptionsFromSegment(seed).slice(0, 5);
    const moment = addMoment({
      track_id: track.id,
      timestamp_s: anchorTime,
      start_s: rangeStart,
      end_s: rangeEnd,
      public_segment_id: seed ? segmentId(track.id, seed, seedIndex) : undefined,
      note: content,
      mood: unique([...stringArray(seed?.payload?.mood), ...(seed?.function ?? [])]).slice(0, 4),
      tags: nextTags,
      payload: payload ?? buildMomentPayload(seed, nextTags, [], mediaFromPayload(seed?.payload)),
    });
    setSelectedMomentId(moment.id);
    return moment;
  }, [addMoment, audioTime, clampTime, duration, segments, track.duration_s, track.id]);

  const recordMoment = useCallback(() => {
    const timestamp = audioTime();
    const seed = segmentAt(timestamp) ?? currentSegment;
    const moment = createMomentFromSeed(seed, '', [], buildMomentPayload(seed, [], [], []), {
      start: Math.max(0, timestamp - 5),
      end: Math.min(duration || track.duration_s, timestamp + 5),
    });
    setToast('已创建空白 Moment，写下这一刻你想起了什么');
    openMomentEditor(moment, seed);
  }, [audioTime, createMomentFromSeed, currentSegment, duration, openMomentEditor, segmentAt, track.duration_s]);

  const recordMomentRange = useCallback((start: number, end: number) => {
    const rangeStart = clampTime(Math.min(start, end));
    const rangeEnd = clampTime(Math.max(start, end));
    const middle = (rangeStart + rangeEnd) / 2;
    const seed = segmentAt(middle) ?? segmentAt(rangeStart) ?? currentSegment;
    const moment = createMomentFromSeed(seed, '', [], buildMomentPayload(seed, [], [], []), { start: rangeStart, end: rangeEnd });
    setToast(`已创建空白区间 Moment：${formatTime(moment.start_s)} - ${formatTime(moment.end_s)}`);
    openMomentEditor(moment, seed);
  }, [clampTime, createMomentFromSeed, currentSegment, openMomentEditor, segmentAt]);

  const pressEndTime = useCallback((press: PressState) => {
    const liveTime = audioTime();
    if (Math.abs(liveTime - press.startTime) > 0.12) return clampTime(liveTime);
    return clampTime(press.startTime + (performance.now() - press.startedAtMs) / 1000);
  }, [audioTime, clampTime]);

  const beginRememberPress = useCallback(() => {
    if (editDraft || rememberPressRef.current) return;
    const startTime = clampTime(audioTime());
    const press: PressState = {
      startTime,
      startedAtMs: performance.now(),
      long: false,
      timer: window.setTimeout(() => {
        const currentPress = rememberPressRef.current;
        if (!currentPress) return;
        currentPress.long = true;
        setRememberRange({ start: startTime, end: startTime, active: true });
        setToast('继续按住选择区间，松开保存');
      }, 420),
    };
    rememberPressRef.current = press;
  }, [audioTime, clampTime, editDraft]);

  const finishRememberPress = useCallback(() => {
    const press = rememberPressRef.current;
    if (!press) return;
    window.clearTimeout(press.timer);
    const endTime = pressEndTime(press);
    const isLongRange = press.long || Math.abs(endTime - press.startTime) >= 0.8;
    rememberPressRef.current = null;
    setRememberRange(null);
    if (isLongRange) recordMomentRange(press.startTime, endTime);
    else recordMoment();
  }, [pressEndTime, recordMoment, recordMomentRange]);

  const cancelRememberPress = useCallback(() => {
    const press = rememberPressRef.current;
    if (press) window.clearTimeout(press.timer);
    rememberPressRef.current = null;
    setRememberRange(null);
  }, []);

  useRememberShortcut({ disabled: Boolean(editDraft), onStart: beginRememberPress, onEnd: finishRememberPress, onCancel: cancelRememberPress });

  useEffect(() => {
    if (!rememberRange?.active) return;
    let frame = 0;
    const tick = () => {
      const press = rememberPressRef.current;
      if (press?.long) setRememberRange((range) => range ? { ...range, end: pressEndTime(press) } : range);
      frame = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, [pressEndTime, rememberRange?.active]);

  const startEdit = useCallback((surface: MomentSurfaceData) => {
    setDeleteWarningOpen(false);
    setEditDraft({
      surfaceId: surface.id,
      momentId: surface.momentId,
      seedSegment: surface.seedSegment,
      content: surface.content,
      selectedTags: surface.tags,
      customMeme: [],
      tagInput: '',
      media: surface.media,
      initialMediaKeys: mediaKeys(surface.media),
    });
  }, []);

  const toggleDraftTag = useCallback((tag: string) => {
    setEditDraft((draft) => {
      if (!draft) return draft;
      const exists = draft.selectedTags.includes(tag);
      return { ...draft, selectedTags: exists ? draft.selectedTags.filter((item) => item !== tag) : unique([...draft.selectedTags, tag]) };
    });
  }, []);

  const addCustomTag = useCallback(() => {
    setEditDraft((draft) => {
      if (!draft) return draft;
      const tag = draft.tagInput.trim();
      if (!tag) return draft;
      return { ...draft, selectedTags: unique([...draft.selectedTags, tag]), customMeme: unique([...draft.customMeme, tag]), tagInput: '' };
    });
  }, []);

  const addMediaFiles = useCallback(async (files: FileList | null) => {
    if (!files?.length) return;
    try {
      const uploaded = await Promise.all(Array.from(files).map(saveMediaFile));
      setEditDraft((draft) => draft ? { ...draft, media: [...draft.media, ...uploaded] } : draft);
      setToast(`已把 ${uploaded.length} 个媒体文件保存到浏览器 IndexedDB`);
    } catch (error) {
      setToast(error instanceof Error ? error.message : '媒体文件保存失败。');
    }
  }, []);

  const removeMedia = useCallback((index: number) => {
    setEditDraft((draft) => draft ? { ...draft, media: draft.media.filter((_, mediaIndex) => mediaIndex !== index) } : draft);
  }, []);

  const discardAddedDraftMedia = useCallback((draft: EditDraft) => {
    const addedKeys = mediaKeys(draft.media).filter((key) => !draft.initialMediaKeys.includes(key));
    void Promise.allSettled(addedKeys.map(deleteMediaFile));
  }, []);

  const cancelEdit = useCallback(() => {
    if (editDraft) discardAddedDraftMedia(editDraft);
    setDeleteWarningOpen(false);
    setEditDraft(null);
  }, [discardAddedDraftMedia, editDraft]);

  const saveEdit = useCallback(() => {
    if (!editDraft) return;
    const content = editDraft.content.trim();
    if (!content) {
      setToast('先写一句这一刻让你想起了什么，或点取消保留空白 Moment');
      return;
    }
    const existingMoment = editDraft.momentId ? moments.find((moment) => moment.id === editDraft.momentId) : undefined;
    const seed = editDraft.seedSegment ?? currentSegment;
    const payload = buildMomentPayload(seed, editDraft.selectedTags, editDraft.customMeme, editDraft.media, existingMoment?.payload);
    const retainedKeys = mediaKeys(editDraft.media);
    const removedKeys = editDraft.initialMediaKeys.filter((key) => !retainedKeys.includes(key));
    void Promise.allSettled(removedKeys.map(deleteMediaFile));

    if (editDraft.momentId) {
      updateMoment(editDraft.momentId, { note: content, tags: editDraft.selectedTags, payload });
      setSelectedMomentId(editDraft.momentId);
      setToast('已保存修改');
    } else {
      const moment = createMomentFromSeed(seed, content, editDraft.selectedTags, payload);
      setToast(`已保存 ${formatTime(moment.timestamp_s)}`);
    }
    setDeleteWarningOpen(false);
    setEditDraft(null);
  }, [createMomentFromSeed, currentSegment, editDraft, moments, updateMoment]);

  const requestDeleteMoment = useCallback(() => {
    if (!editDraft?.momentId) return;
    audioRef.current?.pause();
    setIsPlaying(false);
    setDeleteWarningOpen(true);
    setToast('音乐已暂停，请确认是否删除这个 Moment');
  }, [editDraft?.momentId]);

  const confirmDeleteMoment = useCallback(() => {
    if (!editDraft?.momentId) return;
    const existing = moments.find((moment) => moment.id === editDraft.momentId);
    const keys = mediaKeys(mediaFromPayload(existing?.payload));
    void Promise.allSettled(keys.map(deleteMediaFile));
    deleteMoment(editDraft.momentId);
    if (selectedMomentId === editDraft.momentId) setSelectedMomentId(null);
    setDeleteWarningOpen(false);
    setEditDraft(null);
    setToast('已删除 Moment');
  }, [deleteMoment, editDraft?.momentId, moments, selectedMomentId]);

  const togglePlay = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return;
    try {
      if (audio.paused) {
        await ensureAudioGraph();
        await audio.play();
      } else {
        audio.pause();
      }
    } catch (error) {
      setToast(error instanceof Error ? error.message : '无法播放音频。');
    }
  }, [ensureAudioGraph]);

  const seek = useCallback((time: number) => {
    const next = clampTime(time);
    if (audioRef.current) audioRef.current.currentTime = next;
    setCurrentTime(next);
  }, [clampTime]);

  const openMomentFromAnchor = useCallback((moment: Moment) => {
    seek(moment.timestamp_s);
    setSelectedMomentId(moment.id);
    openMomentEditor(moment, segmentForMoment(moment));
  }, [openMomentEditor, seek, segmentForMoment]);

  const exportCurrent = useCallback(() => {
    downloadJson(`${track.id}-memory.json`, createFridayExport(track, moments, segments));
  }, [moments, segments, track]);

  const chooseTrack = useCallback((nextTrack: Track) => {
    audioRef.current?.pause();
    setTrack(nextTrack);
    setCurrentTime(0);
    setDuration(nextTrack.duration_s);
    setIsPlaying(false);
    setSelectedMomentId(null);
    setHoveredMomentId(null);
    setEditDraft(null);
    setDeleteWarningOpen(false);
    setPreviewMedia(null);
    setRememberRange(null);
    cancelRememberPress();
    navigate('player');
  }, [cancelRememberPress, navigate]);

  const chooseAdjacentTrack = useCallback((direction: -1 | 1) => {
    const currentIndex = tracks.findIndex((item) => item.id === track.id);
    const nextIndex = (currentIndex + direction + tracks.length) % tracks.length;
    const nextTrack = tracks[nextIndex];
    if (nextTrack) chooseTrack(nextTrack);
  }, [chooseTrack, track.id]);

  const openPreview = useCallback((item: MomentMedia, trigger: HTMLElement) => {
    previewReturnFocusRef.current = trigger;
    setPreviewMedia(item);
  }, []);
  const closePreview = useCallback(() => setPreviewMedia(null), []);

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
      <TopBar view={view} onView={navigate} />
      {storageError ? <StatusBanner message={storageError} onDismiss={clearStorageError} /> : null}
      {segmentError ? <StatusBanner message={segmentError} /> : null}
      {view === 'library' ? <Library activeTrack={track} onPick={chooseTrack} /> : null}
      {view === 'settings' ? <Settings /> : null}
      {view === 'player' ? (
        <>
          <HeroBoard
            analyser={analyser}
            seedSegment={currentSegment}
            activeMoments={activeMoments}
            selectedMoment={selectedMoment}
            highlightedMomentId={hoveredMomentId}
            segmentForMoment={segmentForMoment}
            currentTime={currentTime}
            duration={duration}
            isPlaying={isPlaying}
            editDraft={editDraft}
            deleteWarningOpen={deleteWarningOpen}
            onStartEdit={startEdit}
            onEditContent={(content) => setEditDraft((draft) => draft ? { ...draft, content } : draft)}
            onToggleTag={toggleDraftTag}
            onTagInput={(tagInput) => setEditDraft((draft) => draft ? { ...draft, tagInput } : draft)}
            onAddCustomTag={addCustomTag}
            onAddMedia={addMediaFiles}
            onRemoveMedia={removeMedia}
            onRequestDelete={requestDeleteMoment}
            onConfirmDelete={confirmDeleteMoment}
            onCancelDelete={() => setDeleteWarningOpen(false)}
            onSaveEdit={saveEdit}
            onCancelEdit={cancelEdit}
            onPreviewMedia={openPreview}
          />
          <Transport
            currentTime={currentTime}
            duration={duration}
            moments={moments}
            hoveredMomentId={hoveredMomentId}
            rememberRange={rememberRange}
            isPlaying={isPlaying}
            toast={toast}
            onPrevious={() => chooseAdjacentTrack(-1)}
            onNext={() => chooseAdjacentTrack(1)}
            onToggle={togglePlay}
            onSeek={seek}
            onHoverMoment={setHoveredMomentId}
            onOpenMoment={openMomentFromAnchor}
            onRememberStart={beginRememberPress}
            onRememberEnd={finishRememberPress}
            onRememberCancel={cancelRememberPress}
            onExport={exportCurrent}
          />
          <LocalMemoryPanel moments={moments} />
        </>
      ) : null}
      {previewMedia ? (
        <MediaLightbox
          item={previewMedia}
          returnFocus={previewReturnFocusRef.current}
          onClose={closePreview}
        />
      ) : null}
    </div>
  );
}

function StatusBanner({ message, onDismiss }: { message: string; onDismiss?: () => void }) {
  return <aside className="status-banner" role="status"><span>{message}</span>{onDismiss ? <button onClick={onDismiss}>关闭</button> : null}</aside>;
}

function TopBar({ view, onView }: { view: AppView; onView: (view: AppView) => void }) {
  return (
    <header className="topbar">
      <button className="logo" onClick={() => onView('player')}>
        <span className="wave-mark"><i /><i /><i /><i /></span><strong>MilitAIre Nostalgia</strong><em>Beta</em>
      </button>
      <nav aria-label="Primary navigation">
        <button className={view === 'library' ? 'active' : ''} onClick={() => onView('library')}>Library</button>
        <button className={view === 'settings' ? 'active' : ''} onClick={() => onView('settings')}>Settings</button>
        <a className="avatar github-link" href={repoUrl} target="_blank" rel="noreferrer" aria-label="Open GitHub repository">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 .7a11.3 11.3 0 0 0-3.6 22c.57.1.78-.25.78-.55v-2.1c-3.18.7-3.85-1.36-3.85-1.36-.52-1.32-1.27-1.67-1.27-1.67-1.04-.72.08-.7.08-.7 1.15.08 1.76 1.19 1.76 1.19 1.02 1.75 2.68 1.25 3.33.95.1-.74.4-1.25.72-1.54-2.54-.29-5.22-1.27-5.22-5.65 0-1.25.45-2.27 1.18-3.07-.12-.29-.51-1.46.11-3.03 0 0 .96-.31 3.14 1.17a10.9 10.9 0 0 1 5.72 0c2.18-1.48 3.14-1.17 3.14-1.17.62 1.57.23 2.74.11 3.03.73.8 1.18 1.82 1.18 3.07 0 4.39-2.68 5.36-5.23 5.65.41.35.77 1.04.77 2.1v3.12c0 .3.21.66.79.55A11.3 11.3 0 0 0 12 .7Z" /></svg>
        </a>
      </nav>
    </header>
  );
}

function MediaLightbox({ item, returnFocus, onClose }: { item: MomentMedia; returnFocus: HTMLElement | null; onClose: () => void }) {
  const panelRef = useRef<HTMLElement | null>(null);
  const resolvedUrl = useResolvedMediaUrl(item);
  const label = item.caption ?? item.type;

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const keyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key !== 'Tab' || !panelRef.current) return;
      const focusable = Array.from(panelRef.current.querySelectorAll<HTMLElement>('button, a[href], audio[controls], video[controls], [tabindex]:not([tabindex="-1"])'));
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', keyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', keyDown);
      returnFocus?.focus();
    };
  }, [onClose, returnFocus]);

  return (
    <div className="media-zoom-overlay" role="presentation" onClick={onClose}>
      <section ref={panelRef} className="media-zoom-panel" role="dialog" aria-modal="true" aria-label={label} onClick={(event) => event.stopPropagation()}>
        <button className="media-zoom-close" onClick={onClose} autoFocus>关闭</button>
        <div className="media-zoom-content">
          {item.type === 'image' && resolvedUrl ? <img src={resolvedUrl} alt={label} /> : null}
          {item.type === 'video' && resolvedUrl ? <video src={resolvedUrl} controls autoPlay playsInline /> : null}
          {item.type === 'audio' && resolvedUrl ? <audio src={resolvedUrl} controls autoPlay /> : null}
          {resolvedUrl && !['image', 'video', 'audio'].includes(item.type) ? <a href={resolvedUrl} target="_blank" rel="noreferrer">打开媒体文件</a> : null}
          {!resolvedUrl ? <p>媒体文件不可用，可能已被浏览器清理。</p> : null}
        </div>
        {label ? <p className="media-zoom-caption">{label}</p> : null}
      </section>
    </div>
  );
}

function HeroBoard({
  analyser,
  seedSegment,
  activeMoments,
  selectedMoment,
  highlightedMomentId,
  segmentForMoment,
  currentTime,
  duration,
  isPlaying,
  editDraft,
  deleteWarningOpen,
  onStartEdit,
  onEditContent,
  onToggleTag,
  onTagInput,
  onAddCustomTag,
  onAddMedia,
  onRemoveMedia,
  onRequestDelete,
  onConfirmDelete,
  onCancelDelete,
  onSaveEdit,
  onCancelEdit,
  onPreviewMedia,
}: {
  analyser: AnalyserNode | null;
  seedSegment?: FridaySegment;
  activeMoments: Moment[];
  selectedMoment?: Moment;
  highlightedMomentId: string | null;
  segmentForMoment: (moment?: Moment) => FridaySegment | undefined;
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  editDraft: EditDraft | null;
  deleteWarningOpen: boolean;
  onStartEdit: (surface: MomentSurfaceData) => void;
  onEditContent: (content: string) => void;
  onToggleTag: (tag: string) => void;
  onTagInput: (tag: string) => void;
  onAddCustomTag: () => void;
  onAddMedia: (files: FileList | null) => void;
  onRemoveMedia: (index: number) => void;
  onRequestDelete: () => void;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onPreviewMedia: (item: MomentMedia, trigger: HTMLElement) => void;
}) {
  const visibleMoments = activeMoments.length ? activeMoments : selectedMoment ? [selectedMoment] : [];
  const mainMoment = visibleMoments[0];
  const mainSegment = mainMoment ? segmentForMoment(mainMoment) : seedSegment;
  const mainSurface = toSurfaceData(mainMoment, mainSegment, 'seed');
  const sideSurfaces = visibleMoments.slice(1, 5).map((moment) => toSurfaceData(moment, segmentForMoment(moment), moment.id));
  const commonProps = { editDraft, deleteWarningOpen, highlightedMomentId, onStartEdit, onEditContent, onToggleTag, onTagInput, onAddCustomTag, onAddMedia, onRemoveMedia, onRequestDelete, onConfirmDelete, onCancelDelete, onSaveEdit, onCancelEdit, onPreviewMedia };
  return (
    <section className="hero-board card-shell clean-board">
      <Spectrogram analyser={analyser} isPlaying={isPlaying} />
      <div className="bulletin-layer">
        <MomentSurface surface={mainSurface} size="primary" {...commonProps} />
        {sideSurfaces.map((surface, index) => <MomentSurface key={surface.id} surface={surface} size="mini" index={index} {...commonProps} />)}
      </div>
      <div className="timeline-spike" style={{ left: `${Math.min(88, Math.max(12, (currentTime / Math.max(duration, 1)) * 100))}%` }} />
    </section>
  );
}

function MediaPreview({ item, onPreview }: { item: MomentMedia; onPreview: (item: MomentMedia, trigger: HTMLElement) => void }) {
  const resolvedUrl = useResolvedMediaUrl(item);
  const label = item.caption ?? item.type;
  const openPreview = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    onPreview(item, event.currentTarget);
  };
  if (item.type === 'image' && resolvedUrl) return <button className="media-preview image-preview" type="button" onClick={openPreview}><img src={resolvedUrl} alt={label} /><span>{label}</span></button>;
  if (item.type === 'audio' && resolvedUrl) return <div className="media-preview audio-preview" onClick={(event) => event.stopPropagation()}><span>{label}</span><audio src={resolvedUrl} controls /></div>;
  if (item.type === 'video' && resolvedUrl) return <button className="media-preview video-preview" type="button" onClick={openPreview}><video src={resolvedUrl} muted playsInline /><span>{label}</span></button>;
  if (resolvedUrl) return <a className="media-preview file-preview" href={resolvedUrl} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}>{label}</a>;
  return <span className="media-preview file-preview">{label} · 文件不可用</span>;
}

function MomentSurface({
  surface,
  size,
  index = 0,
  editDraft,
  deleteWarningOpen,
  highlightedMomentId,
  onStartEdit,
  onEditContent,
  onToggleTag,
  onTagInput,
  onAddCustomTag,
  onAddMedia,
  onRemoveMedia,
  onRequestDelete,
  onConfirmDelete,
  onCancelDelete,
  onSaveEdit,
  onCancelEdit,
  onPreviewMedia,
}: {
  surface: MomentSurfaceData;
  size: 'primary' | 'mini';
  index?: number;
  editDraft: EditDraft | null;
  deleteWarningOpen: boolean;
  highlightedMomentId: string | null;
  onStartEdit: (surface: MomentSurfaceData) => void;
  onEditContent: (content: string) => void;
  onToggleTag: (tag: string) => void;
  onTagInput: (tag: string) => void;
  onAddCustomTag: () => void;
  onAddMedia: (files: FileList | null) => void;
  onRemoveMedia: (index: number) => void;
  onRequestDelete: () => void;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onPreviewMedia: (item: MomentMedia, trigger: HTMLElement) => void;
}) {
  const isEditing = editDraft?.surfaceId === surface.id;
  const canDelete = Boolean(editDraft?.momentId);
  const isHighlighted = Boolean(surface.momentId && highlightedMomentId === surface.momentId);
  const displayedContent = surface.content || surface.placeholder || '这一刻值得记住。';
  const className = `${size === 'primary' ? 'bulletin-card' : `recall-card recall-${index % 4}`} ${isEditing ? 'editing-surface' : ''} ${isHighlighted ? 'is-anchor-linked' : ''}`;
  return (
    <article
      className={className}
      onClick={() => !isEditing && onStartEdit(surface)}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (!isEditing && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault();
          onStartEdit(surface);
        }
      }}
    >
      {isEditing ? (
        <div className="surface-editor" onClick={(event) => event.stopPropagation()}>
          {canDelete ? <button className="delete-moment-button" type="button" onClick={onRequestDelete}>删除</button> : null}
          <textarea value={editDraft.content} placeholder={surface.placeholder ?? emptyMomentPrompt} onChange={(event) => onEditContent(event.target.value)} autoFocus />
          <p className="moment-edit-hint">不用总结歌曲，写这一刻让你想到的人、画面、场景或一句话。</p>
          <details className="tag-picker" open>
            <summary>相关标签</summary>
            <div className="tag-options">{surface.tagOptions.map((tag) => <label key={tag}><input type="checkbox" checked={editDraft.selectedTags.includes(tag)} onChange={() => onToggleTag(tag)} />{tag}</label>)}</div>
          </details>
          <div className="custom-tag-row">
            <input value={editDraft.tagInput} placeholder="手动输入新标签" onChange={(event) => onTagInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); onAddCustomTag(); } }} />
            <button type="button" onClick={onAddCustomTag}>添加</button>
          </div>
          <div className="media-editor">
            <label>上传 media<input type="file" accept="image/*,audio/*,video/*" multiple onChange={(event) => { void onAddMedia(event.target.files); event.currentTarget.value = ''; }} /></label>
            {editDraft.media.length ? <div className="media-list">{editDraft.media.map((item, mediaIndex) => <span key={`${item.storage_key ?? item.url ?? item.caption ?? item.type}-${mediaIndex}`}>{item.type}{item.caption ? ` · ${item.caption}` : ''}<button type="button" aria-label={`移除 ${item.caption ?? item.type}`} onClick={() => onRemoveMedia(mediaIndex)}>×</button></span>)}</div> : null}
          </div>
          {deleteWarningOpen && canDelete ? <div className="delete-warning"><strong>删除这个 Moment？</strong><span>删除后文本索引和浏览器中的媒体 Blob 都会被移除。</span><div><button type="button" className="danger-confirm" onClick={onConfirmDelete}>确认删除</button><button type="button" onClick={onCancelDelete}>保留</button></div></div> : null}
          <div className="surface-actions"><button className="remember-action" onClick={onSaveEdit}>保存</button><button onClick={onCancelEdit}>取消</button></div>
        </div>
      ) : (
        <>
          <h2 className={!surface.content ? 'empty-moment-copy' : undefined}>{displayedContent}</h2>
          {surface.tags.length ? <div className="tag-row moment-hooks">{surface.tags.slice(0, 5).map((item) => <span key={item}>{item}</span>)}</div> : null}
          {surface.media.length ? <div className="media-previews">{surface.media.slice(0, size === 'primary' ? 3 : 1).map((item, mediaIndex) => <MediaPreview key={`${item.storage_key ?? item.url ?? item.caption ?? item.type}-${mediaIndex}`} item={item} onPreview={onPreviewMedia} />)}</div> : null}
        </>
      )}
    </article>
  );
}

function Spectrogram({ analyser, isPlaying }: { analyser: AnalyserNode | null; isPlaying: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let frame = 0;
    const buffer = analyser ? new Uint8Array(analyser.frequencyBinCount) : null;

    const prepare = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const width = Math.max(1, Math.floor(rect.width * dpr));
      const height = Math.max(1, Math.floor(rect.height * dpr));
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;
      return { context: canvas.getContext('2d'), width, height };
    };

    const drawIdle = () => {
      const { context, width, height } = prepare();
      if (!context) return;
      context.clearRect(0, 0, width, height);
      context.fillStyle = 'rgba(153, 162, 91, 0.08)';
      for (let index = 0; index < 90; index += 1) context.fillRect((index / 90) * width, height - (8 + ((index * 17) % 23)), Math.max(2, width / 120), 8 + ((index * 17) % 23));
    };

    const drawPlaying = () => {
      const { context, width, height } = prepare();
      if (!context || !analyser || !buffer) return;
      context.clearRect(0, 0, width, height);
      analyser.getByteFrequencyData(buffer);
      const columns = 132;
      const barWidth = width / columns;
      for (let column = 0; column < columns; column += 1) {
        const start = Math.floor((column / columns) ** 1.55 * buffer.length);
        const end = Math.max(start + 1, Math.floor(((column + 1) / columns) ** 1.55 * buffer.length));
        let sum = 0;
        for (let index = start; index < end; index += 1) sum += buffer[index] ?? 0;
        const normalized = Math.min(1, (sum / Math.max(1, end - start)) / 245);
        context.fillStyle = `rgba(153, 162, 91, ${0.1 + normalized * 0.56})`;
        context.fillRect(column * barWidth, height - Math.max(2, normalized * height * 0.86), Math.max(1, barWidth - 2), Math.max(2, normalized * height * 0.86));
      }
      frame = requestAnimationFrame(drawPlaying);
    };

    if (isPlaying && analyser) drawPlaying();
    else drawIdle();
    const observer = new ResizeObserver(() => { if (!isPlaying) drawIdle(); });
    observer.observe(canvas);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); };
  }, [analyser, isPlaying]);
  return <canvas className="spectrogram" ref={canvasRef} aria-label="真实音频频谱图" />;
}

function Transport({
  currentTime,
  duration,
  moments,
  hoveredMomentId,
  rememberRange,
  isPlaying,
  toast,
  onPrevious,
  onNext,
  onToggle,
  onSeek,
  onHoverMoment,
  onOpenMoment,
  onRememberStart,
  onRememberEnd,
  onRememberCancel,
  onExport,
}: {
  currentTime: number;
  duration: number;
  moments: Moment[];
  hoveredMomentId: string | null;
  rememberRange: RememberRange | null;
  isPlaying: boolean;
  toast: string;
  onPrevious: () => void;
  onNext: () => void;
  onToggle: () => void;
  onSeek: (time: number) => void;
  onHoverMoment: (id: string | null) => void;
  onOpenMoment: (moment: Moment) => void;
  onRememberStart: () => void;
  onRememberEnd: () => void;
  onRememberCancel: () => void;
  onExport: () => void;
}) {
  const rangeStart = rememberRange ? Math.min(rememberRange.start, rememberRange.end) : 0;
  const rangeEnd = rememberRange ? Math.max(rememberRange.start, rememberRange.end) : 0;
  const seekFromPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('.moment-dot')) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = rect.width ? Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)) : 0;
    onSeek(ratio * Math.max(duration, 1));
  };
  const progressPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('.moment-dot')) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    seekFromPointer(event);
  };
  return (
    <section className="transport-card card-shell">
      <div className="shortcut"><kbd>Space</kbd><span>{toast}</span></div>
      <div className="progress-area">
        <span>{formatTime(currentTime)}</span>
        <div className="progress-line" onPointerDown={progressPointerDown} onPointerMove={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) seekFromPointer(event); }} onPointerUp={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}>
          <input aria-label="播放进度" min={0} max={duration || 1} step={0.1} value={currentTime} type="range" onChange={(event) => onSeek(Number(event.target.value))} />
          <div className="progress-fill" style={{ width: `${(currentTime / Math.max(duration, 1)) * 100}%` }} />
          {rememberRange ? <div className="hold-range" style={{ left: `${(rangeStart / Math.max(duration, 1)) * 100}%`, width: `${Math.max(0.6, ((rangeEnd - rangeStart) / Math.max(duration, 1)) * 100)}%` }} /> : null}
          {moments.map((moment, index) => (
            <button
              key={moment.id}
              className={`moment-dot ${hoveredMomentId === moment.id ? 'is-anchor-hovered' : ''}`}
              style={{ left: `${(moment.timestamp_s / Math.max(duration, 1)) * 100}%` }}
              title={`Moment ${index + 1} · ${formatTime(moment.timestamp_s)}`}
              aria-label={`打开第 ${index + 1} 个 Moment`}
              onPointerDown={(event) => event.stopPropagation()}
              onPointerEnter={() => onHoverMoment(moment.id)}
              onPointerLeave={() => onHoverMoment(null)}
              onFocus={() => onHoverMoment(moment.id)}
              onBlur={() => onHoverMoment(null)}
              onClick={() => onOpenMoment(moment)}
            >{index + 1}</button>
          ))}
        </div>
        <span>{formatTime(duration)}</span>
      </div>
      <div className="controls">
        <button title="previous" aria-label="上一首" onClick={onPrevious}>◀</button>
        <button className="play" aria-label={isPlaying ? '暂停' : '播放'} onClick={onToggle}>{isPlaying ? 'Ⅱ' : '▶'}</button>
        <button title="next" aria-label="下一首" onClick={onNext}>▶</button>
      </div>
      <div className="transport-actions">
        <button
          className={`remember-action hold-remember ${rememberRange?.active ? 'is-holding' : ''}`}
          onPointerDown={(event) => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); onRememberStart(); }}
          onPointerUp={(event) => { event.preventDefault(); if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); onRememberEnd(); }}
          onPointerCancel={onRememberCancel}
        >记住此刻</button>
        <button className="export-mini" onClick={onExport}>导出 JSON</button>
      </div>
    </section>
  );
}

function LocalMemoryPanel({ moments }: { moments: Moment[] }) {
  return <section className="response-grid feedback-only"><article className="letter-card card-shell wide-letter"><div className="panel-title"><h2>本地记忆库</h2><span>{moments.length} 个 Moment</span></div><p>我不解释你的记忆，只帮你把它留下来。</p><p>文本和标签保存在 localStorage，媒体 Blob 保存在 IndexedDB。数据默认不会上传，但浏览器本地存储不等于加密保险箱，请勿保存高度敏感内容。</p></article></section>;
}

function Library({ activeTrack, onPick }: { activeTrack: Track; onPick: (track: Track) => void }) {
  return <section className="library-page card-shell"><h1>Library</h1><p>当前 demo 使用 nilimaoma.mp3 + nilimaoma.json。新增样例时，给每首歌各放一个 mp3 和一个 Friday segment JSON。</p><div className="library-list">{tracks.map((item) => <button key={item.id} className={item.id === activeTrack.id ? 'chosen' : ''} onClick={() => onPick(item)}><span>{item.cover}</span><strong>{item.title}</strong><small>{item.description}</small></button>)}</div></section>;
}

function Settings() {
  return <section className="settings-page card-shell"><h1>Settings</h1><p>这版只做本地音乐记忆沉淀，不会自动上传。清理浏览器站点数据会删除本地 Moment 和媒体，请定期导出。</p><label>Text storage<input value="Browser localStorage · versioned schema" readOnly /></label><label>Media storage<input value="Browser IndexedDB · max 25 MB per file" readOnly /></label><label>Export<input value="Friday-compatible JSON metadata package" readOnly /></label><label>Privacy<input value="Local first, not end-to-end encrypted" readOnly /></label></section>;
}

export default App;
