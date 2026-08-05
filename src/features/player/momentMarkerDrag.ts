import type { Moment } from '../../types';
import { useNostalgiaStore } from '../../store';

type TimingPatch = Pick<Moment, 'timestamp_s' | 'start_s' | 'end_s'>;

type DragContext = {
  button: HTMLButtonElement;
  line: HTMLElement;
  moment: Moment;
  duration: number;
  pointerId: number;
  startClientX: number;
  originalLeft: string;
  originalTitle: string;
  moved: boolean;
  nextTiming: TimingPatch;
};

const formatTime = (value: number) => {
  const safe = Math.max(0, Number.isFinite(value) ? value : 0);
  const minutes = Math.floor(safe / 60).toString().padStart(2, '0');
  const seconds = Math.floor(safe % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
};

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(Math.max(value, minimum), maximum);

const trackIdFromPath = () => {
  const marker = '/player/';
  const start = window.location.pathname.indexOf(marker);
  if (start < 0) return null;
  const encoded = window.location.pathname.slice(start + marker.length).replace(/\/+$/, '');
  if (!encoded) return null;
  try {
    return decodeURIComponent(encoded);
  } catch {
    return encoded;
  }
};

const markerMoment = (button: HTMLButtonElement, line: HTMLElement) => {
  const trackId = trackIdFromPath();
  if (!trackId) return null;
  const buttons = Array.from(line.querySelectorAll<HTMLButtonElement>('.moment-dot'));
  const index = buttons.indexOf(button);
  if (index < 0) return null;
  return useNostalgiaStore.getState().moments.filter((moment) => moment.track_id === trackId)[index] ?? null;
};

const timingAtClientX = (context: DragContext, clientX: number): TimingPatch => {
  const rect = context.line.getBoundingClientRect();
  const rawTime = rect.width > 0
    ? ((clientX - rect.left) / rect.width) * context.duration
    : context.moment.timestamp_s;
  const leftSpan = Math.max(0, context.moment.timestamp_s - context.moment.start_s);
  const rightSpan = Math.max(0, context.moment.end_s - context.moment.timestamp_s);
  const minimum = Math.min(context.duration, leftSpan);
  const maximum = Math.max(minimum, context.duration - rightSpan);
  const timestamp = clamp(rawTime, minimum, maximum);
  return {
    timestamp_s: timestamp,
    start_s: Math.max(0, timestamp - leftSpan),
    end_s: Math.min(context.duration, timestamp + rightSpan),
  };
};

const updatePreview = (context: DragContext) => {
  const percent = (context.nextTiming.timestamp_s / Math.max(context.duration, 1)) * 100;
  context.button.style.left = `${percent}%`;
  context.button.title = `拖动时间点 · ${formatTime(context.nextTiming.timestamp_s)}`;
  context.button.setAttribute('aria-label', `Moment 时间点 ${formatTime(context.nextTiming.timestamp_s)}，可左右拖动`);
};

export const enableMomentMarkerDrag = () => {
  if (typeof document === 'undefined') return;
  const flag = '__militaireMomentMarkerDragEnabled';
  const documentWithFlag = document as Document & Record<string, boolean | undefined>;
  if (documentWithFlag[flag]) return;
  documentWithFlag[flag] = true;

  let active: DragContext | null = null;

  const finish = (commit: boolean) => {
    const context = active;
    if (!context) return;
    active = null;
    context.button.classList.remove('is-dragging');
    try {
      if (context.button.hasPointerCapture(context.pointerId)) context.button.releasePointerCapture(context.pointerId);
    } catch {
      // Pointer capture may already be released by the browser.
    }

    if (commit && context.moved) {
      const updateTiming = useNostalgiaStore.getState().updateMoment as unknown as
        (id: string, patch: TimingPatch) => void;
      updateTiming(context.moment.id, context.nextTiming);
      context.button.dataset.markerDragged = 'true';
      window.setTimeout(() => { delete context.button.dataset.markerDragged; }, 0);
      return;
    }

    context.button.style.left = context.originalLeft;
    context.button.title = context.originalTitle;
    context.button.setAttribute('aria-label', `${context.originalTitle}，可左右拖动`);
  };

  const onPointerDown = (event: PointerEvent) => {
    if (!event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return;
    const target = event.target instanceof Element ? event.target : null;
    const button = target?.closest<HTMLButtonElement>('.moment-dot');
    const line = button?.closest<HTMLElement>('.progress-line');
    const range = line?.querySelector<HTMLInputElement>('input[type="range"]');
    if (!button || !line || !range) return;
    const duration = Number(range.max);
    if (!Number.isFinite(duration) || duration <= 0) return;
    const moment = markerMoment(button, line);
    if (!moment) return;

    active = {
      button,
      line,
      moment,
      duration,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      originalLeft: button.style.left,
      originalTitle: button.title,
      moved: false,
      nextTiming: {
        timestamp_s: moment.timestamp_s,
        start_s: moment.start_s,
        end_s: moment.end_s,
      },
    };

    button.classList.add('is-dragging');
    try {
      button.setPointerCapture(event.pointerId);
    } catch {
      // Some browsers delay pointer capture until after pointerdown completes.
    }

    const onMove = (moveEvent: PointerEvent) => {
      const context = active;
      if (!context || moveEvent.pointerId !== context.pointerId) return;
      if (!context.moved && Math.abs(moveEvent.clientX - context.startClientX) < 4) return;
      context.moved = true;
      moveEvent.preventDefault();
      context.nextTiming = timingAtClientX(context, moveEvent.clientX);
      updatePreview(context);
    };

    const onUp = (upEvent: PointerEvent) => {
      if (!active || upEvent.pointerId !== active.pointerId) return;
      button.removeEventListener('pointermove', onMove);
      button.removeEventListener('pointerup', onUp);
      button.removeEventListener('pointercancel', onCancel);
      finish(true);
    };

    const onCancel = (cancelEvent: PointerEvent) => {
      if (!active || cancelEvent.pointerId !== active.pointerId) return;
      button.removeEventListener('pointermove', onMove);
      button.removeEventListener('pointerup', onUp);
      button.removeEventListener('pointercancel', onCancel);
      finish(false);
    };

    button.addEventListener('pointermove', onMove);
    button.addEventListener('pointerup', onUp);
    button.addEventListener('pointercancel', onCancel);
  };

  const suppressClickAfterDrag = (event: MouseEvent) => {
    const target = event.target instanceof Element ? event.target : null;
    const button = target?.closest<HTMLButtonElement>('.moment-dot');
    if (!button || button.dataset.markerDragged !== 'true') return;
    event.preventDefault();
    event.stopPropagation();
    delete button.dataset.markerDragged;
  };

  document.addEventListener('pointerdown', onPointerDown, true);
  document.addEventListener('click', suppressClickAfterDrag, true);
};
