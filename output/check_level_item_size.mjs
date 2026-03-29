import { chromium } from 'playwright';

const url = 'file:///Users/wulala/Downloads/AI/sudoku-webapp/index.html';
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 414, height: 896 }, deviceScaleFactor: 3 });
const page = await context.newPage();

await page.goto(url, { waitUntil: 'domcontentloaded' });

await page.evaluate(() => {
  const records = {};
  for (let id = 1; id <= 12000; id += 2) {
    records[id] = { time: 60 + (id % 120), stars: (id % 3) + 1 };
  }
  localStorage.setItem('sudoku_records', JSON.stringify(records));
});

await page.reload({ waitUntil: 'domcontentloaded' });

async function measure(tabIndex) {
  await page.click(`.tab-btn:nth-child(${tabIndex + 1})`);
  await page.waitForTimeout(150);
  return page.evaluate(() => {
    const items = Array.from(document.querySelectorAll('.level-item'));
    const dims = items.slice(0, 20).map((el) => {
      const r = el.getBoundingClientRect();
      return { w: Number(r.width.toFixed(3)), h: Number(r.height.toFixed(3)) };
    });
    const uniq = (arr) => Array.from(new Set(arr));
    return {
      count: items.length,
      widths: uniq(dims.map(d => d.w)),
      heights: uniq(dims.map(d => d.h)),
      sample: dims.slice(0, 6)
    };
  });
}

const tab1 = await measure(1); // 禪
const tab2 = await measure(2); // 虛空

console.log(JSON.stringify({ tab1, tab2 }, null, 2));

await page.screenshot({ path: '/Users/wulala/Downloads/AI/sudoku-webapp/output/level-size-check/with-records.png', fullPage: true });

await browser.close();
