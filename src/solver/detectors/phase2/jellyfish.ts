import { SolverBoard } from '../../board';
import type { DetectionResult } from '../../types';
import { detectFish } from '../../helpers/fish';

export function detectJellyfish(board: SolverBoard): DetectionResult | null {
  return detectFish(board, 4);
}
