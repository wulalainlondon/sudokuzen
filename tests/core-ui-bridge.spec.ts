// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

import { setContinuousFillVisible, setEraseVisible, setLevelTechniqueHint } from '../src/game/coreUiBridge';

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

describe('coreUiBridge assist tools visibility', () => {
  it('controls continuous fill and erase visibility independently', () => {
    document.body.innerHTML = `
      <button id="continuous-fill-toggle"></button>
      <button id="erase-btn"></button>
      <button id="note-toggle"></button>
    `;

    setContinuousFillVisible(false);
    setEraseVisible(true);
    expect(document.getElementById('continuous-fill-toggle')?.classList.contains('hidden')).toBe(true);
    expect(document.getElementById('erase-btn')?.classList.contains('hidden')).toBe(false);
    expect(document.getElementById('note-toggle')?.classList.contains('hidden')).toBe(false);

    setContinuousFillVisible(true);
    setEraseVisible(false);
    expect(document.getElementById('continuous-fill-toggle')?.classList.contains('hidden')).toBe(false);
    expect(document.getElementById('erase-btn')?.classList.contains('hidden')).toBe(true);
  });
});
