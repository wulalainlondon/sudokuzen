import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import { useDuoReviewStore } from './duoReviewStore';
import { t } from '../../i18n/t';
import type { MoveRecord } from '../../game/state';

// ── Board snapshot computation ────────────────────────────────────────

interface CellState {
  val: number;
  owner: 'host' | 'guest' | null;
  ok: boolean;
}

function buildSnapshot(puzzle: number[], hostMoves: MoveRecord[], guestMoves: MoveRecord[], atMs: number): CellState[] {
  const cells: CellState[] = puzzle.map((v) => ({ val: v, owner: null, ok: true }));

  // Merge and sort all moves up to atMs
  const all: (MoveRecord & { owner: 'host' | 'guest' })[] = [
    ...hostMoves.filter((m) => m.t <= atMs).map((m) => ({ ...m, owner: 'host' as const })),
    ...guestMoves.filter((m) => m.t <= atMs).map((m) => ({ ...m, owner: 'guest' as const })),
  ].sort((a, b) => a.t - b.t);

  for (const m of all) {
    if (puzzle[m.cell] !== 0) continue; // skip givens
    cells[m.cell] = { val: m.val, owner: m.val === 0 ? null : m.owner, ok: m.ok };
  }
  return cells;
}

// ── Scrubber helpers ──────────────────────────────────────────────────

function totalDuration(hostMoves: MoveRecord[], guestMoves: MoveRecord[]): number {
  const allT = [...hostMoves, ...guestMoves].map((m) => m.t);
  return allT.length ? allT.reduce((a, b) => (a > b ? a : b), 0) + 500 : 1000;
}

// ── Sub-components ────────────────────────────────────────────────────

function BoardCell({
  state,
  isGiven,
  isLastHost,
  isLastGuest,
}: {
  state: CellState;
  isGiven: boolean;
  isLastHost: boolean;
  isLastGuest: boolean;
}): ReactElement {
  let bg = 'transparent';
  if (!isGiven && state.val !== 0) {
    if (state.owner === 'host') bg = isLastHost ? '#60a5fa' : '#bfdbfe';
    else if (state.owner === 'guest') bg = isLastGuest ? '#fb923c' : '#fed7aa';
  }

  return (
    <div
      style={{
        width: '100%',
        aspectRatio: '1',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: bg,
        border: '1px solid #ccc',
        fontSize: 'clamp(10px, 2.5vmin, 20px)',
        fontWeight: isGiven ? 700 : 400,
        color: isGiven
          ? '#111'
          : !state.ok && state.val !== 0
            ? '#ef4444'
            : state.owner === 'host'
              ? '#1d4ed8'
              : state.owner === 'guest'
                ? '#c2410c'
                : '#111',
        boxSizing: 'border-box',
        position: 'relative',
        outline: isLastHost || isLastGuest ? '2px solid ' + (isLastHost ? '#2563eb' : '#ea580c') : 'none',
        outlineOffset: '-2px',
      }}
    >
      {state.val !== 0 ? state.val : ''}
    </div>
  );
}

function Board({
  puzzle,
  cells,
  lastHostCell,
  lastGuestCell,
}: {
  puzzle: number[];
  cells: CellState[];
  lastHostCell: number;
  lastGuestCell: number;
}): ReactElement {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(9, 1fr)',
        gap: 1,
        border: '2px solid #333',
        background: '#333',
        maxWidth: 'min(54vw, 360px)',
        width: '100%',
      }}
    >
      {cells.map((cell, idx) => {
        const col = idx % 9;
        const row = Math.floor(idx / 9);
        const borderRight = col === 2 || col === 5 ? '2px solid #333' : undefined;
        const borderBottom = row === 2 || row === 5 ? '2px solid #333' : undefined;
        return (
          <div key={idx} style={{ borderRight, borderBottom, background: '#fff' }}>
            <BoardCell
              state={cell}
              isGiven={puzzle[idx] !== 0}
              isLastHost={idx === lastHostCell}
              isLastGuest={idx === lastGuestCell}
            />
          </div>
        );
      })}
    </div>
  );
}

