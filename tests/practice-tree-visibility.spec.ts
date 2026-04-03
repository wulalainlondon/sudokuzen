import { describe, expect, it } from 'vitest';
import { isFrontierLockedNode, isTreeNodeVisible } from '../src/react/practice/PracticeTree';
import type { TechNodeState } from '../src/react/practice/practiceTreeStore';

function node(key: string, status: TechNodeState['status']): TechNodeState {
  return { key, name: key, status, cleared: 0, total: 25 };
}

describe('practice tree locked-node visibility', () => {
  it('shows only immediate locked successor as ??? candidate', () => {
    const nodes = new Map<string, TechNodeState>([
      ['naked_single', node('naked_single', 'unlocked')],
      ['hidden_single', node('hidden_single', 'locked')],
      ['locked_candidates', node('locked_candidates', 'locked')],
    ]);

    expect(isFrontierLockedNode('hidden_single', nodes)).toBe(true);
    expect(isTreeNodeVisible('hidden_single', nodes)).toBe(true);
    expect(isTreeNodeVisible('locked_candidates', nodes)).toBe(false);
  });

  it('branch root is visible when parent unlocked, deeper locked nodes stay hidden', () => {
    const nodes = new Map<string, TechNodeState>([
      ['hidden_triple', node('hidden_triple', 'partial')],
      ['x_wing', node('x_wing', 'locked')],
      ['finned_x_wing', node('finned_x_wing', 'locked')],
    ]);

    expect(isTreeNodeVisible('x_wing', nodes)).toBe(true);
    expect(isTreeNodeVisible('finned_x_wing', nodes)).toBe(false);
  });
});

