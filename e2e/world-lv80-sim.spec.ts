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

  page.on('dialog', async (d) => {
    // Intro prompt: cancel to defer and go straight into gameplay.
    await d.dismiss();
  });

  await page.goto('/');
  await page.waitForFunction(() => typeof (window as any).showLevelScreen === 'function', { timeout: 20_000 });

  await page.evaluate(() => {
    const appVer = localStorage.getItem('sudoku_app_version');
    localStorage.clear();
    if (appVer) localStorage.setItem('sudoku_app_version', appVer);
  });
  await page.reload();
  await page.waitForFunction(() => typeof (window as any).showLevelScreen === 'function', { timeout: 20_000 });

  const result = await page.evaluate(async () => {
    const wc = await import('/src/features/wild/wildController.ts');
    const ws = await import('/src/features/wild/wildState.ts');
    const exp = await import('/src/features/wild/expSystem.ts');

    const events: Array<EncounterEvent | { type: string; [k: string]: unknown }> = [];
    const levelUps: Array<{ idx: number; from: number; to: number; exp: number }> = [];
    const rarityCount: Record<string, number> = {};
    const modeCount: Record<string, number> = {};
    const techCount: Record<string, number> = {};

    const maxEncounters = 2500;

    for (let i = 1; i <= maxEncounters; i++) {
      // Keep mentor overlay from blocking input if it appears asynchronously.
      (window as any).dismissMentor?.();

      if (i === 1) await wc.startWorldSession();
      else await wc.continueWild();

      const enc = wc.getCurrentEncounter();
      if (!enc) {
        events.push({ type: 'no_encounter', idx: i });
        break;
      }

      const pBefore = wc.getWildProfile();
      const levelBefore = pBefore.iqLevel;

      const secBase = Math.max(35, 220 - Math.floor(levelBefore * 1.6));
      const seconds = secBase + Math.floor(Math.random() * 35);
      const errors = enc.challengeMode === 'ironman' ? 0 : Math.floor(Math.random() * 2);

      const r = wc.onWildComplete(seconds, errors);
      const pAfter = wc.getWildProfile();

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

      if (wc.getWildProfile().iqLevel >= 80) break;
    }

    const finalProfile = wc.getWildProfile();
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

