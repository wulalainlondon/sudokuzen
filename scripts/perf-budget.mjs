import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { getBuildAssetGraph } from './build-asset-graph.mjs';

const repoRoot = path.resolve(new URL('.', import.meta.url).pathname, '..');
const assetsDir = path.join(repoRoot, 'dist', 'assets');

const BUDGETS = {
  entryJsGzip: 80_000,
  // The entry stylesheet already sat above the old 26 KB limit before V15.
  // Keep a small, explicit ceiling while allowing the Duo finish/result UI.
  entryCssGzip: 30_000,
  initialJsGzip: 280_000,
  criticalTotalGzip: 315_000,
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

  const graph = getBuildAssetGraph(path.join(repoRoot, 'dist'));
  const sizeOf = file => gzipSize(path.join(repoRoot, 'dist', file));
  const jsGzip = sizeOf(graph.entryJs);
  const cssGzip = graph.entryCss.reduce((sum, file) => sum + sizeOf(file), 0);
  const initialJsGzip = graph.js.reduce((sum, file) => sum + sizeOf(file), 0);
  const initialCssGzip = graph.css.reduce((sum, file) => sum + sizeOf(file), 0);
  const criticalTotal = initialJsGzip + initialCssGzip;

  checkBudget(`entry js gzip (${path.basename(graph.entryJs)})`, jsGzip, BUDGETS.entryJsGzip);
  checkBudget('entry css gzip', cssGzip, BUDGETS.entryCssGzip);
  checkBudget(`initial JS graph gzip (${graph.js.length} files)`, initialJsGzip, BUDGETS.initialJsGzip);
  checkBudget('initial JS + CSS graph gzip', criticalTotal, BUDGETS.criticalTotalGzip);

  if (process.exitCode && process.exitCode !== 0) {
    console.error('\nPerformance budget check failed.');
    process.exit(process.exitCode);
  }
  console.log('\nPerformance budget check passed.');
}

main();
