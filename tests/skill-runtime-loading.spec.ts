// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';

describe('on-demand skill runtime', () => {
  it('loads and registers skills once, retaining priority and choreography', async () => {
    vi.resetModules();
    const runtime = await import('../src/features/skills/skillRuntime');
    const registry = await import('../src/features/skills/skillRegistry');
    expect(runtime.isSkillRuntimeReady()).toBe(false);
    expect(registry.getSkillById('naked_single')).toBeUndefined();
    const first = runtime.loadSkillRuntime();
    const second = runtime.loadSkillRuntime();
    expect(first).toBe(second);
    await first;
    expect(runtime.isSkillRuntimeReady()).toBe(true);
    expect(registry.getSkillById('exocet_death_blossom')).toBeDefined();
    const cells = Array.from({ length: 81 }, () => ({ value: 0, fixed: false, notes: [1, 2], isError: false }));
    cells[0].notes = [1];
    expect(registry.evaluateAllSkills([0], cells).skillId).toBe('naked_single');
    expect(typeof runtime.getChoreography('naked_single')).toBe('function');
  });
});
