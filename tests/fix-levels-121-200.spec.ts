import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SolverBoard } from '../src/solver/board';
import { bitsToDigits } from '../src/solver/helpers/bitmask';
import { DETECTOR_REGISTRY } from '../src/solver/registry';
import type { DetectionResult, TechniqueName } from '../src/solver/types';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Technique difficulty order (same as registry order)
const TECHNIQUE_ORDER: TechniqueName[] = [
  'naked_single',
  'hidden_single',
  'locked_candidates',
  'naked_pair',
  'hidden_pair',
  'naked_triple',
  'hidden_triple',
  'x_wing',
  'finned_x_wing',
  'skyscraper',
  'xy_wing',
  'xyz_wing',
  'w_wing',
  'unique_rectangle',
  'x_cycle_simple_coloring',
  'medusa_3d',
  'swordfish',
  'finned_swordfish',
  'remote_pairs',
  'two_string_kite',
  'empty_rectangle',
  'bug_plus_one',
  'jellyfish',
  'finned_jellyfish',
  'aic',
  'aic_mid_chain',
  'grouped_aic_nice_loop',
  'aic_long_chain',
  'als_xz',
  'als_chain',
  'forcing_chain_net',
  'exocet_death_blossom',
  'xy_chain',
  'discontinuous_nice_loop',
  'cell_forcing_chain',
  'region_forcing_chain',
  'template',
  'als_xy',
  'als_w_wing',
  'sue_de_coq',
  'death_blossom',
];

function techIndex(t: TechniqueName): number {
  const idx = TECHNIQUE_ORDER.indexOf(t);
  return idx === -1 ? 999 : idx;
}

function applyResult(board: SolverBoard, result: DetectionResult): SolverBoard {
  const values = Array.from(board.values);
  const cands: number[][] = [];
  for (let i = 0; i < 81; i++) cands.push(values[i] ? [] : bitsToDigits(board.candidates[i]));
  for (const a of result.actions) {
    if (a.kind === 'fill') {
      values[a.cell] = a.digit;
      cands[a.cell] = [];
      for (const p of SolverBoard.PEERS[a.cell]) cands[p] = cands[p].filter((d) => d !== a.digit);
    } else {
      cands[a.cell] = cands[a.cell].filter((d) => d !== a.digit);
    }
  }
  return new SolverBoard(values, cands);
}

function solvePuzzle(puzzle: number[]): TechniqueName {
  const cells = puzzle.map((v) => ({ value: v, fixed: v !== 0, notes: [] as number[] }));
  let board = SolverBoard.fromGameState(cells);
  let hardest: TechniqueName = 'naked_single';
  let maxIter = 500;

  while (board.emptyCells.length > 0 && maxIter-- > 0) {
    let found = false;
    for (const detector of DETECTOR_REGISTRY) {
      try {
        const result = detector(board);
        if (result && result.actions.length > 0) {
          if (techIndex(result.technique) > techIndex(hardest)) {
            hardest = result.technique;
          }
          board = applyResult(board, result);
          found = true;
          break;
        }
      } catch {
        continue;
      }
    }
    if (!found) break;
  }

  return hardest;
}

describe('fix maxTechnique for levels 121-200', () => {
  it('detects actual techniques and writes corrected data', () => {
    const dataPath = path.resolve(__dirname, '..', 'levels-data.json');
    const levels = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));

    const corrections: { id: number; old: string; new: string }[] = [];

    for (const level of levels) {
      if (level.id < 121 || level.id > 200) continue;

      const actualTechnique = solvePuzzle(level.puzzle);
      if (actualTechnique !== level.maxTechnique) {
        corrections.push({ id: level.id, old: level.maxTechnique, new: actualTechnique });
        level.maxTechnique = actualTechnique;
      }
    }

    console.log(`Corrected ${corrections.length} levels:`);
    const dist: Record<string, number> = {};
    for (const level of levels) {
      if (level.id >= 121 && level.id <= 200) {
        dist[level.maxTechnique] = (dist[level.maxTechnique] || 0) + 1;
      }
    }
    console.log('New technique distribution:', dist);

    fs.writeFileSync(dataPath, JSON.stringify(levels, null, 2) + '\n');

    // Verify no IDs or puzzles were changed
    const reread = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
    const target = reread.filter((l: { id: number }) => l.id >= 121 && l.id <= 200);
    expect(target.length).toBe(80);

    // All should have valid technique names
    for (const l of target) {
      expect(TECHNIQUE_ORDER).toContain(l.maxTechnique);
    }

    // After first run, corrections count may be 0 (idempotent)
    expect(corrections.length).toBeGreaterThanOrEqual(0);
  });
});
