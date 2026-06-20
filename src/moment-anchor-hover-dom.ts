declare global {
  interface Window {
    __nostalgiaAnchorHoverMounted?: boolean;
  }
}

type StoredMoment = {
  id: string;
  track_id: string;
  timestamp_s: number;
  start_s: number;
  end_s: number;
  allow_recall?: boolean;
};

const momentStorageKey = 'militai-nostalgia/moments/v1';
const activeDotClass = 'is-anchor-hovered';
const activeCardClass = 'is-anchor-linked';
const progressHoverClass = 'has-anchor-hover';

const readMoments = (): StoredMoment[] => {
  try {
    const raw = window.localStorage.getItem(momentStorageKey);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const numberFromPercent = (value: string | null) => {
  if (!value) return Number.NaN;
  return Number(value.replace('%', '').trim());
};

const clearAnchorHover = () => {
  document.querySelectorAll(`.${activeDotClass}`).forEach((node) => node.classList.remove(activeDotClass));
  document.querySelectorAll(`.${activeCardClass}`).forEach((node) => node.classList.remove(activeCardClass));
  document.querySelectorAll(`.${progressHoverClass}`).forEach((node) => node.classList.remove(progressHoverClass));
};

const currentDuration = () => {
  const input = document.querySelector<HTMLInputElement>('.progress-line input[type="range"]');
  return Number(input?.max || 0) || 1;
};

const currentTime = () => {
  const input = document.querySelector<HTMLInputElement>('.progress-line input[type="range"]');
  return Number(input?.value || 0);
};

const groupedCurrentTrackMoments = (dots: HTMLButtonElement[]) => {
  const moments = readMoments();
  const duration = currentDuration();
  const dotPercents = dots.map((dot) => numberFromPercent(dot.style.left));
  const groups = new Map<string, StoredMoment[]>();

  for (const moment of moments) {
    const group = groups.get(moment.track_id) ?? [];
    group.push(moment);
    groups.set(moment.track_id, group);
  }

  const candidates = Array.from(groups.values()).filter((group) => group.length === dots.length);
  if (!candidates.length) return [];

  return candidates.find((group) => group.every((moment, index) => {
    const expected = (moment.timestamp_s / Math.max(duration, 1)) * 100;
    const actual = dotPercents[index];
    return Number.isFinite(actual) && Math.abs(expected - actual) < 1.2;
  })) ?? candidates[0];
};

const visibleCards = () => [
  ...Array.from(document.querySelectorAll<HTMLElement>('.bulletin-card')),
  ...Array.from(document.querySelectorAll<HTMLElement>('.recall-card')),
];

const activeMomentsFor = (trackMoments: StoredMoment[]) => {
  const now = currentTime();
  return trackMoments.filter((moment) => (moment.allow_recall ?? true) && now >= moment.start_s - 3 && now <= moment.end_s);
};

const activeIndexFor = (hoveredMoment: StoredMoment | undefined, trackMoments: StoredMoment[]) => {
  if (!hoveredMoment) return -1;
  return activeMomentsFor(trackMoments).findIndex((moment) => moment.id === hoveredMoment.id);
};

const highlightLinkedCard = (hoveredMoment: StoredMoment | undefined, trackMoments: StoredMoment[]) => {
  const activeIndex = activeIndexFor(hoveredMoment, trackMoments);
  if (activeIndex < 0) return;

  const card = visibleCards()[activeIndex];
  if (card) card.classList.add(activeCardClass);
};

const dotContext = (dot: HTMLButtonElement) => {
  const dots = Array.from(document.querySelectorAll<HTMLButtonElement>('.progress-line .moment-dot'));
  const index = dots.indexOf(dot);
  const trackMoments = groupedCurrentTrackMoments(dots);
  return { dots, index, trackMoments, moment: trackMoments[index] };
};

const handleAnchorEnter = (dot: HTMLButtonElement) => {
  clearAnchorHover();
  const line = dot.closest<HTMLElement>('.progress-line');
  const { index, trackMoments, moment } = dotContext(dot);

  line?.classList.add(progressHoverClass);
  dot.classList.add(activeDotClass);
  if (!dot.title) dot.title = `Moment ${index + 1}`;
  highlightLinkedCard(moment, trackMoments);
};

const openLinkedCardEditor = (dot: HTMLButtonElement) => {
  const { trackMoments, moment } = dotContext(dot);
  if (!moment) return;

  window.setTimeout(() => {
    const activeIndex = activeIndexFor(moment, trackMoments);
    const card = activeIndex >= 0 ? visibleCards()[activeIndex] : undefined;
    if (!card || card.classList.contains('editing-surface')) return;
    card.click();
    window.setTimeout(() => {
      const textarea = document.querySelector<HTMLTextAreaElement>('.surface-editor textarea');
      textarea?.focus();
    }, 0);
  }, 80);
};

const relatedTargetInsideProgressLine = (event: PointerEvent) => {
  const related = event.relatedTarget;
  return related instanceof HTMLElement && Boolean(related.closest('.progress-line'));
};

const mountAnchorHover = () => {
  if (window.__nostalgiaAnchorHoverMounted) return;
  window.__nostalgiaAnchorHoverMounted = true;

  document.addEventListener('pointerover', (event) => {
    if (!(event.target instanceof HTMLElement)) return;
    const dot = event.target.closest<HTMLButtonElement>('.moment-dot');
    if (dot) handleAnchorEnter(dot);
  }, true);

  document.addEventListener('pointerout', (event) => {
    if (!(event.target instanceof HTMLElement)) return;
    const line = event.target.closest('.progress-line');
    if (line && !relatedTargetInsideProgressLine(event)) clearAnchorHover();
  }, true);

  document.addEventListener('click', (event) => {
    if (!(event.target instanceof HTMLElement)) return;
    const dot = event.target.closest<HTMLButtonElement>('.moment-dot');
    if (dot) openLinkedCardEditor(dot);
  }, true);

  document.addEventListener('focusin', (event) => {
    if (!(event.target instanceof HTMLElement)) return;
    const dot = event.target.closest<HTMLButtonElement>('.moment-dot');
    if (dot) handleAnchorEnter(dot);
  }, true);

  document.addEventListener('focusout', (event) => {
    if (!(event.target instanceof HTMLElement)) return;
    if (event.target.closest('.moment-dot')) clearAnchorHover();
  }, true);
};

if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountAnchorHover, { once: true });
  } else {
    mountAnchorHover();
  }
}

export {};
