import { describe, expect, it } from 'vitest';
import {
  classifyDuoOutcome,
  DUO_CLOSE_GAP_RATIO,
  DUO_CLOSE_GAP_SECONDS,
  DUO_DOMINANT_GAP_RATIO,
  DUO_DOMINANT_GAP_SECONDS,
  DUO_FORFEIT_TIME,
} from '../src/features/duo/duoOutcome';

describe('Duo outcome strength', () => {
  it('treats equal integer finish times as a draw', () => {
    expect(classifyDuoOutcome(90, 90)).toMatchObject({
      tier: 'draw',
      diffSec: 0,
      gapRatio: 0,
      isDraw: true,
    });
  });

  it.each([
    [70, 71, 'close-win'],
    [70, 70 + DUO_CLOSE_GAP_SECONDS, 'close-win'],
    [78, 70, 'close-loss'],
    [600, 630, 'close-win'],
    [630, 600, 'close-loss'],
  ] as const)('classifies %ss vs %ss as %s', (myTime, opponentTime, tier) => {
    expect(classifyDuoOutcome(myTime, opponentTime).tier).toBe(tier);
  });

  it('keeps a gap just beyond both close boundaries in the normal tier', () => {
    const result = classifyDuoOutcome(100, 109);
    expect(result.tier).toBe('win');
    expect(result.diffSec).toBe(DUO_CLOSE_GAP_SECONDS + 1);
    expect(result.gapRatio).toBeGreaterThan(DUO_CLOSE_GAP_RATIO);
  });

  it.each([
    [90, 120, 'dominant-win'],
    [120, 90, 'dominant-loss'],
    [60, 60 + DUO_DOMINANT_GAP_SECONDS, 'dominant-win'],
    [60 + DUO_DOMINANT_GAP_SECONDS, 60, 'dominant-loss'],
  ] as const)('classifies %ss vs %ss as %s', (myTime, opponentTime, tier) => {
    const result = classifyDuoOutcome(myTime, opponentTime);
    expect(result.tier).toBe(tier);
    expect(result.diffSec).toBeGreaterThanOrEqual(DUO_DOMINANT_GAP_SECONDS);
    expect(result.gapRatio).toBeGreaterThanOrEqual(DUO_DOMINANT_GAP_RATIO);
  });

  it('does not call a long-round 30-second gap dominant when its ratio is small', () => {
    expect(classifyDuoOutcome(480, 510).tier).toBe('win');
  });

  it('does not call a large percentage dominant when the absolute gap is tiny', () => {
    expect(classifyDuoOutcome(5, 10).tier).toBe('close-win');
  });

  it('keeps ordinary results between close and dominant thresholds', () => {
    expect(classifyDuoOutcome(90, 108).tier).toBe('win');
    expect(classifyDuoOutcome(108, 90).tier).toBe('loss');
  });

  it('separates forfeits and a double abandonment from time-gap labels', () => {
    expect(classifyDuoOutcome(75, DUO_FORFEIT_TIME)).toMatchObject({
      tier: 'forfeit-win',
      isForfeit: true,
    });
    expect(classifyDuoOutcome(DUO_FORFEIT_TIME, 75)).toMatchObject({
      tier: 'forfeit-loss',
      isForfeit: true,
    });
    expect(classifyDuoOutcome(DUO_FORFEIT_TIME, DUO_FORFEIT_TIME)).toMatchObject({
      tier: 'abandoned',
      isForfeit: true,
      isDraw: false,
    });
  });
});
