import { afterEach, describe, expect, it, vi } from 'vitest';
import { probeSong } from '../features/tracks/probeSong';
import type { SearchSong } from '../features/search/searchApi';

class FakeAudio extends EventTarget {
  duration = 180;
  preload = '';
  src = '';
  load = vi.fn();

  removeAttribute(name: string) {
    if (name === 'src') this.src = '';
  }
}

const song: SearchSong = {
  provider: 'n',
  providerId: 123,
  name: 'Test Song',
  artists: ['Test Artist'],
  durationMs: 180_000,
};

const installAudioEnvironment = (audio: FakeAudio) => {
  vi.stubGlobal('window', { setTimeout, clearTimeout });
  vi.stubGlobal('document', { createElement: () => audio });
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('probeSong', () => {
  it('rejects with AbortError and cleans up when the selection becomes stale', async () => {
    const audio = new FakeAudio();
    installAudioEnvironment(audio);
    const controller = new AbortController();

    const pending = probeSong(song, controller.signal);
    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(audio.src).toBe('');
    expect(audio.load).toHaveBeenCalled();
  });

  it('returns a local track after audio metadata becomes available', async () => {
    const audio = new FakeAudio();
    installAudioEnvironment(audio);

    const pending = probeSong(song);
    audio.dispatchEvent(new Event('loadedmetadata'));

    await expect(pending).resolves.toMatchObject({
      id: 'online-123',
      duration_s: 180,
      title: 'Test Song',
    });
  });
});
