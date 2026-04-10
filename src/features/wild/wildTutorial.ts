// Wild tutorial encounters — fixed puzzles for first-time players.
// Played in order before free Wild begins.

import type { WildEncounter } from './wildState';

export const TUTORIAL_ENCOUNTERS: WildEncounter[] = [
  {
    technique: 'naked_single',
    rarity: 'common',
    difficultyWeight: 1,
    puzzle: [
      0, 0, 8, 9, 1, 0, 2, 0, 0, 0, 0, 0, 4, 0, 7, 6, 0, 0, 0, 0, 0, 0, 0, 6, 0, 0, 5, 3, 9, 0, 8, 0, 4, 5, 0, 0, 0, 0,
      0, 7, 0, 1, 0, 2, 0, 0, 0, 0, 0, 0, 0, 7, 0, 0, 0, 4, 0, 1, 9, 3, 0, 6, 0, 6, 0, 0, 0, 0, 0, 3, 7, 0, 1, 0, 0, 0,
      0, 8, 0, 0, 0,
    ],
    solution: [
      4, 6, 8, 9, 1, 5, 2, 3, 7, 5, 2, 1, 4, 3, 7, 6, 9, 8, 9, 7, 3, 2, 8, 6, 1, 4, 5, 3, 9, 7, 8, 2, 4, 5, 1, 6, 8, 5,
      4, 7, 6, 1, 9, 2, 3, 2, 1, 6, 3, 5, 9, 7, 8, 4, 7, 4, 5, 1, 9, 3, 8, 6, 2, 6, 8, 9, 5, 4, 2, 3, 7, 1, 1, 3, 2, 6,
      7, 8, 4, 5, 9,
    ],
    startedAt: 0,
    challengeMode: 'standard',
    mentorTime: 53,
  },
  {
    technique: 'locked_candidates',
    rarity: 'common',
    difficultyWeight: 2,
    puzzle: [
      0, 0, 7, 0, 9, 2, 0, 0, 0, 6, 5, 0, 0, 3, 4, 0, 0, 0, 4, 2, 0, 0, 8, 0, 0, 6, 0, 0, 0, 0, 0, 5, 0, 0, 0, 0, 0, 0,
      0, 8, 0, 3, 0, 4, 0, 0, 0, 0, 7, 0, 0, 8, 9, 0, 0, 3, 8, 0, 0, 0, 4, 0, 0, 0, 1, 0, 0, 0, 0, 0, 3, 0, 2, 0, 0, 0,
      0, 6, 7, 0, 0,
    ],
    solution: [
      1, 8, 7, 6, 9, 2, 3, 5, 4, 6, 5, 9, 1, 3, 4, 2, 7, 8, 4, 2, 3, 5, 8, 7, 9, 6, 1, 8, 7, 1, 4, 5, 9, 6, 2, 3, 5, 9,
      2, 8, 6, 3, 1, 4, 7, 3, 6, 4, 7, 2, 1, 8, 9, 5, 9, 3, 8, 2, 7, 5, 4, 1, 6, 7, 1, 6, 9, 4, 8, 5, 3, 2, 2, 4, 5, 3,
      1, 6, 7, 8, 9,
    ],
    startedAt: 0,
    challengeMode: 'standard',
    mentorTime: 57,
  },
  {
    technique: 'naked_pair',
    rarity: 'common',
    difficultyWeight: 3,
    puzzle: [
      0, 4, 7, 0, 8, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 6, 0, 0, 0, 0, 0, 4, 9, 2, 5, 0, 0, 0, 0, 0, 0, 0, 0, 8, 2, 0, 0, 0,
      6, 0, 0, 4, 0, 0, 0, 0, 1, 0, 0, 7, 8, 0, 0, 5, 0, 0, 0, 0, 0, 7, 0, 0, 4, 8, 0, 0, 1, 0, 0, 3, 0, 7, 0, 0, 0, 0,
      0, 0, 0, 5, 1,
    ],
    solution: [
      3, 4, 7, 5, 8, 6, 1, 9, 2, 9, 5, 2, 7, 3, 1, 6, 4, 8, 1, 6, 8, 4, 9, 2, 5, 7, 3, 4, 7, 3, 9, 1, 5, 8, 2, 6, 5, 8,
      6, 3, 2, 4, 7, 1, 9, 2, 1, 9, 6, 7, 8, 4, 3, 5, 6, 3, 1, 2, 5, 7, 9, 8, 4, 8, 2, 5, 1, 4, 9, 3, 6, 7, 7, 9, 4, 8,
      6, 3, 2, 5, 1,
    ],
    startedAt: 0,
    challengeMode: 'standard',
    mentorTime: 59,
  },
];

export const TUTORIAL_TOTAL = TUTORIAL_ENCOUNTERS.length; // 3
