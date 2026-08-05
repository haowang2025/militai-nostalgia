import { afterEach, describe, expect, it, vi } from 'vitest';
import { onRequestGet } from '../../functions/api/search';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Pages search proxy', () => {
  it('returns the first non-empty upstream response through the same origin route', async () => {
    const fetchMock = vi.fn<typeof fetch>((input) => {
      const url = new URL(String(input));
      if (url.hostname === 'ezmusic-api.vercel.app') {
        return Promise.resolve(new Response(JSON.stringify({
          result: {
            songs: [{ id: 347230, name: '海阔天空', artists: [{ name: 'Beyond' }] }],
          },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
      }
      return Promise.resolve(new Response('upstream failed', { status: 503 }));
    });
    vi.stubGlobal('fetch', fetchMock);

    const response = await onRequestGet({
      request: new Request('https://militaire.pages.dev/api/search?keywords=%E6%B5%B7%E9%98%94%E5%A4%A9%E7%A9%BA'),
      env: {},
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('X-Search-Upstream')).toBe('ezmusic');
    await expect(response.json()).resolves.toMatchObject({
      result: { songs: [{ id: 347230, name: '海阔天空' }] },
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('rejects empty keywords before contacting an upstream', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', fetchMock);

    const response = await onRequestGet({
      request: new Request('https://militaire.pages.dev/api/search'),
      env: {},
    });

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
