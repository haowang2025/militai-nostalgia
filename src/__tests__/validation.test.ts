import { describe, expect, it } from 'vitest';
import { parseFridaySegments, parseStoredMoments } from '../validation';

describe('parseStoredMoments', () => {
  it('migrates a legacy moment array and restores defaults', () => {
    const moments = parseStoredMoments([{ id: 'm1', track_id: 't1', timestamp_s: 12, note: 'hello' }]);
    expect(moments).toHaveLength(1);
    expect(moments[0]).toMatchObject({ id: 'm1', track_id: 't1', start_s: 7, end_s: 17, allow_recall: true });
  });

  it('ignores malformed entries', () => {
    expect(parseStoredMoments([{ id: '', track_id: 't1' }, null, 3])).toEqual([]);
  });
});

describe('parseFridaySegments', () => {
  it('accepts an envelope and sorts segments', () => {
    const segments = parseFridaySegments({ segments: [
      { start: 10, end: 20, peak_t: 15, content: 'b' },
      { start: 0, end: 5, peak_t: 2, content: 'a' },
    ] });
    expect(segments.map((segment) => segment.content)).toEqual(['a', 'b']);
  });

  it('rejects an empty payload', () => {
    expect(() => parseFridaySegments([])).toThrow('no valid segments');
  });
});
