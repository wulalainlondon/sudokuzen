import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const repoRoot = path.resolve(new URL('.', import.meta.url).pathname, '..');
const assetsDir = path.join(repoRoot, 'dist', 'assets');

const BUDGETS = {
  entryJsGzip: 210_000,
  entryCssGzip: 26_000,
  criticalTotalGzip: 236_000,
};

function fail(msg) {
  console.error(`✗ ${msg}`);
  process.exitCode = 1;
}

function pass(msg) {
  console.log(`✓ ${msg}`);
}

function gzipSize(filePath) {
  const data = fs.readFileSync(filePath);
  return zlib.gzipSync(data, { level: zlib.constants.Z_BEST_COMPRESSION }).length;
}

function pickEntryAsset(files, ext) {
  const candidates = files.filter((name) => name.startsWith('index-') && name.endsWith(ext));
  if (!candidates.length) return null;
  return candidates
    .map((name) => ({ name, mtime: fs.statSync(path.join(assetsDir, name)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime)[0].name;
}

function checkBudget(label, value, max) {
  if (value > max) fail(`${label}: ${value} bytes > budget ${max}`);
  else pass(`${label}: ${value} bytes (budget ${max})`);
}

function main() {
  if (!fs.existsSync(assetsDir)) {
    fail('Missing dist/assets. Run `npm run build` first.');
    return;
  }

  const files = fs.readdirSync(assetsDir);
  const entryJs = pickEntryAsset(files, '.js');
  const entryCss = pickEntryAsset(files, '.css');
  if (!entryJs || !entryCss) {
    fail('Unable to find dist/assets/index-*.js and index-*.css');
    return;
  }

  const jsGzip = gzipSize(path.join(assetsDir, entryJs));
  const cssGzip = gzipSize(path.join(assetsDir, entryCss));
  const criticalTotal = jsGzip + cssGzip;

  checkBudget(`entry js gzip (${entryJs})`, jsGzip, BUDGETS.entryJsGzip);
  checkBudget(`entry css gzip (${entryCss})`, cssGzip, BUDGETS.entryCssGzip);
  checkBudget('critical total gzip (entry js + css)', criticalTotal, BUDGETS.criticalTotalGzip);

  if (process.exitCode && process.exitCode !== 0) {
    console.error('\nPerformance budget check failed.');
    process.exit(process.exitCode);
  }
  console.log('\nPerformance budget check passed.');
}

main();
