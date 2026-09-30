import { ACTIVE_EDITION } from './appEdition';

export type LeaderboardMode = 'classic' | 'speed';

/** The full 81-cell fingerprint avoids collisions and reused level IDs. */
export function leaderboardKey(levelId: number, puzzle: unknown, mode: LeaderboardMode): string | null {
  if (ACTIVE_EDITION === 'legacy') return String(levelId);
  if (
    !Number.isInteger(levelId) ||
    !Array.isArray(puzzle) ||
    puzzle.length !== 81 ||
    puzzle.some((n) => !Number.isInteger(n) || n < 0 || n > 9)
  )
    return null;
  return `${mode}_${levelId}_${puzzle.join('')}`;
}
