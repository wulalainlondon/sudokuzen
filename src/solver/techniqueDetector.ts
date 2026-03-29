// Main entry point — given a board state and a player action, determine which technique justifies it.

import { SolverBoard } from './board';
import { DETECTOR_REGISTRY } from './registry';
import type { DetectionAction, DetectionResult, TechniqueName } from './types';

export interface TechniqueQuery {
  kind: 'fill' | 'eliminate';
  cell: number;
  digit: number;
}

export interface TechniqueAnswer {
  technique: TechniqueName;
  patternCells: number[];
  description: string;
}

// Phase 1 techniques — reasonable attribution for manual fills.
// Anything beyond these for a 'fill' action is likely player intuition, not technique usage.
const FILL_REASONABLE_TECHNIQUES = new Set<TechniqueName>([
  'naked_single',
  'hidden_single',
  'locked_candidates',
  'naked_pair',
  'hidden_pair',
  'naked_triple',
  'hidden_triple',
]);

/**
 * Determine which technique justifies a specific action on the given board.
 * Detectors are tried simplest-first; returns the first match.
 *
 * For 'fill' actions, caps attribution at Phase 1 techniques — a beginner
 * filling a number by intuition shouldn't be labeled as "Template".
 * For 'eliminate' actions, no cap — eliminations genuinely require techniques.
 */
export function detectTechnique(
  cells: { value: number; fixed: boolean; notes: number[] }[],
  query: TechniqueQuery,
): TechniqueAnswer | null {
  const board = SolverBoard.fromGameState(cells);
  const target: DetectionAction = { kind: query.kind, cell: query.cell, digit: query.digit };

  for (const detector of DETECTOR_REGISTRY) {
    try {
      const result = detector(board);
      if (
        result &&
        result.actions.some((a) => a.kind === target.kind && a.cell === target.cell && a.digit === target.digit)
      ) {
        // For fills: reject attribution if technique is beyond Phase 1
        if (query.kind === 'fill' && !FILL_REASONABLE_TECHNIQUES.has(result.technique)) {
          continue;
        }
        return {
          technique: result.technique,
          patternCells: result.patternCells,
          description: result.description,
        };
      }
    } catch {
      // Skip detector on error — don't block replay
      continue;
    }
  }
  return null;
}

/**
 * Find ALL applicable techniques on the current board (for hint/teaching).
 */
export function detectAllTechniques(cells: { value: number; fixed: boolean; notes: number[] }[]): DetectionResult[] {
  const board = SolverBoard.fromGameState(cells);
  const results: DetectionResult[] = [];
  for (const detector of DETECTOR_REGISTRY) {
    try {
      const result = detector(board);
      if (result) results.push(result);
    } catch {
      continue;
    }
  }
  return results;
}
