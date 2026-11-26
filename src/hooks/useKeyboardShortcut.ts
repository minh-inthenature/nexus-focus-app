import { useEffect } from 'react';

export interface KeyboardShortcutOptions {
  /** Key value (case-insensitive, e.g. `'k'` or `'\\'`). */
  key: string;
  /** Require Ctrl (Windows/Linux) or Cmd (macOS). */
  ctrlOrMeta?: boolean;
  /** Require Shift key. */
  shift?: boolean;
  /** Allow firing while focused inside input, textarea, or contentEditable. */
  allowInInput?: boolean;
  /** Whether the listener is currently active. */
  enabled?: boolean;
}

function isEditableElement(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tagName = target.tagName;
  return (
    tagName === 'INPUT' ||
    tagName === 'TEXTAREA' ||
    tagName === 'SELECT' ||
    target.isContentEditable
  );
}

/**
 * Registers a global `keydown` shortcut handler with automatic cleanup.
 */
export function useKeyboardShortcut(
  options: KeyboardShortcutOptions,
  handler: (event: KeyboardEvent) => void,
): void {
  const {
    key,
    ctrlOrMeta = false,
    shift = false,
    allowInInput = false,
    enabled = true,
  } = options;

  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== key.toLowerCase()) return;
      if (ctrlOrMeta && !(event.ctrlKey || event.metaKey)) return;
      if (!ctrlOrMeta && (event.ctrlKey || event.metaKey)) return;
      if (shift !== event.shiftKey) return;
      if (!allowInInput && isEditableElement(event.target)) return;

      event.preventDefault();
      handler(event);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [key, ctrlOrMeta, shift, allowInInput, enabled, handler]);
}
