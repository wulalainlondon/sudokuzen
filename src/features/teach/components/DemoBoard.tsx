// Cinematic technique demo — auto-plays the full technique in ~2.5s
// Shows: board → chain lights up → technique name flash → candidates eliminated → count

import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import type { TeachModuleModel } from '../../../entities/teach';
import { ChainOverlay } from './ChainOverlay';

type Props = {
  module: TeachModuleModel;
};

type DemoPhase = 'idle' | 'chain' | 'name' | 'eliminate' | 'count' | 'done';

function getNotes(notes: Record<string, number[]>, idx: number): number[] {
  return notes[String(idx)] ?? notes[String(Number(idx))] ?? [];
}

export function DemoBoard({ module }: Props): ReactElement {
  const boardRef = useRef<HTMLDivElement | null>(null);
  const [phase, setPhase] = useState<DemoPhase>('idle');
  const [elimIdx, setElimIdx] = useState(-1);

  const example = module.example;

  // Collect data from steps (computed once)
  const { focusCells, eliminates, elimCount } = useMemo(() => {
    if (!example)
      return { focusCells: [] as number[], eliminates: [] as { cell: number; digit: number }[], elimCount: 0 };
    const elimStep = example.steps.find((s) => s.eliminateCells.length > 0);
    const allFocus = new Set<number>();
    for (const s of example.steps) {
      for (const c of s.focusCells) allFocus.add(c);
    }
    const elims = elimStep?.eliminateCells ?? [];
    return { focusCells: [...allFocus], eliminates: elims, elimCount: elims.length };
  }, [example]);

  // Auto-play sequence
  useEffect(() => {
    if (!example || elimCount === 0) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    timers.push(setTimeout(() => setPhase('chain'), 300));
    timers.push(setTimeout(() => setPhase('name'), 700));
    timers.push(setTimeout(() => setPhase('eliminate'), 1400));
    for (let i = 0; i < elimCount; i++) {
      timers.push(setTimeout(() => setElimIdx(i), 1400 + i * 180));
    }
    const totalElimTime = 1400 + elimCount * 180 + 300;
    timers.push(setTimeout(() => setPhase('count'), totalElimTime));
    timers.push(setTimeout(() => setPhase('done'), totalElimTime + 800));
    return () => timers.forEach(clearTimeout);
  }, [example, elimCount]);

  if (!example) return <div className="teach-board" />;

  const showChain = phase !== 'idle';
  const showName = phase === 'name' || phase === 'eliminate' || phase === 'count';

  return (
    <div className="demo-board-wrapper">
      <div className="teach-board" ref={boardRef}>
        {Array.from({ length: 81 }, (_, i) => {
          const value = Number(example.board[i] ?? 0);
          const noteArr = getNotes(example.notes, i);
          const isFocus = focusCells.includes(i);

          let elimDigit = -1;
          if (phase === 'eliminate' || phase === 'count' || phase === 'done') {
            for (let ei = 0; ei <= elimIdx && ei < eliminates.length; ei++) {
              if (eliminates[ei].cell === i) elimDigit = eliminates[ei].digit;
            }
          }

          let className = 'teach-cell';
          if (isFocus && showChain) className += ' focus';

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

      {showName && (
        <div className="demo-technique-name" key="name">
          {module.name}
        </div>
      )}

      {(phase === 'count' || phase === 'done') && elimCount > 0 && (
        <div className="demo-elim-count" key="count">
          −{elimCount} 候選
        </div>
      )}
    </div>
  );
}
