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

/**
 * Determine which technique justifies a specific action on the given board.
 * Detectors are tried simplest-first; returns the first match.
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
