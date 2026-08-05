import { describe, expect, it } from 'vitest';
import { shouldAcceptPositionUpdate, type PlaybackMediaState } from '../features/tracks/trackStore';

const state = (patch: Partial<PlaybackMediaState> = {}): PlaybackMediaState => ({
  ready: true,
  atStart: false,
  ended: false,
  matchesTrack: true,
  ...patch,
});

describe('shouldAcceptPositionUpdate', () => {
  it('keeps a saved position when an unmounted or replaced player reports a stale zero', () => {
    expect(shouldAcceptPositionUpdate(42, 0, undefined)).toBe(false);
    expect(shouldAcceptPositionUpdate(42, 0, state({ matchesTrack: false }))).toBe(false);
    expect(shouldAcceptPositionUpdate(42, 0, state({ ready: false, atStart: true }))).toBe(false);
  });

  it('allows deliberate rewinds and normal ended resets for the active track', () => {
    expect(shouldAcceptPositionUpdate(42, 0, state({ atStart: true }))).toBe(true);
    expect(shouldAcceptPositionUpdate(42, 0, state({ ended: true }))).toBe(true);
  });

  it('always accepts meaningful positive progress', () => {
    expect(shouldAcceptPositionUpdate(42, 12.5, undefined)).toBe(true);
    expect(shouldAcceptPositionUpdate(0, 0, undefined)).toBe(true);
  });
});
