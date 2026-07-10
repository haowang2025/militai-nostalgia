import { useEffect, useRef } from 'react';

type RememberShortcutOptions = {
  disabled: boolean;
  onStart: () => void;
  onEnd: () => void;
  onCancel: () => void;
};

const interactiveSelector = 'input, textarea, select, button, a[href], [role="button"], [contenteditable="true"]';

const isInteractiveTarget = (target: EventTarget | null) =>
  target instanceof HTMLElement && Boolean(target.closest(interactiveSelector));

export const useRememberShortcut = ({ disabled, onStart, onEnd, onCancel }: RememberShortcutOptions) => {
  const activeRef = useRef(false);

  useEffect(() => {
    const keyDown = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || event.repeat || disabled || isInteractiveTarget(event.target)) return;
      event.preventDefault();
      if (activeRef.current) return;
      activeRef.current = true;
      onStart();
    };
    const keyUp = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || isInteractiveTarget(event.target)) return;
      if (!activeRef.current) return;
      event.preventDefault();
      activeRef.current = false;
      onEnd();
    };
    const blur = () => {
      if (!activeRef.current) return;
      activeRef.current = false;
      onCancel();
    };
    window.addEventListener('keydown', keyDown);
    window.addEventListener('keyup', keyUp);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', keyDown);
      window.removeEventListener('keyup', keyUp);
      window.removeEventListener('blur', blur);
    };
  }, [disabled, onCancel, onEnd, onStart]);
};
