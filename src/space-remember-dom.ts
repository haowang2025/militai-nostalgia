declare global {
  interface Window {
    __nostalgiaSpaceRememberMounted?: boolean;
    __nostalgiaSpaceRememberActive?: boolean;
  }
}

const editableSelector = 'input, textarea, select, [contenteditable="true"]';

const isEditableTarget = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(target.closest(editableSelector));
};

const rememberButton = () => document.querySelector<HTMLButtonElement>('.hold-remember');

const dispatchPointerToRemember = (type: 'pointerdown' | 'pointerup' | 'pointercancel') => {
  const button = rememberButton();
  if (!button) return;

  const eventInit: PointerEventInit = {
    bubbles: true,
    cancelable: true,
    pointerId: 1,
    pointerType: 'keyboard',
    isPrimary: true,
    button: 0,
    buttons: type === 'pointerdown' ? 1 : 0,
    clientX: 0,
    clientY: 0,
  };

  if (typeof PointerEvent === 'function') {
    button.dispatchEvent(new PointerEvent(type, eventInit));
  } else {
    const mouseType = type === 'pointerdown' ? 'mousedown' : type === 'pointerup' ? 'mouseup' : 'mouseleave';
    button.dispatchEvent(new MouseEvent(mouseType, { bubbles: true, cancelable: true }));
  }
};

const stopSpace = (event: KeyboardEvent) => {
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
};

const mountSpaceRemember = () => {
  if (window.__nostalgiaSpaceRememberMounted) return;
  window.__nostalgiaSpaceRememberMounted = true;

  window.addEventListener(
    'keydown',
    (event) => {
      if (event.code !== 'Space') return;
      if (isEditableTarget(event.target)) return;

      stopSpace(event);
      if (event.repeat || window.__nostalgiaSpaceRememberActive) return;

      window.__nostalgiaSpaceRememberActive = true;
      dispatchPointerToRemember('pointerdown');
    },
    true,
  );

  window.addEventListener(
    'keyup',
    (event) => {
      if (event.code !== 'Space') return;
      if (isEditableTarget(event.target)) return;

      stopSpace(event);
      if (!window.__nostalgiaSpaceRememberActive) return;

      window.__nostalgiaSpaceRememberActive = false;
      dispatchPointerToRemember('pointerup');
    },
    true,
  );

  window.addEventListener('blur', () => {
    if (!window.__nostalgiaSpaceRememberActive) return;
    window.__nostalgiaSpaceRememberActive = false;
    dispatchPointerToRemember('pointercancel');
  });
};

if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountSpaceRemember, { once: true });
  } else {
    mountSpaceRemember();
  }
}

export {};
