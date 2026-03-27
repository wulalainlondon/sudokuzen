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

// ── Levels & Mid-Pool data access ────────────────────────────────

/** Read levels from levels-data.json (source of truth). */
export function readLevelsData() {
  return JSON.parse(fs.readFileSync('levels-data.json', 'utf8'));
}

/** Write levels to levels-data.json + generate levels.js wrapper. */
export function writeLevelsData(levels) {
  const json = JSON.stringify(levels, null, 2);
  fs.writeFileSync('levels-data.json', json, 'utf8');
  console.log(`Wrote levels-data.json (${Math.round(json.length / 1024)} KB, ${levels.length} levels)`);

  const js = `/**\n * ⚠️  自動產生，勿手動編輯 — 修改 levels-data.json 後執行 npm run build:data\n */\nconst levels = ${json};\n`;
  fs.writeFileSync('levels.js', js, 'utf8');
  console.log(`Wrote levels.js (${Math.round(js.length / 1024)} KB)`);
}

/** Read mid-pool from mid-pool-data.json (source of truth). */
export function readMidPoolData() {
  return JSON.parse(fs.readFileSync('mid-pool-data.json', 'utf8'));
}

/** Write mid-pool to mid-pool-data.json + generate mid_pool.js wrapper. */
export function writeMidPoolData(pool) {
  const json = JSON.stringify(pool, null, 2);
  fs.writeFileSync('mid-pool-data.json', json, 'utf8');
  console.log(`Wrote mid-pool-data.json (${Math.round(json.length / 1024)} KB, ${pool.length} levels)`);

  const js = `/**\n * ⚠️  自動產生，勿手動編輯 — 修改 mid-pool-data.json 後執行 npm run build:data\n */\nconst midPool = ${json};\n`;
  fs.writeFileSync('mid_pool.js', js, 'utf8');
  console.log(`Wrote mid_pool.js (${Math.round(js.length / 1024)} KB)`);
}
