import { create } from 'zustand';
import type { Moment, MomentPayload, RecallStyle } from './types';
import { parseStoredMoments } from './validation';

const MOMENT_KEY = 'militai-nostalgia/moments/v2';
const LEGACY_MOMENT_KEY = 'militai-nostalgia/moments/v1';
const STORAGE_VERSION = 2;

type StoredEnvelope = {
  version: typeof STORAGE_VERSION;
  moments: Moment[];
};

type MomentInput = {
  track_id: string;
  timestamp_s: number;
  public_segment_id?: string;
  note?: string;
  mood?: string[];
  tags?: string[];
  payload?: MomentPayload;
  start_s?: number;
  end_s?: number;
};

type MomentPatch = Partial<Pick<Moment, 'note' | 'mood' | 'tags' | 'payload' | 'allow_recall' | 'recall_style'>>;

type NostalgiaStore = {
  moments: Moment[];
  storageError: string | null;
  addMoment: (input: MomentInput) => Moment;
  updateMoment: (id: string, patch: MomentPatch) => void;
  deleteMoment: (id: string) => void;
  clearTrack: (trackId: string) => void;
  clearStorageError: () => void;
};

const storageMessage = (error: unknown) => {
  if (error instanceof DOMException && error.name === 'QuotaExceededError') return '本地文本存储空间已满，请先导出或删除部分 Moment。';
  return error instanceof Error ? error.message : '无法写入浏览器本地存储。';
};

const persistMoments = (moments: Moment[]) => {
  if (typeof window === 'undefined') return null;
  try {
    const envelope: StoredEnvelope = { version: STORAGE_VERSION, moments };
    window.localStorage.setItem(MOMENT_KEY, JSON.stringify(envelope));
    return null;
  } catch (error) {
    return storageMessage(error);
  }
};

const readInitialMoments = () => {
  if (typeof window === 'undefined') return [];
  try {
    const currentRaw = window.localStorage.getItem(MOMENT_KEY);
    if (currentRaw) return parseStoredMoments(JSON.parse(currentRaw));

    const legacyRaw = window.localStorage.getItem(LEGACY_MOMENT_KEY);
    if (!legacyRaw) return [];
    const migrated = parseStoredMoments(JSON.parse(legacyRaw));
    if (!persistMoments(migrated)) window.localStorage.removeItem(LEGACY_MOMENT_KEY);
    return migrated;
  } catch {
    return [];
  }
};

const createMomentId = () => typeof crypto.randomUUID === 'function'
  ? `mom_${crypto.randomUUID()}`
  : `mom_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;

export const useNostalgiaStore = create<NostalgiaStore>((set, get) => ({
  moments: readInitialMoments(),
  storageError: null,

  addMoment: (input) => {
    const now = new Date().toISOString();
    const timestamp = Math.max(0, input.timestamp_s);
    const start = Math.max(0, input.start_s ?? timestamp - 5);
    const moment: Moment = {
      id: createMomentId(),
      track_id: input.track_id,
      timestamp_s: timestamp,
      start_s: start,
      end_s: Math.max(start, input.end_s ?? timestamp + 5),
      note: input.note ?? '',
      mood: input.mood ?? [],
      tags: input.tags ?? [],
      source: 'user',
      is_private: true,
      allow_recall: true,
      recall_style: 'gentle' as RecallStyle,
      user_confirmed: false,
      created_at: now,
      updated_at: now,
    };
    if (input.public_segment_id) moment.public_segment_id = input.public_segment_id;
    if (input.payload) moment.payload = input.payload;

    const next = [moment, ...get().moments];
    set({ moments: next, storageError: persistMoments(next) });
    return moment;
  },

  updateMoment: (id, patch) => {
    const next = get().moments.map((moment) =>
      moment.id === id
        ? { ...moment, ...patch, user_confirmed: true, updated_at: new Date().toISOString() }
        : moment,
    );
    set({ moments: next, storageError: persistMoments(next) });
  },

  deleteMoment: (id) => {
    const next = get().moments.filter((moment) => moment.id !== id);
    set({ moments: next, storageError: persistMoments(next) });
  },

  clearTrack: (trackId) => {
    const next = get().moments.filter((moment) => moment.track_id !== trackId);
    set({ moments: next, storageError: persistMoments(next) });
  },

  clearStorageError: () => set({ storageError: null }),
}));