function StatsPanel({
  label,
  color,
  moves,
  atMs,
}: {
  label: string;
  color: string;
  moves: MoveRecord[];
  atMs: number;
}): ReactElement {
  const visible = moves.filter((m) => m.t <= atMs);
  const errors = visible.filter((m) => !m.ok && m.val !== 0).length;
  const fills = visible.filter((m) => m.ok && m.val !== 0).length;
  const finishMove = moves.filter((m) => m.t <= atMs).at(-1);
  const finishMs = finishMove ? finishMove.t : null;

  return (
    <div style={{ textAlign: 'center', minWidth: 80 }}>
      <div style={{ fontSize: '0.75rem', fontWeight: 700, color, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: '0.7rem', color: '#555' }}>
        {t('duo.reviewFills')} {fills} / {t('duo.reviewErrors')} {errors}
      </div>
      {finishMs !== null && <div style={{ fontSize: '0.65rem', color: '#888' }}>{(finishMs / 1000).toFixed(1)}s</div>}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────

const SPEEDS = [1, 2, 4];

export function DuoReviewScreen(): ReactElement | null {
  const { visible, hostMoves, guestMoves, hostAlias, guestAlias, puzzle, close } = useDuoReviewStore();

  const duration = totalDuration(hostMoves, guestMoves);
  const [playheadMs, setPlayheadMs] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speedIdx, setSpeedIdx] = useState(0);
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number>(0);

  // No reset effect needed: AppShell unmounts this component when visible=false,
  // so useState always starts fresh on each open.

  // Playback loop
  useEffect(() => {
    if (!playing) {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      return;
    }
    lastTsRef.current = performance.now();
    const tick = (now: number) => {
      const delta = now - lastTsRef.current;
      lastTsRef.current = now;
      setPlayheadMs((prev) => {
        const next = prev + delta * SPEEDS[speedIdx];
        if (next >= duration) {
          setPlaying(false);
          return duration;
        }
        return next;
      });
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [playing, speedIdx, duration]);

  const handleScrub = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setPlayheadMs(Number(e.target.value));
    setPlaying(false);
  }, []);

  const togglePlay = useCallback(() => {
    setPlaying((p) => {
      if (!p && playheadMs >= duration) {
        setPlayheadMs(0);
        return true;
      }
      return !p;
    });
  }, [playheadMs, duration]);

  const stepForward = useCallback(() => {
    setPlaying(false);
    const allT = [...hostMoves, ...guestMoves]
      .map((m) => m.t)
      .filter((t) => t > playheadMs)
      .sort((a, b) => a - b);
    if (allT.length) setPlayheadMs(allT[0]);
  }, [hostMoves, guestMoves, playheadMs]);

  const stepBack = useCallback(() => {
    setPlaying(false);
    const allT = [...hostMoves, ...guestMoves]
      .map((m) => m.t)
      .filter((t) => t < playheadMs)
      .sort((a, b) => b - a);
    if (allT.length) setPlayheadMs(allT[0]);
    else setPlayheadMs(0);
  }, [hostMoves, guestMoves, playheadMs]);

  if (!visible) return null;

  const cells = buildSnapshot(puzzle, hostMoves, guestMoves, playheadMs);

  const lastHostMove = [...hostMoves].filter((m) => m.t <= playheadMs).at(-1);
  const lastGuestMove = [...guestMoves].filter((m) => m.t <= playheadMs).at(-1);
  const lastHostCell = lastHostMove?.val !== 0 ? (lastHostMove?.cell ?? -1) : -1;
  const lastGuestCell = lastGuestMove?.val !== 0 ? (lastGuestMove?.cell ?? -1) : -1;

  const speed = SPEEDS[speedIdx];

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9000,
        background: 'rgba(0,0,0,0.92)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        padding: 16,
        boxSizing: 'border-box',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 24, width: '100%', maxWidth: 500 }}>
        <span
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            color: '#60a5fa',
            fontWeight: 700,
            fontSize: '0.9rem',
          }}
        >
          <span style={{ width: 10, height: 10, background: '#60a5fa', display: 'inline-block', borderRadius: 2 }} />
          {hostAlias || 'Host'}
        </span>
        <span style={{ color: '#fff', fontSize: '0.8rem', flex: 1, textAlign: 'center' }}>{t('duo.reviewTitle')}</span>
        <span
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            color: '#fb923c',
            fontWeight: 700,
            fontSize: '0.9rem',
          }}
        >
          {guestAlias || 'Guest'}
          <span style={{ width: 10, height: 10, background: '#fb923c', display: 'inline-block', borderRadius: 2 }} />
        </span>
      </div>

      {/* Board */}
      <Board puzzle={puzzle} cells={cells} lastHostCell={lastHostCell} lastGuestCell={lastGuestCell} />

      {/* Stats */}
      <div style={{ display: 'flex', gap: 32 }}>
        <StatsPanel label={hostAlias || 'Host'} color="#60a5fa" moves={hostMoves} atMs={playheadMs} />
        <StatsPanel label={guestAlias || 'Guest'} color="#fb923c" moves={guestMoves} atMs={playheadMs} />
      </div>

      {/* Scrubber */}
      <div style={{ width: '100%', maxWidth: 500 }}>
        <input
          type="range"
          min={0}
          max={duration}
          step={100}
          value={playheadMs}
          onChange={handleScrub}
          style={{ width: '100%', accentColor: '#a78bfa' }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', color: '#888', fontSize: '0.65rem' }}>
          <span>{(playheadMs / 1000).toFixed(1)}s</span>
          <span>{(duration / 1000).toFixed(1)}s</span>
        </div>
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <button onClick={stepBack} style={btnStyle}>
          {t('duo.reviewPrev')}
        </button>
        <button onClick={togglePlay} style={{ ...btnStyle, minWidth: 60 }}>
          {playing ? t('duo.reviewPause') : t('duo.reviewPlay')}
        </button>
        <button onClick={stepForward} style={btnStyle}>
          {t('duo.reviewNext')}
        </button>
        <button onClick={() => setSpeedIdx((i) => (i + 1) % SPEEDS.length)} style={{ ...btnStyle, minWidth: 48 }}>
          {speed}x
        </button>
      </div>

      {/* Close */}
      <button onClick={close} style={{ ...btnStyle, marginTop: 4, background: 'rgba(255,255,255,0.1)' }}>
        {t('duo.reviewClose')}
      </button>
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.15)',
  border: '1px solid rgba(255,255,255,0.2)',
  color: '#fff',
  borderRadius: 8,
  padding: '8px 14px',
  cursor: 'pointer',
  fontSize: '0.9rem',
};
