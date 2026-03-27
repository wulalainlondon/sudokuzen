import { SolverBoard } from '../../board';
import type { DetectionResult } from '../../types';
import { detectFinnedFish } from '../../helpers/fish';

export function detectFinnedSwordfish(board: SolverBoard): DetectionResult | null {
  return detectFinnedFish(board, 3);
}
