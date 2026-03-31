import { describe, expect, it } from 'vitest';
import { TECHNIQUE_TABLE } from '../src/features/wild/techniqueMeta';

describe('fragment system validation', () => {
  const t0Techniques = TECHNIQUE_TABLE.filter((t) => t.tier === 0);
  const t1Techniques = TECHNIQUE_TABLE.filter((t) => t.tier === 1);
  const t2PlusTechniques = TECHNIQUE_TABLE.filter((t) => t.tier >= 2);

  it('all T0 techniques have fragmentsRequired = 3', () => {
    expect(t0Techniques.length).toBe(2); // naked_single, hidden_single
    for (const t of t0Techniques) {
      expect(t.fragmentsRequired).toBe(3);
    }
  });

  it('all T1 techniques have fragmentsRequired > 0', () => {
    for (const t of t1Techniques) {
      expect(t.fragmentsRequired).toBeGreaterThan(0);
    }
  });

  it('all T2+ techniques have fragmentsRequired === 0', () => {
    for (const t of t2PlusTechniques) {
      expect(t.fragmentsRequired).toBe(0);
    }
  });

  it('total fragments needed is 35', () => {
    // T0: 3+3 = 6
    // T1: 5+5+5+7+7 = 29 (locked_candidates, naked_pair, hidden_pair each 5; naked_triple, hidden_triple each 7)
    // Total: 6+29 = 35
    const total = TECHNIQUE_TABLE.reduce((sum, t) => sum + t.fragmentsRequired, 0);
    expect(total).toBe(35);
  });

  it('fragment threshold values are 3, 5, or 7', () => {
    const withFragments = TECHNIQUE_TABLE.filter((t) => t.fragmentsRequired > 0);
    for (const t of withFragments) {
      expect([3, 5, 7]).toContain(t.fragmentsRequired);
    }
  });

  it('T0-T1 covers exactly 7 techniques', () => {
    const withFragments = TECHNIQUE_TABLE.filter((t) => t.fragmentsRequired > 0);
    expect(withFragments).toHaveLength(7);
    const keys = withFragments.map((t) => t.key).sort();
    expect(keys).toEqual([
      'hidden_pair',
      'hidden_single',
      'hidden_triple',
      'locked_candidates',
      'naked_pair',
      'naked_single',
      'naked_triple',
    ]);
  });

  it('fragment requirements match specific techniques', () => {
    const byKey = new Map(TECHNIQUE_TABLE.map((t) => [t.key, t]));
    expect(byKey.get('naked_single')!.fragmentsRequired).toBe(3);
    expect(byKey.get('hidden_single')!.fragmentsRequired).toBe(3);
    expect(byKey.get('locked_candidates')!.fragmentsRequired).toBe(5);
    expect(byKey.get('naked_pair')!.fragmentsRequired).toBe(5);
    expect(byKey.get('hidden_pair')!.fragmentsRequired).toBe(5);
    expect(byKey.get('naked_triple')!.fragmentsRequired).toBe(7);
    expect(byKey.get('hidden_triple')!.fragmentsRequired).toBe(7);
  });
});
