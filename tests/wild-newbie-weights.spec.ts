import { describe, expect, it } from 'vitest';
import { TECHNIQUE_TABLE } from '../src/features/wild/techniqueMeta';

// Reproduce the newbieWeight function from ecologyEngine.ts (not exported)
function newbieWeight(gate: number, level: number): number {
  if (level < gate) return 0;
  const age = level - gate;
  if (age <= 2) return 0.3 + age * 0.35; // ramp up: 0.3, 0.65, 1.0
  if (age <= 4) return 1.0; // peak holds
  return Math.max(0.3, 1.0 - (age - 4) * 0.1); // gradual fade, min 0.3
}

describe('newbieWeight curve', () => {
  it('returns 0 when level < gate (not unlocked)', () => {
    expect(newbieWeight(1, 0)).toBe(0);
    expect(newbieWeight(5, 4)).toBe(0);
    expect(newbieWeight(10, 1)).toBe(0);
  });

  it('returns 0.3 when just unlocked (age = 0)', () => {
    expect(newbieWeight(1, 1)).toBe(0.3);
    expect(newbieWeight(5, 5)).toBe(0.3);
  });

  it('ramps up at age 1', () => {
    expect(newbieWeight(1, 2)).toBeCloseTo(0.65);
  });

  it('reaches 1.0 at age 2', () => {
    expect(newbieWeight(1, 3)).toBeCloseTo(1.0);
  });

  it('holds peak at age 3 and 4', () => {
    expect(newbieWeight(1, 4)).toBeCloseTo(1.0);
    expect(newbieWeight(1, 5)).toBeCloseTo(1.0);
  });

  it('fades after age 4', () => {
    expect(newbieWeight(1, 6)).toBeCloseTo(0.9);
    expect(newbieWeight(1, 7)).toBeCloseTo(0.8);
  });

  it('never drops below 0.3', () => {
    expect(newbieWeight(1, 20)).toBe(0.3);
    expect(newbieWeight(1, 100)).toBe(0.3);
  });

  it('reaches minimum floor at age 11', () => {
    // age 11: 1.0 - (11-4)*0.1 = 1.0 - 0.7 = 0.3
    expect(newbieWeight(1, 12)).toBe(0.3);
  });
});

describe('newbie zone technique availability', () => {
  const phase1 = TECHNIQUE_TABLE.filter((t) => t.tier === 0 || t.tier === 1);

  it('at Lv.1: only naked_single has weight > 0', () => {
    const available = phase1.filter((t) => newbieWeight(t.levelGate, 1) > 0);
    expect(available).toHaveLength(1);
    expect(available[0].key).toBe('naked_single');
  });

  it('at Lv.3: naked_single + hidden_single have weight > 0', () => {
    const available = phase1.filter((t) => newbieWeight(t.levelGate, 3) > 0);
    expect(available).toHaveLength(2);
    const keys = available.map((t) => t.key);
    expect(keys).toContain('naked_single');
    expect(keys).toContain('hidden_single');
  });

  it('at Lv.5: 3 techniques available', () => {
    const available = phase1.filter((t) => newbieWeight(t.levelGate, 5) > 0);
    expect(available).toHaveLength(3);
    const keys = available.map((t) => t.key);
    expect(keys).toContain('naked_single');
    expect(keys).toContain('hidden_single');
    expect(keys).toContain('locked_candidates');
  });

  it('at Lv.8: 4 techniques available', () => {
    const available = phase1.filter((t) => newbieWeight(t.levelGate, 8) > 0);
    expect(available).toHaveLength(4);
    expect(available.map((t) => t.key)).toContain('naked_pair');
  });

  it('at Lv.20: all 7 Phase 1 techniques available', () => {
    const available = phase1.filter((t) => newbieWeight(t.levelGate, 20) > 0);
    expect(available).toHaveLength(7);
  });

  it('newer techniques peak while older ones fade', () => {
    // At Lv.17 (hidden_triple just unlocked):
    // naked_single (gate=1): age=16, weight=0.3 (faded)
    // hidden_triple (gate=17): age=0, weight=0.3 (just unlocked)
    // locked_candidates (gate=5): age=12, weight=0.3 (faded)
    // naked_pair (gate=8): age=9, weight=0.5 (fading)
    expect(newbieWeight(1, 17)).toBe(0.3); // naked_single faded
    expect(newbieWeight(17, 17)).toBe(0.3); // hidden_triple just starting
    expect(newbieWeight(5, 17)).toBe(0.3); // locked_candidates faded

    // At Lv.10: naked_pair (gate=8) is ramping up
    expect(newbieWeight(8, 10)).toBeCloseTo(1.0); // age=2, peak
  });

  it('old techniques never reach 0 (minimum floor)', () => {
    for (const t of phase1) {
      for (let level = t.levelGate; level <= 20; level++) {
        const w = newbieWeight(t.levelGate, level);
        expect(w).toBeGreaterThanOrEqual(0.3);
      }
    }
  });
});
