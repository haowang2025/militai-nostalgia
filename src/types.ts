export type RecallStyle = 'silent' | 'gentle' | 'explicit';

export type FridayPayload = Record<string, unknown>;

export type MomentMedia = {
  type: 'image' | 'audio' | 'video' | 'text' | 'link' | 'media';
  url?: string;
  caption?: string;
  role?: 'memory_hook' | 'evidence' | 'voice_note' | 'reference' | string;
  source?: 'user_upload' | 'friday_seed' | 'generated' | string;
  mime_type?: string;
  start_s?: number;
  end_s?: number;
};

export type MomentPayload = {
  meme?: string[];
  sensory?: string[];
  imagery?: string[];
  media?: MomentMedia[];
  [key: string]: unknown;
};

export type FridaySegment = {
  id?: string;
  start: number;
  end: number;
  peak_t: number;
  source: string;
  content: string;
  confidence: {
    score: number;
    scope: string;
    meaning: string;
  };
  function: string[];
  evidence: {
    danmaku_examples: string[];
    crowd_signals: {
      burst: string;
      sync_level: string;
      meme: string[];
    };
  };
  payload?: FridayPayload;
};

export type Track = {
  id: string;
  title: string;
  artist: string;
  album?: string;
  duration_s: number;
  cover: string;
  audio_url: string;
  friday_url: string;
  mood: string[];
  description: string;
};

export type Moment = {
  id: string;
  track_id: string;
  public_segment_id?: string;
  timestamp_s: number;
  start_s: number;
  end_s: number;
  note: string;
  mood: string[];
  tags: string[];
  payload?: MomentPayload;
  source: 'user';
  is_private: true;
  allow_recall: boolean;
  recall_style: RecallStyle;
  user_confirmed: boolean;
  created_at: string;
  updated_at: string;
};
