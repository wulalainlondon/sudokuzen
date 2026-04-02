import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(new URL('.', import.meta.url).pathname, '..');

function fail(msg) {
  console.error(`✗ ${msg}`);
  process.exitCode = 1;
}

function pass(msg) {
  console.log(`✓ ${msg}`);
}

function readText(relPath) {
  return fs.readFileSync(path.join(repoRoot, relPath), 'utf8');
}

function parseVersion(text, re, label) {
  const match = text.match(re);
  if (!match) {
    fail(`Unable to parse ${label}`);
    return null;
  }
  return match[1];
}

function checkLocalVersionConsistency() {
  const versionTs = readText('src/config/version.ts');
  const sw = readText('sw.js');
  const html = readText('index.html');

  const appVersion = parseVersion(versionTs, /APP_VERSION\s*=\s*['"]([^'"]+)['"]/, 'APP_VERSION');
  const cacheVersion = parseVersion(sw, /CACHE_VERSION\s*=\s*['"]([^'"]+)['"]/, 'CACHE_VERSION');
  const inlineVersion = parseVersion(html, /INLINE_VER\s*=\s*['"]([^'"]+)['"]/, 'INLINE_VER');
  if (!appVersion || !cacheVersion || !inlineVersion) return;

  if (appVersion !== cacheVersion || appVersion !== inlineVersion) {
    fail(`Version mismatch: APP=${appVersion}, CACHE=${cacheVersion}, INLINE=${inlineVersion}`);
  } else {
    pass(`Version consistent: ${appVersion}`);
  }
}

function checkNormalShardNonEmpty() {
  const manifestPath = path.join(repoRoot, 'public', 'data', 'manifest.json');
  const normalPath = path.join(repoRoot, 'public', 'data', 'normal.json');

  if (!fs.existsSync(manifestPath)) {
    fail('Missing public/data/manifest.json');
    return;
  }
  if (!fs.existsSync(normalPath)) {
    fail('Missing public/data/normal.json');
    return;
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const normalMeta = manifest?.shards?.normal;
  if (!normalMeta || typeof normalMeta.count !== 'number') {
    fail('Manifest missing shards.normal.count');
    return;
  }

  const normalLevels = JSON.parse(fs.readFileSync(normalPath, 'utf8'));
  if (!Array.isArray(normalLevels) || normalLevels.length === 0) {
    fail('normal.json is empty');
    return;
  }
  if (normalLevels.length !== normalMeta.count) {
    fail(`normal.json length (${normalLevels.length}) != manifest count (${normalMeta.count})`);
    return;
  }
  pass(`Normal shard non-empty and consistent (${normalLevels.length} levels)`);
}

async function checkLiveVersions(urls) {
  for (const url of urls) {
    try {
      const res = await fetch(url, { redirect: 'follow' });
      if (!res.ok) {
        fail(`Live check failed for ${url}: HTTP ${res.status}`);
        continue;
      }
      const html = await res.text();
      const inline = parseVersion(html, /INLINE_VER\s*=\s*['"]([^'"]+)['"]/, `INLINE_VER from ${url}`);
      if (!inline) continue;
      pass(`Live ${url} INLINE_VER=${inline}`);
    } catch (e) {
      fail(`Live check error for ${url}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const live = args.has('--live');

  checkLocalVersionConsistency();
  checkNormalShardNonEmpty();

  if (live) {
    await checkLiveVersions([
      'https://sudokuzen-f2aa3.web.app/',
      'https://wulalainlondon.github.io/sudokuzen/',
    ]);
  }

  if (process.exitCode && process.exitCode !== 0) {
    console.error('\nRelease checks failed.');
    process.exit(process.exitCode);
  }
  console.log('\nRelease checks passed.');
}

main();
