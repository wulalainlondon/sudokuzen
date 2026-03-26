import { useRef, type ReactElement } from 'react';

import type { TeachExampleModel, TeachStepModel } from '../../../entities/teach';
import { ChainOverlay } from './ChainOverlay';

type Props = {
  example: TeachExampleModel | null;
  step: TeachStepModel | null;
};

function getNotes(notes: Record<string, number[]>, idx: number): number[] {
  return notes[String(idx)] ?? notes[String(Number(idx))] ?? [];
}

export function TeachBoard({ example, step }: Props): ReactElement {
  const boardRef = useRef<HTMLDivElement | null>(null);

  if (!example) {
    return <div className="teach-board" />;
  }

  const focusCells = step?.focusCells ?? [];
  const focusSet = new Set(focusCells);
  const visibleSet = new Set(step?.visibleCells ?? []);
  const hasVisibleMask = visibleSet.size > 0;
  const eliminateMap = new Map((step?.eliminateCells ?? []).map((x) => [x.cell, x.digit]));
  const eliminateIndices = (step?.eliminateCells ?? []).map((x) => x.cell);
  const warnSet = new Set(step?.warnCells ?? []);
  const warnDigit = step?.warnDigit ?? null;

  return (
    <div className="teach-board" ref={boardRef}>
      {Array.from({ length: 81 }, (_, i) => {
        const value = Number(example.board[i] ?? 0);
        const noteArr = getNotes(example.notes, i);

        let className = 'teach-cell';
        if (hasVisibleMask && !visibleSet.has(i)) className += ' masked';
        if (focusSet.has(i)) className += ' focus';
        if (eliminateMap.has(i)) className += ' eliminate';

        return (
          <div key={i} className={className} data-idx={i}>
            {value !== 0 ? (
              value
            ) : (
              <div className="tc-notes">
                {Array.from({ length: 9 }, (_, offset) => {
                  const d = offset + 1;
                  let noteClass = 'tc-note';

                  const highlight = step?.highlightDigits?.[String(i)]?.includes(d) ?? false;
                  if (highlight) noteClass += ' highlight';

                  if (eliminateMap.get(i) === d) noteClass += ' strike';

                  if (warnDigit === d && warnSet.has(i)) noteClass += ' warn-missing';

                  return (
                    <span key={d} className={noteClass} data-digit={d}>
                      {noteArr.includes(d) ? d : ''}
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {focusCells.length >= 2 && (
        <ChainOverlay boardRef={boardRef} cells={focusCells} eliminateCells={eliminateIndices} animate />
      )}
    </div>
  );
}
