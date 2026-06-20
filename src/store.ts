import { create } from 'zustand';
import type { CompanionResponse, Moment, MomentPayload, RecallStyle } from './types';

const MOMENT_KEY = 'militai-nostalgia/moments/v1';
const RESPONSE_KEY = 'militai-nostalgia/responses/v1';

function readStored<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeStored<T>(key: string, value: T) {
  window.localStorage.setItem(key, JSON.stringify(value));
}

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
  responses: CompanionResponse[];
  addMoment: (input: MomentInput) => Moment;
  updateMoment: (id: string, patch: MomentPatch) => void;
  deleteMoment: (id: string) => void;
  addResponse: (response: Omit<CompanionResponse, 'id' | 'created_at'>) => void;
  clearTrack: (trackId: string) => void;
};

export const useNostalgiaStore = create<NostalgiaStore>((set, get) => ({
  moments: typeof window === 'undefined' ? [] : readStored<Moment[]>(MOMENT_KEY, []),
  responses: typeof window === 'undefined' ? [] : readStored<CompanionResponse[]>(RESPONSE_KEY, []),

  addMoment: (input) => {
    const now = new Date().toISOString();
    const duplicate = get().moments.find(
      (moment) => moment.track_id === input.track_id && Math.abs(moment.timestamp_s - input.timestamp_s) <= 2,
    );

    if (duplicate) {
      if (input.note || input.tags || input.payload) {
        const patch: MomentPatch = {
          note: input.note ?? duplicate.note,
          tags: input.tags ?? duplicate.tags,
          payload: input.payload ? { ...(duplicate.payload ?? {}), ...input.payload } : duplicate.payload,
        };
        get().updateMoment(duplicate.id, patch);
        return { ...duplicate, ...patch, updated_at: new Date().toISOString() };
      }
      return duplicate;
    }

    const moment: Moment = {
      id: `mom_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
      track_id: input.track_id,
      public_segment_id: input.public_segment_id,
      timestamp_s: input.timestamp_s,
      start_s: Math.max(0, input.start_s ?? input.timestamp_s - 5),
      end_s: input.end_s ?? input.timestamp_s + 5,
      note: input.note ?? '',
      mood: input.mood ?? [],
      tags: input.tags ?? [],
      payload: input.payload,
      source: 'user',
      is_private: true,
      allow_recall: true,
      recall_style: 'gentle' as RecallStyle,
      user_confirmed: false,
      created_at: now,
      updated_at: now,
    };

    const next = [moment, ...get().moments];
    writeStored(MOMENT_KEY, next);
    set({ moments: next });
    return moment;
  },

  updateMoment: (id, patch) => {
    const next = get().moments.map((moment) =>
      moment.id === id
        ? { ...moment, ...patch, user_confirmed: true, updated_at: new Date().toISOString() }
        : moment,
    );
    writeStored(MOMENT_KEY, next);
    set({ moments: next });
  },

  deleteMoment: (id) => {
    const next = get().moments.filter((moment) => moment.id !== id);
    writeStored(MOMENT_KEY, next);
    set({ moments: next });
  },

  addResponse: (response) => {
    const next: CompanionResponse[] = [
      { ...response, id: `resp_${Date.now().toString(36)}`, created_at: new Date().toISOString() },
      ...get().responses,
    ];
    writeStored(RESPONSE_KEY, next);
    set({ responses: next });
  },

  clearTrack: (trackId) => {
    const next = get().moments.filter((moment) => moment.track_id !== trackId);
    writeStored(MOMENT_KEY, next);
    set({ moments: next });
  },
}));
