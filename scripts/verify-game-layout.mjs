import { chromium, webkit } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const url = process.env.LAYOUT_QA_URL || 'http://127.0.0.1:5195';
const out = process.env.LAYOUT_QA_OUT || 'output/ipad-review-fix/layout-matrix';
await fs.mkdir(out, { recursive: true });
const sizes = [
  [320, 480],
  [320, 568],
  [360, 640],
  [375, 667],
  [375, 812],
  [390, 844],
  [393, 852],
  [402, 874],
  [414, 736],
  [414, 896],
  [430, 932],
  [440, 956],
  [568, 320],
  [667, 375],
  [736, 414],
  [844, 390],
  [896, 414],
  [956, 440],
  [479, 320],
  [480, 320],
  [481, 320],
  [600, 800],
  [768, 1024],
  [820, 1180],
  [834, 1194],
  [1024, 1366],
  [800, 600],
  [1024, 768],
  [1180, 820],
  [1194, 834],
  [1366, 1024],
];
const modes = ['normal', 'speedrun', 'blind', 'practice', 'world', 'duo'];
const report = [];
const errors = [];
for (const [name, engine] of [
  ['chromium', chromium],
  ['webkit', webkit],
]) {
  const browser = await engine.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 414, height: 736 }, isMobile: true, hasTouch: true });
    page.on('pageerror', (e) => errors.push({ engine: name, message: e.message }));
    await page.route('**/firebase-config*.js', (r) =>
      r.fulfill({ contentType: 'application/javascript', body: '// Isolated layout QA.' }),
    );
    await page.addInitScript(() => {
      localStorage.setItem('sudoku_e2e_mode', '1');
      localStorage.setItem('sudoku_bgm_enabled', 'false');
    });
    await page.goto(url);
    await page.locator('#stage-map .stage-node').first().waitFor({ state: 'visible' });
    for (const mode of modes) {
      for (const [width, height] of sizes) {
        await page.setViewportSize({ width, height });
        await page.evaluate((mode) => {
          const e = window.__e2e,
            g = e.gs;
          document.documentElement.classList.add('native-app');
          g.isDuoMode = mode === 'duo';
          g.duoRole = mode === 'duo' ? 'host' : null;
          g.isGhostMode = false;
          g.candidateTrackingEnabled = false;
          g.isNotesMode = false;
          g.continuousFillDigit = null;
          const solution = Array.from(
            '123456789456789123789123456234567891567891234891234567345678912678912345912345678',
            Number,
          );
          const level = {
            id: mode === 'world' ? -9999 : 99999,
            mode:
              mode === 'world'
                ? 'world'
                : mode === 'practice'
                  ? 'practice'
                  : mode === 'speedrun'
                    ? 'speedrun'
                    : mode === 'blind'
                      ? 'blind'
                      : 'normal',
            source: mode === 'world' ? 'wild' : undefined,
            stars: 1,
            difficultyName: 'Layout QA',
            displayName: '版面驗證',
            maxTechnique: 'T02',
            techTier: 'T02',
            puzzle: Array(81).fill(0),
            solution,
          };
          e.initGame(level.id, true, mode === 'speedrun', null, level);
          if (mode === 'duo') {
            document.querySelector('#timer').style.display = 'none';
            document.querySelector('#duo-progress-container').style.display = 'block';
            document.querySelector('#quit-btn').style.display = 'none';
            document.querySelector('#level-tech-hint').style.display = 'none';
          }
        }, mode);
        await page.locator('.game-container').evaluate(async (el) => {
          await Promise.all(el.getAnimations().map((a) => a.finished));
          await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        });
        const geometry = await page.evaluate(() => {
          const rect = (el) => {
            const r = el.getBoundingClientRect();
            return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom };
          };
          const game = document.querySelector('.game-container');
          return {
            viewport: { width: innerWidth, height: innerHeight },
            grid: rect(document.querySelector('#grid')),
            scrollHeight: game.scrollHeight,
            clientHeight: game.clientHeight,
            keys: [...document.querySelectorAll('#numpad .num-btn')].map((el) => {
              const r = rect(el);
              return {
                digit: el.textContent.trim(),
                ...r,
                hit: document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.closest('.num-btn') === el,
              };
            }),
          };
        });
        const label = `${name} ${mode} ${width}x${height}`;
        const failures = [];
        for (const key of geometry.keys) {
          if (
            key.x < -0.5 ||
            key.y < -0.5 ||
            key.right > width + 0.5 ||
            key.bottom > height + 0.5 ||
            key.height < 43.9 ||
            key.width < 43.9 ||
            !key.hit
          )
            failures.push(key.digit);
        }
        if (
          geometry.grid.x < -0.5 ||
          geometry.grid.y < -0.5 ||
          geometry.grid.right > width + 0.5 ||
          geometry.grid.bottom > height + 0.5 ||
          Math.abs(geometry.grid.width - geometry.grid.height) > 1
        )
          failures.push('board');
        if (failures.length) {
          await page.screenshot({ path: `${out}/FAIL-${name}-${mode}-${width}x${height}.png` });
          throw Error(`${label}: clipped/overlapped/small targets ${failures.join(',')}: ${JSON.stringify(geometry)}`);
        }
        if (
          [
            [320, 568],
            [414, 736],
            [568, 320],
          ].some(([w, h]) => w === width && h === height)
        ) {
          for (let digit = 1; digit <= 9; digit++) {
            await page.locator(`.cell[data-idx="${digit - 1}"]`).tap();
            await page
              .locator('#numpad .num-btn')
              .filter({ hasText: new RegExp(`^${digit}$`) })
              .tap();
            assert.equal(
              await page.evaluate((i) => window.__e2e.gs.cellsData[i].value, digit - 1),
              digit,
              label + ' input',
            );
          }
        }
        if (
          (mode === 'normal' &&
            [
              [320, 568],
              [414, 736],
              [568, 320],
              [820, 1180],
              [1180, 820],
            ].some(([w, h]) => w === width && h === height)) ||
          (mode === 'world' && width === 414 && height === 736)
        )
          await page.screenshot({ path: `${out}/${name}-${mode}-${width}x${height}.png` });
        report.push({ engine: name, mode, width, height, passed: true, geometry });
      }
    }
    // Safe-area inset equivalent: available content height must be respected.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addStyleTag({ content: 'body {padding:47px 0 34px;}' });
    await page.waitForTimeout(100);
    const safe = await page.evaluate(() => {
      const r = document.querySelector('#numpad').getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, availableBottom: innerHeight - 34 };
    });
    assert(safe.bottom <= safe.availableBottom + 0.5, name + ' safe area');
    report.push({ engine: name, scenario: 'safe-area', passed: true, ...safe });
  } finally {
    await browser.close();
  }
}
assert.deepEqual(errors, []);
await fs.writeFile(
  `${out}/report.json`,
  JSON.stringify(
    { url, cases: report.length, engines: ['chromium', 'webkit'], allPassed: true, errors, report },
    null,
    2,
  ),
);
console.log(JSON.stringify({ cases: report.length, allPassed: true, errors }));
