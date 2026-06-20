import type { Track } from './types';

export const tracks: Track[] = [
  {
    id: 'nilimaoma',
    title: '你礼貌吗',
    artist: 'Friday Sample / Nostalgia',
    album: 'Nostalgia Demo',
    duration_s: 160,
    cover: '礼',
    audio_url: '/nilimaoma.mp3',
    friday_url: '/nilimaoma.json',
    mood: ['玩梗', '群体记忆', '轻松'],
    description: '真实仓库样例：使用 nilimaoma.mp3 与 nilimaoma.json 展示 Friday 公共情绪段落。',
  },
  {
    id: 'nilimaoma-night',
    title: '你礼貌吗 · 夜间回放',
    artist: 'MilitAIre Nostalgia',
    album: 'Demo Variant',
    duration_s: 160,
    cover: '夜',
    audio_url: '/nilimaoma.mp3',
    friday_url: '/nilimaoma.json',
    mood: ['怀旧', '回放', '独处'],
    description: '同一段素材的夜间记忆版本，用于展示不同听歌状态下的私人 Moment。',
  },
  {
    id: 'nilimaoma-archive',
    title: '你礼貌吗 · 记忆存档',
    artist: 'MilitAIre Nostalgia',
    album: 'Demo Variant',
    duration_s: 160,
    cover: '存',
    audio_url: '/nilimaoma.mp3',
    friday_url: '/nilimaoma.json',
    mood: ['存档', '锚点', '私人记忆'],
    description: '同一段素材的记忆沉淀版本，用于展示本地保存、召回和导出。',
  },
];

export const moodOptions = ['怀念', '治愈', '玩梗', '上头', '释放', '独处', '存档', '想起某人'];
