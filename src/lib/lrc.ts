export type LyricLine = {
  time: number;
  text: string;
};

const timePattern = /\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g;

export function parseLrc(raw: string | null | undefined): LyricLine[] {
  if (!raw) return [];
  const lines: LyricLine[] = [];
  for (const sourceLine of raw.split(/\r?\n/)) {
    const text = sourceLine.replace(timePattern, '').trim();
    if (!text) continue;
    timePattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = timePattern.exec(sourceLine))) {
      const minutes = Number(match[1]);
      const seconds = Number(match[2]);
      const fraction = match[3] ? Number(`0.${match[3].padEnd(3, '0').slice(0, 3)}`) : 0;
      lines.push({ time: minutes * 60 + seconds + fraction, text });
    }
  }
  return lines.sort((a, b) => a.time - b.time);
}

export function lyricAt(lines: LyricLine[], currentTime: number) {
  let current: LyricLine | undefined;
  for (const line of lines) {
    if (line.time > currentTime + 0.05) break;
    current = line;
  }
  return current?.text;
}
