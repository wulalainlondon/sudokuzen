#!/usr/bin/env node
/**
 * Post-build smoke test — verifies the dist/ output won't break at runtime.
 * Runs after `vite build` to catch data/build mismatches before deploy.
 */
import fs from 'node:fs';
import path from 'node:path';

const errors = [];
const check = (ok, msg) => { if (!ok) errors.push(msg); };

// ── 1. dist/ exists and has expected files ───────────────────────
const dist = 'dist';
check(fs.existsSync(dist), 'dist/ directory missing — did build run?');

const requiredFiles = ['index.html', 'sw.js', 'levels.js', 'teach/manifest.json'];
for (const f of requiredFiles) {
  check(fs.existsSync(path.join(dist, f)), `Missing ${f} in dist/`);
}

// ── 2. index.html does NOT reference techniques.js ───────────────
const indexHtml = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
check(!indexHtml.includes('src="techniques.js"'), 'index.html still loads techniques.js — should be removed (lazy-load via shards)');

// ── 3. teach manifest is valid and has 40 modules ────────────────
const manifestPath = path.join(dist, 'teach', 'manifest.json');
if (fs.existsSync(manifestPath)) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  check(manifest.version && manifest.version.length > 0, 'Teach manifest missing version');
  check(manifest.totalModules === 40, `Teach manifest has ${manifest.totalModules} modules, expected 40`);

  // Spot-check a few shards exist
  for (const key of ['1', '20', '40']) {
    const shardPath = path.join(dist, 'teach', `${key}.json`);
    check(fs.existsSync(shardPath), `Missing teach shard ${key}.json in dist/`);
  }
}

// ── 4. SW pre-cache list sanity ──────────────────────────────────
const swContent = fs.readFileSync(path.join(dist, 'sw.js'), 'utf8');
check(swContent.includes('teach/manifest.json'), 'SW missing teach/manifest.json in pre-cache list');
check(!swContent.includes("'techniques.js'"), 'SW still pre-caches techniques.js — should be removed');

// ── 5. JS bundle size gate ───────────────────────────────────────
const jsFiles = fs.readdirSync(path.join(dist, 'assets')).filter((f) => f.endsWith('.js'));
for (const f of jsFiles) {
  const size = fs.statSync(path.join(dist, 'assets', f)).size;
  check(size > 100, `${f} is suspiciously small (${size} bytes) — truncated build?`);
  check(size < 600_000, `${f} is ${Math.round(size / 1024)}KB — exceeds 600KB chunk limit`);
}

// ── Report ───────────────────────────────────────────────────────
if (errors.length > 0) {
  console.error(`\n✗ Smoke test failed (${errors.length} errors):\n`);
  errors.forEach((e) => console.error(`  • ${e}`));
  process.exit(1);
} else {
  console.log(`✓ Smoke test passed: ${requiredFiles.length} files verified, chunks within limits`);
}
