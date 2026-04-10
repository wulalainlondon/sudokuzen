import { useRef, type ReactElement } from 'react';

import type { PracticeItemModel, PracticeSessionState } from '../../../entities/teach';
import { ChainOverlay } from './ChainOverlay';

type Props = {
  item: PracticeItemModel | null;
  practice: PracticeSessionState;
  onToggle: (cell: number, digit: number) => void;
  onToggleFill: (cell: number, digit: number) => void;
};

function getNotes(notes: Record<string, number[]>, idx: number): number[] {
  return notes[String(idx)] ?? notes[String(Number(idx))] ?? [];
}

function elimKey(cell: number, digit: number): string {
  return `elim:${cell}:${digit}`;
}

function fillKey(cell: number, digit: number): string {
  return `fill:${cell}:${digit}`;
}

export function PracticeBoard({ item, practice, onToggle, onToggleFill }: Props): ReactElement {
  const boardRef = useRef<HTMLDivElement | null>(null);

  if (!item) return <div className="practice-board" />;

  const selected = practice.selected;
  const correctElim = new Set(item.answer.eliminates.map(([c, d]) => elimKey(c, d)));
  const correctFill = new Set((item.answer.fills ?? []).map(([c, d]) => fillKey(c, d)));
  const fillTargets = new Map((item.answer.fills ?? []).map(([c, d]) => [c, d]));
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
        const fillDigit = fillTargets.get(i);
        const fillSelection = fillDigit !== undefined ? fillKey(i, fillDigit) : null;

        let cellClass = 'practice-cell';
        if (given !== 0) cellClass += ' given-cell';
        if (focusSet.has(i)) cellClass += ' focus';
        if (fillSelection && selected.has(fillSelection)) cellClass += ' fill-selected';
        if (practice.revealed && fillSelection && correctFill.has(fillSelection)) cellClass += ' fill-correct';
        if (
          practice.tone === 'error' &&
          fillSelection &&
          selected.has(fillSelection) &&
          !correctFill.has(fillSelection)
        )
          cellClass += ' fill-wrong';

        return (
          <div
            key={i}
            className={cellClass}
            data-idx={i}
            onClick={() => {
              if (fillDigit === undefined || practice.revealed || given !== 0 || value !== 0) return;
              onToggleFill(i, fillDigit);
            }}
          >
            {value !== 0 ? (
              value
            ) : (
              <div className="tc-notes">
                {Array.from({ length: 9 }, (_, offset) => {
                  const d = offset + 1;
                  const hasDigit = noteArr.includes(d);
                  const elimSelection = elimKey(i, d);
                  const fillSelectionForDigit = fillKey(i, d);
                  let noteClass = 'tc-note';

                  if (selected.has(elimSelection)) noteClass += ' strike';
                  if (selected.has(fillSelectionForDigit)) noteClass += ' fill-pick';
                  if (practice.tone === 'error' && selected.has(elimSelection) && !correctElim.has(elimSelection))
                    noteClass += ' wrong';
                  if (
                    practice.tone === 'error' &&
                    selected.has(fillSelectionForDigit) &&
                    !correctFill.has(fillSelectionForDigit)
                  )
                    noteClass += ' wrong';
                  if (practice.revealed && correctElim.has(elimSelection)) noteClass += ' correct-reveal';
                  if (practice.revealed && correctFill.has(fillSelectionForDigit)) noteClass += ' fill-correct-reveal';

                  return (
                    <span
                      key={d}
                      className={noteClass}
                      data-cell={i}
                      data-digit={d}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!hasDigit || practice.revealed) return;
                        if (fillDigit === d) {
                          onToggleFill(i, d);
                          return;
                        }
                        onToggle(i, d);
                      }}
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
