import { useEffect, useRef } from 'react';

/**
 * Traps focus within a container when `active` is true.
 * Returns focus to the previously focused element on deactivate.
 */
export function useFocusTrap(active: boolean) {
  const containerRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!active) return;

    previouslyFocusedRef.current = document.activeElement as HTMLElement;

    // Focus first focusable element in container
    const container = containerRef.current;
    if (!container) return;

    const focusFirst = () => {
      const focusable = container.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length > 0) focusable[0].focus();
    };

    // Slight delay to ensure React has rendered
    const timer = setTimeout(focusFirst, 50);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const focusable = container.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('keydown', handleKeyDown);
      previouslyFocusedRef.current?.focus();
    };
  }, [active]);

  return containerRef;
}
