import { describe, expect, it } from 'vitest';
import { adaptSearchResponse, audioUrlForSong, trackIdForSong } from '../features/search/searchApi';

describe('adaptSearchResponse', () => {
  it('normalizes NetEase cloudsearch songs', () => {
    const songs = adaptSearchResponse({
      result: {
        songs: [{
          id: 347230,
          name: '海阔天空',
          ar: [{ name: 'Beyond' }],
          al: { name: '乐与怒', picUrl: 'https://example.com/cover.jpg' },
          dt: 326000,
        }],
      },
    });
    expect(songs).toEqual([{
      provider: 'n',
      providerId: 347230,
      name: '海阔天空',
      artists: ['Beyond'],
      albumName: '乐与怒',
      coverUrl: 'https://example.com/cover.jpg',
      durationMs: 326000,
    }]);
  });

  it('ignores malformed rows while keeping partial valid rows', () => {
    const songs = adaptSearchResponse({ result: { songs: [null, { id: 1, name: 'Song' }, { id: 'bad', name: 'No' }] } });
    expect(songs).toEqual([{ provider: 'n', providerId: 1, name: 'Song', artists: [] }]);
  });

  it('caps valid upstream rows at ten even if the service ignores the requested limit', () => {
    const songs = adaptSearchResponse({
      result: {
        songs: Array.from({ length: 14 }, (_, index) => ({ id: index + 1, name: `Song ${index + 1}` })),
      },
    });
    expect(songs).toHaveLength(10);
    expect(songs.at(-1)?.providerId).toBe(10);
  });
});

describe('song URL helpers', () => {
  it('creates stable local ids and media URLs', () => {
    expect(trackIdForSong(123)).toBe('netease-123');
    expect(audioUrlForSong(123)).toBe('https://music.163.com/song/media/outer/url?id=123.mp3');
  });
});
