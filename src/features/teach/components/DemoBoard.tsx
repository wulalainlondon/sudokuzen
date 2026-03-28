// Cinematic technique demo — anticipation → strike → reward (~3.5s)

import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import type { TeachModuleModel } from '../../../entities/teach';
import { ChainOverlay } from './ChainOverlay';

type Props = {
  module: TeachModuleModel;
};

type DemoPhase = 'idle' | 'glow' | 'chain' | 'pause' | 'name' | 'eliminate' | 'count' | 'afterglow' | 'done';
type LockedStoryboard = {
  digit: number;
  sourcePair: number[];
  targetCells: number[];
  row: number;
};

function getNotes(notes: Record<string, number[]>, idx: number): number[] {
  return notes[String(idx)] ?? notes[String(Number(idx))] ?? [];
}

export function DemoBoard({ module }: Props): ReactElement {
  const boardRef = useRef<HTMLDivElement | null>(null);
  const [phase, setPhase] = useState<DemoPhase>('idle');
  const [elimIdx, setElimIdx] = useState(-1);
  const [awaitContinue, setAwaitContinue] = useState(false);

  const example = module.example;

  const { focusCells, eliminates, elimCount, elimCellSet } = useMemo(() => {
    if (!example)
      return {
        focusCells: [] as number[],
        eliminates: [] as { cell: number; digit: number }[],
        elimCount: 0,
        elimCellSet: new Set<number>(),
      };
    const elimStep = example.steps.find((s) => s.eliminateCells.length > 0);
    const allFocus = new Set<number>();
    for (const s of example.steps) {
      for (const c of s.focusCells) allFocus.add(c);
    }
    const elims = elimStep?.eliminateCells ?? [];
    return {
      focusCells: [...allFocus],
      eliminates: elims,
      elimCount: elims.length,
      elimCellSet: new Set(elims.map((e) => e.cell)),
    };
  }, [example]);

  const lockedStoryboard = useMemo<LockedStoryboard | null>(() => {
    if (!example || module.technique !== 'locked_candidates') return null;
    const elimStep = example.steps.find((s) => s.eliminateCells.length > 0);
    const digit = elimStep?.eliminateCells?.[0]?.digit ?? 0;
    if (!digit) return null;

    const candidateCells = new Set<number>();
    for (const step of example.steps) {
      for (const c of step.focusCells) {
        const highlighted = step.highlightDigits?.[String(c)]?.includes(digit) ?? false;
        const notes = getNotes(example.notes, c);
        if (highlighted || notes.includes(digit)) candidateCells.add(c);
      }
    }

    type RowBucket = { row: number; box: number; cells: number[] };
    const buckets = new Map<string, RowBucket>();
    for (const cell of candidateCells) {
      const row = Math.floor(cell / 9);
      const col = cell % 9;
      const box = Math.floor(row / 3) * 3 + Math.floor(col / 3);
      const key = `${row}:${box}`;
      const existing = buckets.get(key);
      if (existing) existing.cells.push(cell);
      else buckets.set(key, { row, box, cells: [cell] });
    }

    const candidates = [...buckets.values()]
      .map((b) => ({ ...b, cells: b.cells.sort((a, b) => (a % 9) - (b % 9)) }))
      .filter((b) => b.cells.length >= 2)
      .sort((a, b) => {
        // Prefer middle box (#4), then cells nearer board center.
        const centerBias = (bucket: RowBucket) =>
          Math.abs(Math.floor(bucket.row / 3) - 1) + Math.abs((bucket.box % 3) - 1);
        const aMid = a.box === 4 ? -2 : 0;
        const bMid = b.box === 4 ? -2 : 0;
        return aMid - bMid || centerBias(a) - centerBias(b);
      });

    const chosen = candidates[0];
    if (!chosen) return null;
    const sourcePair = chosen.cells.slice(0, 2);

    const targetCells = eliminates
      .filter((e) => e.digit === digit && Math.floor(e.cell / 9) === chosen.row)
      .map((e) => e.cell)
      .sort((a, b) => (a % 9) - (b % 9));

    if (sourcePair.length < 2 || targetCells.length === 0) return null;
    return {
      digit,
      sourcePair,
      targetCells,
      row: chosen.row,
    };
  }, [example, module.technique, eliminates]);

  // ── Guided timeline: cinematic + reading checkpoints ──────────
  useEffect(() => {
    if (!example || elimCount === 0 || awaitContinue) return;

    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    if (phase === 'idle') {
      timeoutId = setTimeout(() => setPhase('glow'), 200);
    } else if (phase === 'glow') {
      timeoutId = setTimeout(() => {
        setPhase('chain');
        setAwaitContinue(true);
      }, 360);
    } else if (phase === 'pause') {
      timeoutId = setTimeout(() => {
        setPhase('name');
        setAwaitContinue(true);
      }, 180);
    } else if (phase === 'eliminate') {
      let idx = 0;
      intervalId = setInterval(() => {
        setElimIdx(idx);
        idx += 1;
        if (idx >= elimCount) {
          if (intervalId) clearInterval(intervalId);
          setTimeout(() => setPhase('count'), 120);
        }
      }, 220);
    } else if (phase === 'count') {
      timeoutId = setTimeout(() => setPhase('afterglow'), 420);
    } else if (phase === 'afterglow') {
      timeoutId = setTimeout(() => setPhase('done'), 520);
    }

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      if (intervalId) clearInterval(intervalId);
    };
  }, [example, elimCount, phase, awaitContinue]);

  if (!example) return <div className="teach-board" />;

  const isLockedStoryboard = !!lockedStoryboard;
  const cameraClass = phase === 'chain' || phase === 'pause' ? 'camera-zoom-in' : '';

  const showGlow = phase !== 'idle';
  const showChain = phase !== 'idle' && phase !== 'glow' && !isLockedStoryboard;
  const isStrike =
    phase === 'name' || phase === 'eliminate' || phase === 'count' || phase === 'afterglow' || phase === 'done';
  const showName = phase === 'name' || phase === 'eliminate';
  const showCount = phase === 'count' || phase === 'afterglow' || phase === 'done';
  const showAfterglow = phase === 'afterglow';
  const showLockedRings = isLockedStoryboard && (phase === 'chain' || phase === 'pause');
  const showLockedArrows = isLockedStoryboard && (phase === 'name' || phase === 'eliminate');

  const sourceRightCol = lockedStoryboard ? Math.max(...lockedStoryboard.sourcePair.map((c) => c % 9)) : 0;
  const sourceAnchorX = ((sourceRightCol + 0.62) / 9) * 100;
  const sourceAnchorY = lockedStoryboard ? ((lockedStoryboard.row + 0.5) / 9) * 100 : 50;

  const liveCaption = (() => {
    if (lockedStoryboard) {
      const d = lockedStoryboard.digit;
      const r = lockedStoryboard.row + 1;
      if (phase === 'idle' || phase === 'glow') return '先掃全盤，抓關鍵。';
      if (phase === 'chain') return `中宮雙 ${d}：鎖定成立。`;
      if (phase === 'pause') return '理解這一步，就贏一半。';
      if (phase === 'name') return `回全盤：第 ${r} 列向右排除。`;
      if (phase === 'eliminate') {
        const p = Math.min(Math.max(elimIdx + 1, 0), elimCount);
        return `刪除多餘 ${d}（${p}/${elimCount}）`;
      }
      if (phase === 'count' || phase === 'afterglow' || phase === 'done') {
        return `結論：第 ${r} 列清掉 ${elimCount} 個 ${d}。`;
      }
    }

    if (phase === 'idle' || phase === 'glow') return '先看全盤，定位線索。';
    if (phase === 'chain' || phase === 'pause') return '連線成因果，準備出手。';
    if (phase === 'name') return `${module.name}：開始清理。`;
    if (phase === 'eliminate') {
      const p = Math.min(Math.max(elimIdx + 1, 0), elimCount);
      return `消去不成立候選（${p}/${elimCount}）`;
    }
    if (phase === 'count' || phase === 'afterglow' || phase === 'done') {
      return `結論成立：共清掉 ${elimCount} 個候選。`;
    }
    return '';
  })();

  const handleContinue = () => {
    if (phase === 'chain') {
      setAwaitContinue(false);
      setPhase('pause');
      return;
    }
    if (phase === 'name') {
      setElimIdx(-1);
      setAwaitContinue(false);
      setPhase('eliminate');
    }
  };

  return (
    <div className={`demo-board-wrapper ${showAfterglow ? 'demo-afterglow' : ''} ${cameraClass}`}>
      <div className="demo-camera-frame">
        <div className="teach-board" ref={boardRef}>
          {Array.from({ length: 81 }, (_, i) => {
            const value = Number(example.board[i] ?? 0);
            const noteArr = getNotes(example.notes, i);
            const isFocus = focusCells.includes(i);
            const isElimTarget = elimCellSet.has(i);
            const isStorySourceCell = lockedStoryboard?.sourcePair.includes(i) ?? false;

            // Check if this cell+digit has been eliminated so far
            let elimDigit = -1;
            if (isStrike) {
              for (let ei = 0; ei <= elimIdx && ei < eliminates.length; ei++) {
                if (eliminates[ei].cell === i) elimDigit = eliminates[ei].digit;
              }
            }

            let className = 'teach-cell';
            if (isFocus && showGlow) className += ' focus';
            if (isElimTarget && showGlow && !isStrike) className += ' demo-target-glow';

            return (
              <div key={i} className={className} data-idx={i}>
                {value !== 0 ? (
                  value
                ) : (
                  <div className="tc-notes">
                    {Array.from({ length: 9 }, (_, offset) => {
                      const d = offset + 1;
                      const hasDigit = noteArr.includes(d);
                      let noteClass = 'tc-note';
                      if (elimDigit === d) noteClass += ' strike';
                      if (showLockedRings && isStorySourceCell && d === lockedStoryboard?.digit) {
                        noteClass += ' demo-source-digit';
                      }
                      return (
                        <span key={d} className={noteClass} data-digit={d}>
                          {hasDigit ? d : ''}
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          {showChain && focusCells.length >= 2 && (
            <ChainOverlay boardRef={boardRef} cells={focusCells} eliminateCells={[]} animate />
          )}
        </div>

        {isLockedStoryboard && (
          <svg className="demo-story-overlay" viewBox="0 0 100 100" preserveAspectRatio="none">
            {showLockedRings &&
              lockedStoryboard.sourcePair.map((cell) => {
                const col = cell % 9;
                const row = Math.floor(cell / 9);
                const cx = ((col + 0.5) / 9) * 100;
                const cy = ((row + 0.5) / 9) * 100;
                return <circle key={`ring-${cell}`} className="demo-source-ring" cx={cx} cy={cy} r={4.2} />;
              })}

            {showLockedArrows &&
              lockedStoryboard.targetCells.map((cell) => {
                const col = cell % 9;
                const row = Math.floor(cell / 9);
                const tx = ((col + 0.5) / 9) * 100;
                const ty = ((row + 0.5) / 9) * 100;
                const cx = (sourceAnchorX + tx) / 2 + 2.5;
                const cy = sourceAnchorY - 1.4;
                return (
                  <g key={`arrow-${cell}`} className="demo-story-arrow">
                    <path d={`M ${sourceAnchorX} ${sourceAnchorY} Q ${cx} ${cy}, ${tx} ${ty}`} />
                    <circle cx={tx} cy={ty} r={1.2} />
                  </g>
                );
              })}
          </svg>
        )}
      </div>

      {/* Technique name — appears right before elimination */}
      {showName && (
        <div className="demo-technique-name" key="name">
          {module.name}
        </div>
      )}

      {/* Elimination count — the reward */}
      {showCount && elimCount > 0 && (
        <div className="demo-elim-count" key="count">
          −{elimCount} 候選
        </div>
      )}

      <div className="demo-live-caption" aria-live="polite">
        {liveCaption}
      </div>
      {awaitContinue && (phase === 'chain' || phase === 'name') && (
        <button className="demo-continue-btn" onClick={handleContinue}>
          已理解，繼續推理 →
        </button>
      )}
    </div>
  );
}
