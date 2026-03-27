// Cinematic technique demo — anticipation → strike → reward (~3.5s)

import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import type { TeachModuleModel } from '../../../entities/teach';
import { ChainOverlay } from './ChainOverlay';

type Props = {
  module: TeachModuleModel;
};

type DemoPhase = 'idle' | 'glow' | 'chain' | 'pause' | 'name' | 'eliminate' | 'count' | 'afterglow' | 'done';

function getNotes(notes: Record<string, number[]>, idx: number): number[] {
  return notes[String(idx)] ?? notes[String(Number(idx))] ?? [];
}

export function DemoBoard({ module }: Props): ReactElement {
  const boardRef = useRef<HTMLDivElement | null>(null);
  const [phase, setPhase] = useState<DemoPhase>('idle');
  const [elimIdx, setElimIdx] = useState(-1);

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

  // ── Timeline: anticipation → strike → reward ──────────────────
  useEffect(() => {
    if (!example || elimCount === 0) return;
    const t: ReturnType<typeof setTimeout>[] = [];

    // Phase 1: Setup (0-800ms)
    t.push(setTimeout(() => setPhase('glow'), 400));

    // Phase 2: Tension (800-1600ms)
    t.push(setTimeout(() => setPhase('chain'), 800));
    t.push(setTimeout(() => setPhase('pause'), 1400)); // bow fully drawn

    // Phase 3: Strike (1600ms+)
    t.push(setTimeout(() => setPhase('name'), 1600));
    for (let i = 0; i < elimCount; i++) {
      t.push(setTimeout(() => setElimIdx(i), 1900 + i * 300));
    }
    t.push(
      setTimeout(() => setPhase('eliminate'), 1900), // sync with first elim
    );

    // Phase 4: Reward
    const elimEnd = 1900 + elimCount * 300;
    t.push(setTimeout(() => setPhase('count'), elimEnd + 200));
    t.push(setTimeout(() => setPhase('afterglow'), elimEnd + 600));
    t.push(setTimeout(() => setPhase('done'), elimEnd + 1200));

    return () => t.forEach(clearTimeout);
  }, [example, elimCount]);

  if (!example) return <div className="teach-board" />;

  const showGlow = phase !== 'idle';
  const showChain = phase !== 'idle' && phase !== 'glow';
  const isStrike =
    phase === 'name' || phase === 'eliminate' || phase === 'count' || phase === 'afterglow' || phase === 'done';
  const showName = phase === 'name' || phase === 'eliminate';
  const showCount = phase === 'count' || phase === 'afterglow' || phase === 'done';
  const showAfterglow = phase === 'afterglow';

  return (
    <div className={`demo-board-wrapper ${showAfterglow ? 'demo-afterglow' : ''}`}>
      <div className="teach-board" ref={boardRef}>
        {Array.from({ length: 81 }, (_, i) => {
          const value = Number(example.board[i] ?? 0);
          const noteArr = getNotes(example.notes, i);
          const isFocus = focusCells.includes(i);
          const isElimTarget = elimCellSet.has(i);

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
    </div>
  );
}
