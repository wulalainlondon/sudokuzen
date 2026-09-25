// @vitest-environment jsdom
import { beforeEach, expect, it } from 'vitest';
import { gs } from '../src/game/state';
import { updateResumeBanner } from '../src/features/levels';
import { SK } from '../src/storage/keys';

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = '<div id="resume-banner"></div>';
  gs.isDuoMode = false;
  gs.isSpeedrunMode = false;
  gs.currentLevel = {
    id: 20695,
    stars: 0,
    difficultyName: '初心',
    displayName: '九霄明心',
    puzzle: Array(81).fill(0),
    solution: Array.from({ length: 81 }, (_, i) => (i % 9) + 1),
    mode: 'normal',
  };
});

it('removes the old solved save behind a completed level instead of offering Resume Game', () => {
  const cellsData = gs.currentLevel!.solution.map((value) => ({ value, fixed: false, notes: [], isError: false }));
  localStorage.setItem(SK.save(20695, false), JSON.stringify({ levelId: 20695, cellsData, seconds: 73 }));
  localStorage.setItem(SK.RECORDS, JSON.stringify({ 20695: { time: 73, stars: 3 } }));

  updateResumeBanner();

  expect(document.getElementById('resume-banner')?.classList.contains('hidden')).toBe(true);
  expect(localStorage.getItem(SK.save(20695, false))).toBeNull();
  expect(JSON.parse(localStorage.getItem(SK.RECORDS)!)['20695']).toEqual({ time: 73, stars: 3 });
});

it('keeps a solved save available when its result was never recorded', () => {
  const cellsData = gs.currentLevel!.solution.map((value) => ({ value, fixed: false, notes: [], isError: false }));
  localStorage.setItem(SK.save(20695, false), JSON.stringify({ levelId: 20695, cellsData, seconds: 73 }));

  updateResumeBanner();

  expect(document.getElementById('resume-banner')?.classList.contains('hidden')).toBe(false);
  expect(localStorage.getItem(SK.save(20695, false))).not.toBeNull();
});
