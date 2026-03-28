// Cinematic technique demo — plays a DemoStory if available, otherwise auto-generated.
// No user interaction during playback. "Replay" button after completion.

import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import type { DemoAct, DemoStory, TeachModuleModel } from '../../../entities/teach';
import { ChainOverlay } from './ChainOverlay';

type Props = {
  module: TeachModuleModel;
};

function getNotes(notes: Record<string, number[]>, idx: number): number[] {
  return notes[String(idx)] ?? notes[String(Number(idx))] ?? [];
}

// ── Story-driven demo (new system) ──────────────────────────────

function StoryDemoBoard({ module, story }: { module: TeachModuleModel; story: DemoStory }): ReactElement {
  const boardRef = useRef<HTMLDivElement | null>(null);
  const [actIndex, setActIndex] = useState(0);
  const [elimProgress, setElimProgress] = useState(-1);
  const [done, setDone] = useState(false);

  const example = module.example!;
  const act = story.acts[actIndex] as DemoAct | undefined;

  // Auto-advance through acts
  useEffect(() => {
    if (done || !act) return;

    const h = act.highlight;
    const elims = h.eliminates ?? [];

    if (elims.length > 0) {
      // Animate eliminates sequentially within this act
      let idx = 0;
      const interval = setInterval(() => {
        setElimProgress(idx);
        idx++;
        if (idx >= elims.length) {
          clearInterval(interval);
          // Wait a bit then advance
          setTimeout(
            () => {
              if (actIndex < story.acts.length - 1) {
                setActIndex((i) => i + 1);
                setElimProgress(-1);
              } else {
                setDone(true);
              }
            },
            Math.max(act.durationMs - elims.length * 180, 300),
          );
        }
      }, 180);
      return () => clearInterval(interval);
    }

    const timer = setTimeout(() => {
      if (actIndex < story.acts.length - 1) {
        setActIndex((i) => i + 1);
      } else {
        setDone(true);
      }
    }, act.durationMs);
    return () => clearTimeout(timer);
  }, [actIndex, done, act, story.acts.length]);

  const handleReplay = () => {
    setActIndex(0);
    setElimProgress(-1);
    setDone(false);
  };

  if (!act && !done) return <div className="teach-board" />;

  // Compute visual state from current act
  const currentHighlight = done ? story.acts[story.acts.length - 1]?.highlight : act?.highlight;
  const focusCells = new Set(currentHighlight?.cells ?? []);
  const ringDigits = currentHighlight?.digits ?? {};
  const unitHighlights = new Set(currentHighlight?.units ?? []);
  const camera = currentHighlight?.camera ?? 'none';
  const cameraClass = camera === 'in' ? 'camera-zoom-in' : '';

  // Eliminates: show all from completed acts + progress of current act
  const completedElims: { cell: number; digit: number }[] = [];
  for (let i = 0; i < (done ? story.acts.length : actIndex); i++) {
    const a = story.acts[i].highlight.eliminates;
    if (a) completedElims.push(...a);
  }
  if (!done && act?.highlight.eliminates) {
    for (let i = 0; i <= elimProgress && i < act.highlight.eliminates.length; i++) {
      completedElims.push(act.highlight.eliminates[i]);
    }
  }
  const elimSet = new Map<number, number>(); // cell → digit
  for (const e of completedElims) elimSet.set(e.cell, e.digit);

  const caption = done ? (story.acts[story.acts.length - 1]?.caption ?? '') : (act?.caption ?? '');

  return (
    <div className={`demo-board-wrapper ${cameraClass}`}>
      <div className="demo-camera-frame">
        <div className="teach-board" ref={boardRef}>
          {Array.from({ length: 81 }, (_, i) => {
            const value = Number(example.board[i] ?? 0);
            const noteArr = getNotes(example.notes, i);
            const isFocus = focusCells.has(i);
            const cellRingDigits = ringDigits[String(i)] ?? [];
            const elimDigit = elimSet.get(i) ?? -1;

            // Unit highlight: check if cell belongs to a highlighted unit
            const row = Math.floor(i / 9);
            const col = i % 9;
            const box = Math.floor(row / 3) * 3 + Math.floor(col / 3);
            const inHighlightedUnit =
              unitHighlights.has(row) || unitHighlights.has(9 + col) || unitHighlights.has(18 + box);

            let className = 'teach-cell';
            if (isFocus) className += ' focus';
            if (inHighlightedUnit && !isFocus) className += ' demo-unit-highlight';

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
                      if (cellRingDigits.includes(d)) noteClass += ' demo-source-digit';
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
        </div>
      </div>

      {/* Elimination count after final act */}
      {done && completedElims.length > 0 && <div className="demo-elim-count">−{completedElims.length} 候選</div>}

      <div className="demo-live-caption" aria-live="polite">
        {caption}
      </div>

      {done && (
        <button className="demo-continue-btn" onClick={handleReplay}>
          🔄 再看一次
        </button>
      )}
    </div>
  );
}

// ── Legacy auto-generated demo (for techniques without demoStory) ──

type LegacyPhase = 'idle' | 'glow' | 'chain' | 'pause' | 'name' | 'eliminate' | 'count' | 'afterglow' | 'done';

function LegacyDemoBoard({ module }: Props): ReactElement {
  const boardRef = useRef<HTMLDivElement | null>(null);
  const [phase, setPhase] = useState<LegacyPhase>('idle');
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
    for (const s of example.steps) for (const c of s.focusCells) allFocus.add(c);
    const elims = elimStep?.eliminateCells ?? [];
    return {
      focusCells: [...allFocus],
      eliminates: elims,
      elimCount: elims.length,
      elimCellSet: new Set(elims.map((e) => e.cell)),
    };
  }, [example]);

  useEffect(() => {
    if (!example || elimCount === 0) return;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    if (phase === 'idle') timeoutId = setTimeout(() => setPhase('glow'), 200);
    else if (phase === 'glow') timeoutId = setTimeout(() => setPhase('chain'), 400);
    else if (phase === 'chain') timeoutId = setTimeout(() => setPhase('pause'), 600);
    else if (phase === 'pause') timeoutId = setTimeout(() => setPhase('name'), 300);
    else if (phase === 'name')
      timeoutId = setTimeout(() => {
        setElimIdx(-1);
        setPhase('eliminate');
      }, 500);
    else if (phase === 'eliminate') {
      let idx = 0;
      intervalId = setInterval(() => {
        setElimIdx(idx);
        idx++;
        if (idx >= elimCount) {
          if (intervalId) clearInterval(intervalId);
          setTimeout(() => setPhase('count'), 120);
        }
      }, 180);
    } else if (phase === 'count') timeoutId = setTimeout(() => setPhase('afterglow'), 400);
    else if (phase === 'afterglow') timeoutId = setTimeout(() => setPhase('done'), 500);

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      if (intervalId) clearInterval(intervalId);
    };
  }, [example, elimCount, phase]);

  const handleReplay = () => {
    setPhase('idle');
    setElimIdx(-1);
  };

  if (!example) return <div className="teach-board" />;

  const showGlow = phase !== 'idle';
  const showChain = phase !== 'idle' && phase !== 'glow';
  const isStrike =
    phase === 'name' || phase === 'eliminate' || phase === 'count' || phase === 'afterglow' || phase === 'done';
  const showName = phase === 'name' || phase === 'eliminate';
  const showCount = phase === 'count' || phase === 'afterglow' || phase === 'done';
  const showAfterglow = phase === 'afterglow';
  const cameraClass = phase === 'chain' || phase === 'pause' ? 'camera-zoom-in' : '';

  const liveCaption = (() => {
    if (phase === 'idle' || phase === 'glow') return '先看全盤，定位線索。';
    if (phase === 'chain' || phase === 'pause') return '連線成因果，準備出手。';
    if (phase === 'name') return `${module.name}：開始清理。`;
    if (phase === 'eliminate') {
      const p = Math.min(Math.max(elimIdx + 1, 0), elimCount);
      return `消去不成立候選（${p}/${elimCount}）`;
    }
    if (phase === 'count' || phase === 'afterglow' || phase === 'done') return `結論成立：共清掉 ${elimCount} 個候選。`;
    return '';
  })();

  return (
    <div className={`demo-board-wrapper ${showAfterglow ? 'demo-afterglow' : ''} ${cameraClass}`}>
      <div className="demo-camera-frame">
        <div className="teach-board" ref={boardRef}>
          {Array.from({ length: 81 }, (_, i) => {
            const value = Number(example.board[i] ?? 0);
            const noteArr = getNotes(example.notes, i);
            const isFocus = focusCells.includes(i);
            const isElimTarget = elimCellSet.has(i);
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
      </div>

      {showName && <div className="demo-technique-name">{module.name}</div>}
      {showCount && elimCount > 0 && <div className="demo-elim-count">−{elimCount} 候選</div>}
      <div className="demo-live-caption" aria-live="polite">
        {liveCaption}
      </div>
      {phase === 'done' && (
        <button className="demo-continue-btn" onClick={handleReplay}>
          🔄 再看一次
        </button>
      )}
    </div>
  );
}

// ── Entry point ─────────────────────────────────────────────────

export function DemoBoard({ module }: Props): ReactElement {
  if (module.demoStory && module.example) {
    return <StoryDemoBoard module={module} story={module.demoStory} />;
  }
  return <LegacyDemoBoard module={module} />;
}
