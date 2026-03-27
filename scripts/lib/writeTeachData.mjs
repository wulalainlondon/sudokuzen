import fs from 'node:fs';

/**
 * Write TEACH_DATA to teach-data.json (source of truth)
 * and generate techniques.js (runtime wrapper for <script> tag).
 *
 * All scripts that modify teach data should use this instead of
 * writing directly, to keep the format consistent.
 */
export function writeTeachData(TD) {
  // Source of truth: pure JSON
  const json = JSON.stringify(TD, null, 2);
  fs.writeFileSync('teach-data.json', json, 'utf8');
  console.log(`Wrote teach-data.json (${Math.round(json.length / 1024)} KB)`);

  // Runtime wrapper: thin JS that assigns the global
  const header = `/**
 * 數獨技巧教學資料 — 秘笈 1 ~ 40
 * ⚠️  自動產生，勿手動編輯 — 修改 teach-data.json 後執行 npm run build:teach
 */
`;
  const js = header + 'const TEACH_DATA = ' + json + ';\n';
  fs.writeFileSync('techniques.js', js, 'utf8');
  console.log(`Wrote techniques.js (${Math.round(js.length / 1024)} KB)`);
}

/**
 * Read TEACH_DATA from teach-data.json (source of truth).
 * Replaces the old `new Function(code + '; return TEACH_DATA;')` pattern.
 */
export function readTeachData() {
  return JSON.parse(fs.readFileSync('teach-data.json', 'utf8'));
}
