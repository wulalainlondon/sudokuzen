import { SolverBoard } from '../../board';
import type { DetectionResult } from '../../types';
import { detectFish } from '../../helpers/fish';

export function detectSwordfish(board: SolverBoard): DetectionResult | null {
  return detectFish(board, 3);
}
