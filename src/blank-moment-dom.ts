declare global {
  interface Window {
    __nostalgiaBlankCaptureMounted?: boolean;
    __nostalgiaBlankCaptureUntil?: number;
  }
}

const captureWindowMs = 1400;

const isEditableTarget = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(target.closest('input, textarea, select, [contenteditable="true"]'));
};

const markBlankCapture = () => {
  window.__nostalgiaBlankCaptureUntil = Date.now() + captureWindowMs;
};

const shouldCloseFreshEditor = () => Date.now() < (window.__nostalgiaBlankCaptureUntil ?? 0);

const closeFreshBlankEditor = () => {
  if (!shouldCloseFreshEditor()) return;
  const editor = document.querySelector<HTMLElement>('.surface-editor');
  const textarea = editor?.querySelector<HTMLTextAreaElement>('textarea');
  if (!editor || !textarea || textarea.value.trim()) return;

  const cancelButton = Array.from(editor.querySelectorAll<HTMLButtonElement>('button')).find(
    (button) => button.textContent?.trim() === '取消',
  );
  if (!cancelButton) return;

  window.__nostalgiaBlankCaptureUntil = 0;
  cancelButton.click();
};

const mountBlankCapture = () => {
  if (window.__nostalgiaBlankCaptureMounted) return;
  window.__nostalgiaBlankCaptureMounted = true;

  document.addEventListener(
    'pointerdown',
    (event) => {
      if (!(event.target instanceof HTMLElement)) return;
      if (event.target.closest('.hold-remember')) markBlankCapture();
    },
    true,
  );

  document.addEventListener(
    'keydown',
    (event) => {
      if (event.code !== 'Space' || event.repeat || isEditableTarget(event.target)) return;
      markBlankCapture();
    },
    true,
  );

  const observer = new MutationObserver(() => window.setTimeout(closeFreshBlankEditor, 0));
  const root = document.getElementById('root');
  if (root) observer.observe(root, { childList: true, subtree: true });
};

if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountBlankCapture, { once: true });
  } else {
    mountBlankCapture();
  }
}

export {};
