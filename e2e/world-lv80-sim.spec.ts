import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

type EncounterEvent = {
  idx: number;
  levelBefore: number;
  levelAfter: number;
  technique: string;
  rarity: string;
  mode: string;
  seconds: number;
  errors: number;
  exp: number;
  firstKill: string | null;
  beatMentor: boolean;
};

test('simulate world run to lv80 and write report', async ({ page }) => {
  test.setTimeout(12 * 60 * 1000);

  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.text().includes('[Wild]')) {
      console.log(`[browser] ${msg.type()}: ${msg.text()}`);
    }
  });

  await page.goto('/');
  await page.waitForFunction(() => typeof (window as unknown).showLevelScreen === 'function', { timeout: 20_000 });

  await page.evaluate(() => {
    const appVer = localStorage.getItem('sudoku_app_version');
    localStorage.clear();
    if (appVer) localStorage.setItem('sudoku_app_version', appVer);
  });
  await page.reload();
  await page.waitForFunction(() => typeof (window as unknown).showLevelScreen === 'function', { timeout: 20_000 });

  const result = await page.evaluate(async () => {
    type WildProfile = {
      iqLevel: number;
      totalExp: number;
      gateOverflowExp?: number;
      studiedSkills?: string[];
      bestiary: Record<string, { kills: number }>;
      [k: string]: unknown;
    };
    type E2E = {
      gs: { currentLevel?: { id: number } };
      getCurrentEncounter: () => { technique: string; rarity: string; challengeMode: string; mentorTime: number } | null;
      isWildActive: () => boolean;
      onWildComplete: (seconds: number, errors: number) => { expGained: number; leveledUp: boolean; newLevel: number; firstKill: string | null; beatMentor: boolean };
      getWildProfile: () => WildProfile;
      deferMentorIntro: () => void;
    };
    const e2e = (window as unknown as { __e2e: E2E }).__e2e;
    const w = window as unknown as {
      startWorldSession: () => Promise<void>;
      continueWild: () => Promise<void>;
      dismissMentor: () => void;
    };

    // Dynamic imports for pure-localStorage helpers (module identity doesn't matter).
    const ws = await import('/src/features/wild/wildState.ts');
    const exp = await import('/src/features/wild/expSystem.ts');

    // Use deferMentorIntro from __e2e (same module instance as the app) to skip
    // the custom DOM confirm dialog that page.on('dialog') cannot intercept.
    e2e.deferMentorIntro();

    const events: Array<EncounterEvent | { type: string; [k: string]: unknown }> = [];
    const levelUps: Array<{ idx: number; from: number; to: number; exp: number }> = [];
    const rarityCount: Record<string, number> = {};
    const modeCount: Record<string, number> = {};
    const techCount: Record<string, number> = {};

    const maxEncounters = 2500;

    for (let i = 1; i <= maxEncounters; i++) {
      // Keep mentor overlay from blocking input if it appears asynchronously.
      w.dismissMentor?.();

      if (i === 1) await w.startWorldSession();
      else await w.continueWild();

      // Use __e2e functions to access state from the app's exact module instance.
      const enc = e2e.getCurrentEncounter();
      if (!enc) {
        events.push({
          type: 'no_encounter',
          idx: i,
          active: e2e.isWildActive(),
          currentLevelId: e2e.gs?.currentLevel?.id ?? null,
        });
        break;
      }

      // getWildProfile() returns the in-memory cached profile (not stale localStorage).
      // saveWildProfile() is debounced 100ms, so reading localStorage would give stale data.
      const pBefore = e2e.getWildProfile();
      const levelBefore = pBefore.iqLevel;

      const secBase = Math.max(35, 220 - Math.floor(levelBefore * 1.6));
      const seconds = secBase + Math.floor(Math.random() * 35);
      const errors = enc.challengeMode === 'ironman' ? 0 : Math.floor(Math.random() * 2);

      // Use __e2e.onWildComplete — same module instance, has access to _encounter/_active.
      const r = e2e.onWildComplete(seconds, errors);
      const pAfter = e2e.getWildProfile();

      rarityCount[enc.rarity] = (rarityCount[enc.rarity] ?? 0) + 1;
      modeCount[enc.challengeMode] = (modeCount[enc.challengeMode] ?? 0) + 1;
      techCount[enc.technique] = (techCount[enc.technique] ?? 0) + 1;

      events.push({
        idx: i,
        levelBefore,
        levelAfter: pAfter.iqLevel,
        technique: enc.technique,
        rarity: enc.rarity,
        mode: enc.challengeMode,
        seconds,
        errors,
        exp: r.expGained,
        firstKill: r.firstKill,
        beatMentor: r.beatMentor,
      } satisfies EncounterEvent);

      if (r.leveledUp) levelUps.push({ idx: i, from: levelBefore, to: pAfter.iqLevel, exp: r.expGained });

      // Gate handling for dev simulation: once blocked at Lv20 and EXP banked,
      // auto-mark required basics as studied to continue the long-run simulation.
      const unstudied = exp.getUnstudiedGateSkills(pAfter);
      if (pAfter.iqLevel === 20 && unstudied.length > 0 && (pAfter.gateOverflowExp ?? 0) > 0) {
        pAfter.studiedSkills = [...new Set([...(pAfter.studiedSkills || []), ...unstudied])];
        const released = exp.releaseGateOverflow(pAfter);
        ws.saveWildProfile(pAfter);
        events.push({
          type: 'gate_release',
          idx: i,
          releasedExp: released,
          levelAfterRelease: pAfter.iqLevel,
        });
      }

      if (pAfter.iqLevel >= 80) break;
    }

    const finalProfile = e2e.getWildProfile();
    const discovered = Object.keys(finalProfile.bestiary).length;
    const conquered = Object.values(finalProfile.bestiary).filter((x) => x.kills > 0).length;

    return {
      reachedLv80: finalProfile.iqLevel >= 80,
      finalLevel: finalProfile.iqLevel,
      totalExp: finalProfile.totalExp,
      gateOverflowExp: finalProfile.gateOverflowExp ?? 0,
      encountersPlayed: Object.values(modeCount).reduce((s, n) => s + n, 0),
      discovered,
      conquered,
      rarityCount,
      modeCount,
      topTechniques: Object.entries(techCount)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 12),
      levelUps,
      events,
    };
  });

  const outDir = path.join(process.cwd(), 'reports');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'world-lv80-report.json');
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2), 'utf-8');

  expect(result.reachedLv80).toBe(true);
});
