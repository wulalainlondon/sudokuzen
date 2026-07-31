import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const repoRoot = path.resolve(new URL('.', import.meta.url).pathname, '..');
const assetsDir = path.join(repoRoot, 'dist', 'assets');

const BUDGETS = {
  entryJsGzip: 210_000,
  // The entry stylesheet already sat above the old 26 KB limit before V15.
  // Keep a small, explicit ceiling while allowing the Duo finish/result UI.
  entryCssGzip: 30_000,
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

function readEntryAsset(indexHtml, pattern) {
  const match = indexHtml.match(pattern);
  return match?.[1] ? path.basename(match[1]) : null;
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

  const indexPath = path.join(repoRoot, 'dist', 'index.html');
  if (!fs.existsSync(indexPath)) {
    fail('Missing dist/index.html. Run `npm run build` first.');
    return;
  }

  const indexHtml = fs.readFileSync(indexPath, 'utf8');
  const entryJs = readEntryAsset(
    indexHtml,
    /<script\b[^>]*\btype=["']module["'][^>]*\bsrc=["']([^"']+\.js)["'][^>]*>/i,
  );
  const entryCss = readEntryAsset(
    indexHtml,
    /<link\b[^>]*\brel=["']stylesheet["'][^>]*\bhref=["']([^"']+\.css)["'][^>]*>/i,
  );
  if (!entryJs || !entryCss) {
    fail('Unable to resolve entry JavaScript and stylesheet from dist/index.html');
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
