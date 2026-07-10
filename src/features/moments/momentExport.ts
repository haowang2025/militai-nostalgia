import type { FridaySegment, Moment, MomentMedia, Track } from '../../types';

const unique = (items: string[]) => Array.from(new Set(items.map((item) => item.trim()).filter(Boolean)));
const stringArray = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
  if (typeof value === 'string' && value.trim()) return [value];
  return [];
};

export const segmentId = (trackId: string, segment: FridaySegment, index: number) =>
  segment.id ?? `seg_${trackId}_${Math.round(segment.start)}_${Math.round(segment.end)}_${index}`;

const segmentMeme = (segment?: FridaySegment) => unique([
  ...(segment?.evidence.crowd_signals.meme ?? []),
  ...stringArray(segment?.payload?.meme),
]);

const exportMedia = (items: MomentMedia[] | undefined) => items?.map((item) => ({
  type: item.type,
  caption: item.caption,
  role: item.role,
  source: item.source,
  mime_type: item.mime_type,
  size_bytes: item.size_bytes,
  url: item.url && !item.url.startsWith('blob:') ? item.url : undefined,
  local_only: Boolean(item.storage_key),
}));

export const createFridayExport = (track: Track, moments: Moment[], segments: FridaySegment[]) => ({
  $schema: 'https://militai.me/schemas/friday-compatible-memory-v1.json',
  version: '1.1.0',
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
      confidence: { score: 1, scope: 'user_record', meaning: '用户主动保存并补写的私人 Moment' },
      function: ['私人 Moment', ...(inherited?.function ?? [])],
      evidence: {
        user_note: moment.note,
        user_selected_mood: moment.mood,
        danmaku_examples: inherited?.evidence.danmaku_examples ?? [],
        crowd_signals: inherited?.evidence.crowd_signals ?? { burst: 'unknown', sync_level: 'unknown', meme: [] },
      },
      payload: {
        ...(inherited?.payload ?? {}),
        ...(moment.payload ?? {}),
        media: exportMedia(moment.payload?.media),
        meme: unique([...segmentMeme(inherited), ...stringArray(moment.payload?.meme), ...moment.tags]),
        mood: moment.mood,
        tags: moment.tags,
        moment_ids: [moment.id],
        seed_from: { source: 'friday', public_segment_id: moment.public_segment_id },
        track: { id: track.id, title: track.title, artist: track.artist },
        privacy: { visibility: 'local_first', exported_by_user: true },
      },
    };
  }),
});

export const downloadJson = (filename: string, payload: unknown) => {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
};
