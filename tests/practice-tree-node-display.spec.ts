import { describe, expect, it } from 'vitest';
import { buildTreeNodeDisplayModel } from '../src/react/practice/TreeNode';

describe('buildTreeNodeDisplayModel', () => {
  it('locked: shows clear lock copy and unlock hint text', () => {
    const model = buildTreeNodeDisplayModel('naked_single', 'locked', 0, 25);
    expect(model.statusChip).toBe('未解鎖');
    expect(model.primaryText).toBe('待解鎖');
    expect(model.secondaryText).toBe('已通關 0/25');
    expect(model.unlockHintText).toContain('各 3 關');
    expect(model.iconKind).toBe('lock');
    expect(model.progressPct).toBe(0);
  });

  it('unlocked: shows remaining and no unlock hint', () => {
    const model = buildTreeNodeDisplayModel('naked_single', 'unlocked', 0, 25);
    expect(model.statusChip).toBe('可修行');
    expect(model.primaryText).toBe('剩 25 關');
    expect(model.secondaryText).toBe('已通關 0/25');
    expect(model.unlockHintText).toBeUndefined();
    expect(model.iconKind).toBe('mountain');
  });

  it('partial: shows remaining and cleared progress', () => {
    const model = buildTreeNodeDisplayModel('swordfish', 'partial', 24, 25);
    expect(model.statusChip).toBe('修行中');
    expect(model.primaryText).toBe('剩 1 關');
    expect(model.secondaryText).toBe('已通關 24/25');
    expect(model.iconKind).toBe('water');
    expect(model.progressPct).toBeCloseTo(96);
  });

  it('completed: always shows 已圓滿 + 25/25 (not 剩 0 關)', () => {
    const model = buildTreeNodeDisplayModel('template', 'completed', 25, 25);
    expect(model.statusChip).toBe('已圓滿');
    expect(model.primaryText).toBe('已圓滿');
    expect(model.secondaryText).toBe('已通關 25/25');
    expect(model.iconKind).toBe('seal');
    expect(model.progressPct).toBe(100);
  });
});
