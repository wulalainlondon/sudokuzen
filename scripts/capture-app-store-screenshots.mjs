import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const baseUrl = process.env.APP_URL || 'http://127.0.0.1:4180';
const outputDir = 'app-store/screenshots/zh-TW/iphone-6.9';
await mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 440, height: 956 },
  deviceScaleFactor: 3,
  locale: 'zh-TW',
  colorScheme: 'light',
});

async function openApp() {
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.addInitScript(() => {
    const techniques = ['naked_single', 'hidden_single', 'locked_candidates'];
    const practiceRecords = {};
    techniques.forEach((technique, techniqueIndex) => {
      for (let index = 0; index < 3; index++) {
        practiceRecords[`${techniqueIndex}-${index}`] = {
          time: 20,
          stars: 3,
          techKey: technique,
          replayHistory: [],
        };
      }
    });
    localStorage.setItem(
      'sudoku_records',
      JSON.stringify({
        9001: { time: 32, stars: 3 },
        9002: { time: 45, stars: 3 },
        9003: { time: 51, stars: 3 },
      }),
    );
    localStorage.setItem('sudoku_teach_read', JSON.stringify({ 1: true, 2: true, 3: true }));
    localStorage.setItem('sudoku_practice_records', JSON.stringify(practiceRecords));
    localStorage.setItem('sudoku_techniques_used', JSON.stringify(techniques));
  });
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => document.documentElement.classList.add('native-app'));
  await page.waitForSelector('#level-screen', { state: 'visible' });
  await page.waitForFunction(() => document.querySelectorAll('#stage-map .stage-node').length > 0);
  return { page, errors };
}

async function capture(name, action) {
  const { page, errors } = await openApp();
  await action(page);
  await page.waitForTimeout(700);
  if (errors.length) throw new Error(`${name}: ${errors.join('; ')}`);
  await page.screenshot({ path: `${outputDir}/${name}.png`, fullPage: false });
  await page.close();
}

await capture('01-training-journey', async () => {});

await capture('02-technique-library', async (page) => {
  await page.click('#library-btn');
  await page.waitForFunction(() => document.querySelectorAll('.library-card').length >= 40);
});

await capture('03-practice-tree', async (page) => {
  await page.click('#practice-entry-btn');
  await page.waitForSelector('.practice-tree-container', { state: 'visible' });
  await page.locator('.tree-node:not(.tree-node--locked)').first().click();
  await page.waitForSelector('#tier-view:not(.hidden)', { state: 'visible' });
  await page.waitForFunction(() => document.querySelectorAll('#level-list .level-item').length === 25);
});

await capture('04-world-trial', async (page) => {
  await page.click('#world-entry-btn');
  await page.waitForSelector('#wild-lobby', { state: 'visible' });
});

await capture('05-sudoku-board', async (page) => {
  await page.locator('#stage-map .stage-node:not(.locked)').first().click();
  await page.waitForSelector('#tier-view:not(.hidden)', { state: 'visible' });
  await page.locator('#level-list .level-item:not(.locked)').first().click();
  await page.waitForSelector('#pre-level-modal', { state: 'visible' });
  await page.click('#pre-level-start-btn');
  await page.waitForSelector('.game-container', { state: 'visible' });
});

await browser.close();
console.log(`Captured 5 App Store screenshots in ${outputDir}`);
