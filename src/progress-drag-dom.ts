declare global {
  interface Window {
    __nostalgiaProgressDragMounted?: boolean;
  }
}

const progressSelector = '.progress-line';
const rangeSelector = 'input[type="range"]';

const setRangeValueFromPointer = (line: HTMLElement, pointerX: number) => {
  const input = line.querySelector<HTMLInputElement>(rangeSelector);
  if (!input) return;

  const rect = line.getBoundingClientRect();
  const ratio = rect.width > 0 ? Math.min(1, Math.max(0, (pointerX - rect.left) / rect.width)) : 0;
  const min = Number(input.min || 0);
  const max = Number(input.max || 1);
  const nextValue = min + ratio * (max - min);

  input.value = String(nextValue);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
};

const mountProgressDrag = () => {
  if (window.__nostalgiaProgressDragMounted) return;
  window.__nostalgiaProgressDragMounted = true;

  let activeLine: HTMLElement | null = null;

  document.addEventListener(
    'pointerdown',
    (event) => {
      if (!(event.target instanceof HTMLElement)) return;
      if (event.target.closest('.moment-dot')) return;
      const line = event.target.closest<HTMLElement>(progressSelector);
      if (!line) return;

      activeLine = line;
      event.preventDefault();
      setRangeValueFromPointer(line, event.clientX);
    },
    true,
  );

  window.addEventListener(
    'pointermove',
    (event) => {
      if (!activeLine) return;
      event.preventDefault();
      setRangeValueFromPointer(activeLine, event.clientX);
    },
    { capture: true, passive: false },
  );

  window.addEventListener(
    'pointerup',
    () => {
      activeLine = null;
    },
    true,
  );

  window.addEventListener(
    'pointercancel',
    () => {
      activeLine = null;
    },
    true,
  );
};

if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountProgressDrag, { once: true });
  } else {
    mountProgressDrag();
  }
}

export {};
