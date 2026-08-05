import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  adaptSearchResponse,
  audioUrlForSong,
  searchEndpoints,
  searchSongs,
  trackIdForSong,
} from '../features/search/searchApi';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('adaptSearchResponse', () => {
  it('normalizes the cloud search response shape', () => {
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

  it('normalizes the legacy search response shape used by the upstream search endpoint', () => {
    const songs = adaptSearchResponse({
      result: {
        songs: [{
          id: 347230,
          name: '海阔天空',
          artists: [{ name: 'Beyond' }],
          album: { name: '乐与怒', picUrl: 'https://example.com/cover.jpg' },
          duration: 326000,
        }],
      },
    });
    expect(songs[0]).toMatchObject({
      providerId: 347230,
      artists: ['Beyond'],
      albumName: '乐与怒',
      durationMs: 326000,
    });
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

describe('search endpoint routing', () => {
  it('uses a same-origin Pages Function in production', () => {
    expect(searchEndpoints({ production: true, origin: 'https://militaire.pages.dev' })).toEqual([{
      base: 'https://militaire.pages.dev',
      path: '/api/search',
      timeoutMs: 10_000,
    }]);
  });

  it('uses the responding backup during direct local development', async () => {
    vi.stubGlobal('window', {
      location: { origin: 'http://localhost:5173' },
      setTimeout: globalThis.setTimeout,
      clearTimeout: globalThis.clearTimeout,
    });
    const fetchMock = vi.fn<typeof fetch>();
    fetchMock
      .mockRejectedValueOnce(new TypeError('network unavailable'))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        result: {
          songs: [{ id: 347230, name: '海阔天空', artists: [{ name: 'Beyond' }] }],
        },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    const songs = await searchSongs('海阔天空');

    expect(songs[0]?.providerId).toBe(347230);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const firstUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    const secondUrl = new URL(String(fetchMock.mock.calls[1]?.[0]));
    expect(firstUrl.origin).toBe('https://ezmusic-api.vercel.app');
    expect(secondUrl.origin).toBe('https://netease-cloud-music-api-backup-roan-alpha.vercel.app');
  });

  it('keeps at least two distinct direct development endpoints', () => {
    const endpoints = searchEndpoints({ production: false });
    expect(endpoints.length).toBeGreaterThanOrEqual(2);
    expect(new Set(endpoints.map((endpoint) => `${endpoint.base}${endpoint.path}`)).size).toBe(endpoints.length);
  });
});

describe('song URL helpers', () => {
  it('creates stable local ids and media URLs', () => {
    expect(trackIdForSong(123)).toBe('online-123');
    expect(audioUrlForSong(123)).toBe('https://music.163.com/song/media/outer/url?id=123.mp3');
  });
});
