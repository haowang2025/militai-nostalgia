export type RecallStyle = 'silent' | 'gentle' | 'explicit';

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
  source: 'user';
  is_private: true;
  allow_recall: boolean;
  recall_style: RecallStyle;
  user_confirmed: boolean;
  created_at: string;
  updated_at: string;
};

export type CompanionResponse = {
  id: string;
  title: string;
  body: string;
  tone: 'quiet' | 'gentle' | 'encouraging';
  created_at: string;
};
