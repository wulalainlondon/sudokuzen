import { describe, expect, it } from 'vitest';
import {
  TECHNIQUE_TABLE,
  getTechniqueMeta,
  getAutoCastKeys,
  RARITY_MULTIPLIER,
  type TechniqueMeta,
} from '../src/features/wild/techniqueMeta';

describe('TECHNIQUE_TABLE structure', () => {
  it('has 40 entries', () => {
    expect(TECHNIQUE_TABLE).toHaveLength(40);
  });

  it('all entries have required fields', () => {
    for (const t of TECHNIQUE_TABLE) {
      expect(t.key).toBeTruthy();
      expect(typeof t.key).toBe('string');
      expect(t.name).toBeTruthy();
      expect(typeof t.name).toBe('string');
      expect(t.subtitle).toBeTruthy();
      expect(typeof t.subtitle).toBe('string');
      expect(typeof t.weight).toBe('number');
      expect(t.weight).toBeGreaterThan(0);
      expect(['common', 'rare', 'legendary', 'mythic']).toContain(t.rarity);
      expect(typeof t.cooldown).toBe('number');
      expect(t.cooldown).toBeGreaterThanOrEqual(0);
      expect(typeof t.expBase).toBe('number');
      expect(t.expBase).toBeGreaterThan(0);
      expect(typeof t.levelGate).toBe('number');
      expect(t.levelGate).toBeGreaterThanOrEqual(1);
      expect(typeof t.autoCastGate).toBe('number');
      expect([0, 1, 2, 3, 4]).toContain(t.tier);
      expect(typeof t.fragmentsRequired).toBe('number');
      expect(t.fragmentsRequired).toBeGreaterThanOrEqual(0);
    }
  });

  it('has unique keys', () => {
    const keys = TECHNIQUE_TABLE.map((t) => t.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('levelGate ordering', () => {
  it('levelGate values are non-decreasing across the table', () => {
    for (let i = 1; i < TECHNIQUE_TABLE.length; i++) {
      expect(TECHNIQUE_TABLE[i].levelGate).toBeGreaterThanOrEqual(TECHNIQUE_TABLE[i - 1].levelGate);
    }
  });

  it('staggered levelGate values for Phase 1', () => {
    expect(getTechniqueMeta('naked_single')?.levelGate).toBe(1);
    expect(getTechniqueMeta('hidden_single')?.levelGate).toBe(3);
    expect(getTechniqueMeta('locked_candidates')?.levelGate).toBe(5);
    expect(getTechniqueMeta('naked_pair')?.levelGate).toBe(8);
    expect(getTechniqueMeta('hidden_pair')?.levelGate).toBe(11);
    expect(getTechniqueMeta('naked_triple')?.levelGate).toBe(14);
    expect(getTechniqueMeta('hidden_triple')?.levelGate).toBe(17);
  });

  it('Phase 2a starts at level 21', () => {
    for (const key of ['x_wing', 'unique_rectangle', 'bug_plus_one']) {
      expect(getTechniqueMeta(key)?.levelGate).toBe(21);
    }
  });

  it('Phase 2b starts at level 31', () => {
    for (const key of ['skyscraper', 'two_string_kite', 'empty_rectangle', 'finned_x_wing', 'xy_wing']) {
      expect(getTechniqueMeta(key)?.levelGate).toBe(31);
    }
  });
});

describe('autoCastGate consistency', () => {
  it('autoCastGate is always > levelGate (or 0 for never-auto)', () => {
    for (const t of TECHNIQUE_TABLE) {
      if (t.autoCastGate === 0) {
        // Never auto-casts (T4 techniques)
        continue;
      }
      expect(t.autoCastGate).toBeGreaterThan(t.levelGate);
    }
  });

  it('T4 techniques have autoCastGate = 0', () => {
    const t4 = TECHNIQUE_TABLE.filter((t) => t.tier === 4);
    expect(t4.length).toBeGreaterThan(0);
    for (const t of t4) {
      expect(t.autoCastGate).toBe(0);
    }
  });
});

describe('getTechniqueMeta', () => {
  it('returns correct entry for known key', () => {
    const meta = getTechniqueMeta('naked_single');
    expect(meta).toBeDefined();
    expect(meta!.name).toBe('明眼');
    expect(meta!.subtitle).toBe('Naked Single');
    expect(meta!.tier).toBe(0);
  });

  it('returns undefined for unknown key', () => {
    expect(getTechniqueMeta('nonexistent')).toBeUndefined();
  });

  it('returns correct entry for every key in the table', () => {
    for (const t of TECHNIQUE_TABLE) {
      const meta = getTechniqueMeta(t.key);
      expect(meta).toBeDefined();
      expect(meta!.key).toBe(t.key);
    }
  });
});

describe('getAutoCastKeys', () => {
  it('returns empty set at level 1', () => {
    const keys = getAutoCastKeys(1);
    expect(keys.size).toBe(0);
  });

  it('returns naked_single at level 5', () => {
    const keys = getAutoCastKeys(5);
    expect(keys.has('naked_single')).toBe(true);
    expect(keys.has('hidden_single')).toBe(false);
  });

  it('returns naked_single + hidden_single at level 8', () => {
    const keys = getAutoCastKeys(8);
    expect(keys.has('naked_single')).toBe(true);
    expect(keys.has('hidden_single')).toBe(true);
    expect(keys.has('locked_candidates')).toBe(false);
  });

  it('returns all Phase 1 techniques at level 21', () => {
    const keys = getAutoCastKeys(21);
    for (const key of ['naked_single', 'hidden_single', 'locked_candidates', 'naked_pair', 'hidden_pair', 'naked_triple', 'hidden_triple']) {
      expect(keys.has(key)).toBe(true);
    }
  });

  it('never includes techniques with autoCastGate = 0', () => {
    const keys = getAutoCastKeys(100);
    const neverAuto = TECHNIQUE_TABLE.filter((t) => t.autoCastGate === 0);
    for (const t of neverAuto) {
      expect(keys.has(t.key)).toBe(false);
    }
  });

  it('includes all auto-castable techniques at high level', () => {
    const keys = getAutoCastKeys(100);
    const autoTechniques = TECHNIQUE_TABLE.filter((t) => t.autoCastGate > 0 && t.autoCastGate <= 100);
    for (const t of autoTechniques) {
      expect(keys.has(t.key)).toBe(true);
    }
  });
});

describe('RARITY_MULTIPLIER', () => {
  it('has correct multiplier values', () => {
    expect(RARITY_MULTIPLIER.common).toBe(1);
    expect(RARITY_MULTIPLIER.rare).toBe(2);
    expect(RARITY_MULTIPLIER.legendary).toBe(3);
    expect(RARITY_MULTIPLIER.mythic).toBe(5);
  });
});

describe('fragment requirements', () => {
  it('T0-T1 techniques have fragmentsRequired > 0', () => {
    const t01 = TECHNIQUE_TABLE.filter((t) => t.tier === 0 || t.tier === 1);
    for (const t of t01) {
      expect(t.fragmentsRequired).toBeGreaterThan(0);
    }
  });

  it('T2+ techniques have fragmentsRequired === 0', () => {
    const t2plus = TECHNIQUE_TABLE.filter((t) => t.tier >= 2);
    for (const t of t2plus) {
      expect(t.fragmentsRequired).toBe(0);
    }
  });

  it('total fragments needed is 35', () => {
    const total = TECHNIQUE_TABLE.reduce((sum, t) => sum + t.fragmentsRequired, 0);
    expect(total).toBe(35);
  });

  it('fragment values follow tier pattern: T0=3, T1=5 or 7', () => {
    const t0 = TECHNIQUE_TABLE.filter((t) => t.tier === 0);
    for (const t of t0) {
      expect(t.fragmentsRequired).toBe(3);
    }
    const t1 = TECHNIQUE_TABLE.filter((t) => t.tier === 1);
    for (const t of t1) {
      expect([5, 7]).toContain(t.fragmentsRequired);
    }
  });
});
