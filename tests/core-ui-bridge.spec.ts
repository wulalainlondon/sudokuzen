// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

import { setLevelTechniqueHint } from '../src/game/coreUiBridge';

describe('coreUiBridge level technique hint', () => {
  it('renders translated technique text when key exists', () => {
    document.body.innerHTML = '<div id="level-tech-hint"></div>';
    setLevelTechniqueHint('xy_wing', 'T3');
    const text = document.getElementById('level-tech-hint')?.textContent ?? '';
    expect(text.length).toBeGreaterThan(0);
    expect(text).toContain('T3');
  });

  it('falls back to unknown label when level metadata is missing', () => {
    document.body.innerHTML = '<div id="level-tech-hint"></div>';
    setLevelTechniqueHint(undefined, undefined);
    const text = document.getElementById('level-tech-hint')?.textContent ?? '';
    expect(text.length).toBeGreaterThan(0);
    expect(text).not.toContain('{tech}');
  });
});
