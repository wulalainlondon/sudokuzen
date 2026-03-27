import { SolverBoard } from '../../board';
import type { DetectionResult } from '../../types';
import { detectFinnedFish } from '../../helpers/fish';

export function detectFinnedJellyfish(board: SolverBoard): DetectionResult | null {
  return detectFinnedFish(board, 4);
}
