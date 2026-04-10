// ZenCountUp — animate a number counting from 0 to target value.
// Used for win screen time display and stats numbers.

import { useEffect, useRef, useState, type ReactElement } from 'react';
import { ZEN, isReducedMotion } from './zenMotion';

interface ZenCountUpProps {
  /** Target value in seconds (for time display) */
  value: number;
  /** Duration of the count-up animation */
  duration?: number;
  /** Format function (default: MM:SS) */
  format?: (n: number) => string;
  className?: string;
}

function defaultFormat(sec: number): string {
  const m = Math.floor(sec / 60)
    .toString()
    .padStart(2, '0');
  const s = (sec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export function ZenCountUp({
  value,
  duration = ZEN.SETTLE + 0.15,
  format = defaultFormat,
  className,
}: ZenCountUpProps): ReactElement {
  const [display, setDisplay] = useState(0);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (isReducedMotion() || value <= 0) {
      setDisplay(value);
      return;
    }

    const startTime = performance.now();
    const durationMs = duration * 1000;

    function tick(now: number) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / durationMs, 1);
      // Ease out: fast start, slow finish
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(eased * value));
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      }
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [value, duration]);

  return <span className={className}>{format(display)}</span>;
}
