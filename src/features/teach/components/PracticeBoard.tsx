import { useRef, type ReactElement } from 'react';

import type { PracticeItemModel, PracticeSessionState } from '../../../entities/teach';
import { ChainOverlay } from './ChainOverlay';

type Props = {
  item: PracticeItemModel | null;
  practice: PracticeSessionState;
  onToggle: (cell: number, digit: number) => void;
};

function getNotes(notes: Record<string, number[]>, idx: number): number[] {
  return notes[String(idx)] ?? notes[String(Number(idx))] ?? [];
}

export function PracticeBoard({ item, practice, onToggle }: Props): ReactElement {
  const boardRef = useRef<HTMLDivElement | null>(null);

  if (!item) return <div className="practice-board" />;

  const selected = practice.selected;
  const correct = new Set(item.answer.eliminates.map(([c, d]) => `${c}:${d}`));
  const hintLevel = practice.hintLevel;
  const patternCells = item.answer.patternCells ?? [];
  const focusSet = new Set(hintLevel >= 1 ? patternCells : []);
  const eliminateIndices = practice.revealed ? item.answer.eliminates.map(([c]) => c) : [];

  // Show chain when hint >= 1 (pattern cells highlighted) and we have 2+ cells
  const showChain = hintLevel >= 1 && patternCells.length >= 2;

  return (
    <div className="practice-board" id="react-practice-board" ref={boardRef}>
      {Array.from({ length: 81 }, (_, i) => {
        const value = Number(item.board[i] ?? 0);
        const given = Number(item.given[i] ?? 0);
        const noteArr = getNotes(item.notes, i);

        let cellClass = 'practice-cell';
        if (given !== 0) cellClass += ' given-cell';
        if (focusSet.has(i)) cellClass += ' focus';

        return (
          <div key={i} className={cellClass} data-idx={i}>
            {value !== 0 ? (
              value
            ) : (
              <div className="tc-notes">
                {Array.from({ length: 9 }, (_, offset) => {
                  const d = offset + 1;
                  const hasDigit = noteArr.includes(d);
                  const key = `${i}:${d}`;
                  let noteClass = 'tc-note';

                  if (selected.has(key)) noteClass += ' strike';
                  if (practice.tone === 'error' && selected.has(key) && !correct.has(key)) noteClass += ' wrong';
                  if (practice.revealed && correct.has(key)) noteClass += ' correct-reveal';

                  return (
                    <span
                      key={d}
                      className={noteClass}
                      data-cell={i}
                      data-digit={d}
                      onClick={() => hasDigit && !practice.revealed && onToggle(i, d)}
                    >
                      {hasDigit ? d : ''}
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {showChain && <ChainOverlay boardRef={boardRef} cells={patternCells} eliminateCells={eliminateIndices} animate />}
    </div>
  );
}
