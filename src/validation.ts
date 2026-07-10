import type { FridayPayload, FridaySegment, Moment, MomentMedia, MomentPayload, RecallStyle } from './types';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const asString = (value: unknown, fallback = '') => (typeof value === 'string' ? value : fallback);
const asNumber = (value: unknown, fallback = 0) => (typeof value === 'number' && Number.isFinite(value) ? value : fallback);
const asBoolean = (value: unknown, fallback: boolean) => (typeof value === 'boolean' ? value : fallback);
const asStringArray = (value: unknown) =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

const asRecallStyle = (value: unknown): RecallStyle =>
  value === 'silent' || value === 'explicit' || value === 'gentle' ? value : 'gentle';

const parseMedia = (value: unknown): MomentMedia | null => {
  if (!isRecord(value)) return null;
  const rawType = asString(value.type, 'media');
  const type: MomentMedia['type'] = ['image', 'audio', 'video', 'text', 'link', 'media'].includes(rawType)
    ? (rawType as MomentMedia['type'])
    : 'media';
  const item: MomentMedia = { type };
  if (typeof value.url === 'string') item.url = value.url;
  if (typeof value.storage_key === 'string') item.storage_key = value.storage_key;
  if (typeof value.caption === 'string') item.caption = value.caption;
  if (typeof value.role === 'string') item.role = value.role;
  if (typeof value.source === 'string') item.source = value.source;
  if (typeof value.mime_type === 'string') item.mime_type = value.mime_type;
  if (typeof value.size_bytes === 'number' && Number.isFinite(value.size_bytes)) item.size_bytes = value.size_bytes;
  if (typeof value.start_s === 'number' && Number.isFinite(value.start_s)) item.start_s = value.start_s;
  if (typeof value.end_s === 'number' && Number.isFinite(value.end_s)) item.end_s = value.end_s;
  return item;
};

const parsePayload = (value: unknown): MomentPayload | undefined => {
  if (!isRecord(value)) return undefined;
  const payload: MomentPayload = { ...value };
  if (value.meme !== undefined) payload.meme = asStringArray(value.meme);
  if (value.sensory !== undefined) payload.sensory = asStringArray(value.sensory);
  if (value.imagery !== undefined) payload.imagery = asStringArray(value.imagery);
  if (Array.isArray(value.media)) payload.media = value.media.map(parseMedia).filter((item): item is MomentMedia => Boolean(item));
  return payload;
};

const parseMoment = (value: unknown): Moment | null => {
  if (!isRecord(value)) return null;
  const id = asString(value.id);
  const trackId = asString(value.track_id);
  if (!id || !trackId) return null;

  const timestamp = Math.max(0, asNumber(value.timestamp_s));
  const start = Math.max(0, asNumber(value.start_s, Math.max(0, timestamp - 5)));
  const end = Math.max(start, asNumber(value.end_s, timestamp + 5));
  const createdAt = asString(value.created_at, new Date(0).toISOString());

  const moment: Moment = {
    id,
    track_id: trackId,
    timestamp_s: timestamp,
    start_s: start,
    end_s: end,
    note: asString(value.note),
    mood: asStringArray(value.mood),
    tags: asStringArray(value.tags),
    source: 'user',
    is_private: true,
    allow_recall: asBoolean(value.allow_recall, true),
    recall_style: asRecallStyle(value.recall_style),
    user_confirmed: asBoolean(value.user_confirmed, false),
    created_at: createdAt,
    updated_at: asString(value.updated_at, createdAt),
  };
  if (typeof value.public_segment_id === 'string') moment.public_segment_id = value.public_segment_id;
  const payload = parsePayload(value.payload);
  if (payload) moment.payload = payload;
  return moment;
};

export const parseStoredMoments = (value: unknown): Moment[] => {
  const source = isRecord(value) && Array.isArray(value.moments) ? value.moments : value;
  if (!Array.isArray(source)) return [];
  return source.map(parseMoment).filter((moment): moment is Moment => Boolean(moment));
};

const parseFridaySegment = (value: unknown): FridaySegment | null => {
  if (!isRecord(value)) return null;
  const evidence = isRecord(value.evidence) ? value.evidence : {};
  const crowdSignals = isRecord(evidence.crowd_signals) ? evidence.crowd_signals : {};
  const confidence = isRecord(value.confidence) ? value.confidence : {};
  const start = Math.max(0, asNumber(value.start));
  const end = Math.max(start, asNumber(value.end, start));
  const segment: FridaySegment = {
    start,
    end,
    peak_t: Math.min(end, Math.max(start, asNumber(value.peak_t, (start + end) / 2))),
    source: asString(value.source, 'friday'),
    content: asString(value.content),
    confidence: {
      score: Math.min(1, Math.max(0, asNumber(confidence.score, 0))),
      scope: asString(confidence.scope, 'unknown'),
      meaning: asString(confidence.meaning),
    },
    function: asStringArray(value.function),
    evidence: {
      danmaku_examples: asStringArray(evidence.danmaku_examples),
      crowd_signals: {
        burst: asString(crowdSignals.burst, 'unknown'),
        sync_level: asString(crowdSignals.sync_level, 'unknown'),
        meme: asStringArray(crowdSignals.meme),
      },
    },
  };
  if (typeof value.id === 'string') segment.id = value.id;
  if (isRecord(value.payload)) segment.payload = value.payload as FridayPayload;
  return segment;
};

export const parseFridaySegments = (value: unknown): FridaySegment[] => {
  const source = isRecord(value) && Array.isArray(value.segments) ? value.segments : value;
  if (!Array.isArray(source)) throw new Error('Friday JSON must contain a segment array.');
  const segments = source.map(parseFridaySegment).filter((segment): segment is FridaySegment => Boolean(segment));
  if (!segments.length) throw new Error('Friday JSON contains no valid segments.');
  return segments.sort((a, b) => a.start - b.start);
};
