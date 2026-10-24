// Run against the local Vite server. Stores only normalized digit masks, not image uploads or font files.
import { chromium } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.goto(process.argv[2] || 'http://localhost:5173/');
  const templates = await page.evaluate(async () => {
    await document.fonts.load('600 76px Outfit');
    await document.fonts.load('300 76px Outfit');
    if (!document.fonts.check('600 76px Outfit')) throw new Error('Outfit must be available to generate templates');
    const { createDigitTemplates } = await import('/src/features/recovery/screenshotReader.ts');
    return createDigitTemplates(['Outfit']).map(({ digit, glyph }) => ({
      digit,
      ratio: glyph.ratio,
      bits: glyph.pixels
        .join('')
        .match(/.{4}/g)
        .map((bits) => parseInt(bits, 2).toString(16))
        .join(''),
    }));
  });
  await writeFile(
    new URL('../src/features/recovery/outfitDigitTemplates.json', import.meta.url),
    JSON.stringify(templates) + '\n',
  );
  console.log(`Wrote ${templates.length} offline digit templates.`);
} finally {
  await browser.close();
}
