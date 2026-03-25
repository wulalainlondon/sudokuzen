import { useEffect, useRef, type ReactElement } from 'react';

type Props = { active: boolean };

export function StepPulseCanvas({ active }: Props): ReactElement {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!active) return;
    const canvas = ref.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    ctx.scale(dpr, dpr);

    let t = 0;
    let raf = 0;

    const draw = () => {
      t += 0.04;
      ctx.clearRect(0, 0, w, h);
      const x = w * 0.5;
      const y = h * 0.5;
      const r = 20 + Math.sin(t) * 6;

      const g = ctx.createRadialGradient(x, y, 4, x, y, r * 2.4);
      g.addColorStop(0, 'rgba(74, 144, 226, 0.55)');
      g.addColorStop(1, 'rgba(74, 144, 226, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r * 2.4, 0, Math.PI * 2);
      ctx.fill();

      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [active]);

  return <canvas ref={ref} className="pointer-events-none absolute inset-0 h-full w-full" />;
}
