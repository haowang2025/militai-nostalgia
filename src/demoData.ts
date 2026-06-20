import type { Track } from './types';

export const tracks: Track[] = [
  {
    id: 'nilimaoma',
    title: '你礼貌吗',
    artist: 'Friday Sample / 米粒太',
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
    description: '同一段素材的夜间情绪皮肤，用于满足样例库与筛选体验。',
  },
  {
    id: 'nilimaoma-practice',
    title: '你礼貌吗 · 练习片段',
    artist: 'MilitAIre Practice',
    album: 'Demo Variant',
    duration_s: 160,
    cover: '唱',
    audio_url: '/nilimaoma.mp3',
    friday_url: '/nilimaoma.json',
    mood: ['练习', '声乐反馈', '米粒太'],
    description: '突出“让我唱一下”和 MCP 降级反馈的练习场景。',
  },
];

export const moodOptions = ['怀念', '治愈', '玩梗', '上头', '释放', '独处', '练习', '想起某人'];

export const companionSeed = [
  '米粒太暂时不替你定义这段情绪，只把这一刻稳稳收好。',
  '快到你上次保存的那一段了。我不多说，陪你把这几秒听完。',
  '如果想唱一下，也可以录一小段。MCP 没接上时，demo 会先保存练习记录。',
];
