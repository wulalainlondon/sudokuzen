import { describe, expect, it } from 'vitest';
import { resolveLevelScreenReturnTarget } from '../src/features/levels';

describe('resolveLevelScreenReturnTarget', () => {
  it('routes wild context back to world lobby', () => {
    const target = resolveLevelScreenReturnTarget(true, {
      practiceReturnTech: null,
      currentTab: '初心',
      isWildContext: true,
    });
    expect(target).toBe('world');
  });

  it('routes practice return to practice lobby', () => {
    const target = resolveLevelScreenReturnTarget(true, {
      practiceReturnTech: 'x_wing',
      currentTab: '初心',
      isWildContext: false,
    });
    expect(target).toBe('practice');
  });

  it('routes tier return to tier when not wild/practice', () => {
    const target = resolveLevelScreenReturnTarget(true, {
      practiceReturnTech: null,
      currentTab: '初心',
      isWildContext: false,
    });
    expect(target).toBe('tier');
  });

  it('routes default to stage map', () => {
    const target = resolveLevelScreenReturnTarget(false, {
      practiceReturnTech: null,
      currentTab: '初心',
      isWildContext: false,
    });
    expect(target).toBe('stage');
  });
});
