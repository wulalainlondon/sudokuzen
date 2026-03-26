import { useEffect, useState, type ReactElement } from 'react';

type Props = {
  boardRef: React.RefObject<HTMLElement | null>;
  cells: number[];
  eliminateCells?: number[];
  animate?: boolean;
};

function cellCenter(boardEl: HTMLElement, idx: number): { x: number; y: number } | null {
  const cell = boardEl.children[idx] as HTMLElement | undefined;
  if (!cell) return null;
  const br = boardEl.getBoundingClientRect();
  const cr = cell.getBoundingClientRect();
  return {
    x: cr.left - br.left + cr.width / 2,
    y: cr.top - br.top + cr.height / 2,
  };
}

function readCssVar(name: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

export function ChainOverlay({ boardRef, cells, eliminateCells = [], animate = true }: Props): ReactElement {
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [links, setLinks] = useState<{ x1: number; y1: number; x2: number; y2: number }[]>([]);
  const [dots, setDots] = useState<{ x: number; y: number }[]>([]);
  const [elims, setElims] = useState<{ x: number; y: number }[]>([]);

  const chainColor = readCssVar('--teach-chain', '#0984E3');
  const chainOpacity = parseFloat(readCssVar('--teach-chain-opacity', '0.55'));
  const elimColor = readCssVar('--teach-elim-color', '#D63031');

  useEffect(() => {
    const board = boardRef.current;
    if (!board || cells.length < 2) return;

    const ro = new ResizeObserver(() => {
      const b = boardRef.current;
      if (!b) return;
      const rect = b.getBoundingClientRect();
      setSize({ w: rect.width, h: rect.height });

      const pts = cells.map((idx) => cellCenter(b, idx)).filter(Boolean) as { x: number; y: number }[];
      setDots(pts);

      const newLinks: { x1: number; y1: number; x2: number; y2: number }[] = [];
      for (let i = 0; i < pts.length - 1; i++) {
        newLinks.push({ x1: pts[i].x, y1: pts[i].y, x2: pts[i + 1].x, y2: pts[i + 1].y });
      }
      setLinks(newLinks);
      setElims(eliminateCells.map((idx) => cellCenter(b, idx)).filter(Boolean) as { x: number; y: number }[]);
    });

    ro.observe(board);
    return () => ro.disconnect();
  }, [boardRef, cells, eliminateCells]);

  if (links.length === 0 && dots.length === 0) return <></>;

  const dashLen = animate ? 500 : 0;

  return (
    <svg
      className="chain-overlay"
      width={size.w}
      height={size.h}
      viewBox={`0 0 ${size.w} ${size.h}`}
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 5 }}
    >
      <defs>
        <marker id="chain-end" markerWidth="6" markerHeight="4" refX="5" refY="2" orient="auto">
          <polygon points="0 0, 6 2, 0 4" fill={chainColor} opacity={chainOpacity} />
        </marker>
      </defs>

      {/* Chain links — thin, semi-transparent, matching accent */}
      {links.map((l, i) => (
        <line
          key={`l-${i}`}
          x1={l.x1}
          y1={l.y1}
          x2={l.x2}
          y2={l.y2}
          stroke={chainColor}
          strokeWidth={1.8}
          strokeOpacity={chainOpacity}
          markerEnd="url(#chain-end)"
          strokeDasharray={dashLen || undefined}
          strokeDashoffset={dashLen || undefined}
          style={dashLen ? { animation: `chain-draw 0.5s ${i * 0.12}s ease-out forwards` } : undefined}
        />
      ))}

      {/* Chain node dots — small, accent-coloured */}
      {dots.map((d, i) => (
        <circle
          key={`d-${i}`}
          cx={d.x}
          cy={d.y}
          r={3}
          fill={chainColor}
          fillOpacity={chainOpacity + 0.15}
          stroke="white"
          strokeWidth={0.8}
          style={animate ? { animation: `chain-dot 0.25s ${i * 0.1}s ease-out both` } : undefined}
        />
      ))}

      {/* Elimination targets — subtle ring instead of harsh X */}
      {elims.map((e, i) => (
        <circle
          key={`e-${i}`}
          cx={e.x}
          cy={e.y}
          r={6}
          fill="none"
          stroke={elimColor}
          strokeWidth={1.5}
          strokeOpacity={0.5}
          strokeDasharray="3 2"
          style={animate ? { animation: `chain-dot 0.3s 0.4s ease-out both` } : undefined}
        />
      ))}
    </svg>
  );
}
