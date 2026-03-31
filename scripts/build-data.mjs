#!/usr/bin/env node
/**
 * Build runtime data files from levels-data.json (source of truth).
 *
 * Output: public/data/manifest.json + shards
 *   - normal.json        (mode=normal)
 *   - practice.json      (mode=practice)
 *   - world-T01.json ... world-T12.json (mode=world, split by techTier)
 *
 * Each shard is a compact JSON array (no pretty-print, ~30-50% smaller).
 * Manifest lists shards with counts and sizes for lazy loading.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const DATA_DIR = path.join('public', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// Read source of truth
const allLevels = JSON.parse(fs.readFileSync('levels-data.json', 'utf8'));
console.log(`Source: ${allLevels.length} levels`);

// Compact level: strip whitespace-heavy fields for runtime
// puzzle/solution stay as arrays (compact JSON is fine)
function compactLevel(l) {
  return {
    id: l.id,
    s: l.stars,
    dn: l.difficultyName,
    dp: l.displayName,
    p: l.puzzle,
    sl: l.solution,
    mt: l.maxTechnique || '',
    tt: l.techTier || '',
    ds: l.difficultyScore ?? 0,
    ls: l.logicSolvable ?? true,
    sr: l.singleRatio ?? 0,
    src: l.source || '',
  };
}

// Restore full field names at runtime (done in dataRegistry)
// This saves ~40% JSON size by using short keys

const shards = {};

// Split by mode
const normal = allLevels.filter(l => l.mode === 'normal');
const practice = allLevels.filter(l => l.mode === 'practice');
const world = allLevels.filter(l => l.mode === 'world');

// Normal: single shard
shards['normal'] = normal;

// Practice: single shard
shards['practice'] = practice;

// World: split by techTier
const worldByTier = {};
for (const l of world) {
  const tier = l.techTier || 'T00';
  if (!worldByTier[tier]) worldByTier[tier] = [];
  worldByTier[tier].push(l);
}
for (const [tier, levels] of Object.entries(worldByTier)) {
  shards[`world-${tier}`] = levels;
}

// Write shards + build manifest
const version = crypto.randomBytes(6).toString('hex');
const manifest = {
  version,
  generatedAt: new Date().toISOString(),
  totalLevels: allLevels.length,
  shards: {},
};

for (const [name, levels] of Object.entries(shards)) {
  const compact = levels.map(compactLevel);
  const json = JSON.stringify(compact);
  const filename = `${name}.json`;
  const filepath = path.join(DATA_DIR, filename);
  fs.writeFileSync(filepath, json, 'utf8');

  manifest.shards[name] = {
    file: filename,
    count: levels.length,
    size: json.length,
  };

  const kb = Math.round(json.length / 1024);
  console.log(`  ${filename}: ${levels.length} levels (${kb} KB)`);
}

// Write manifest
const manifestJson = JSON.stringify(manifest, null, 2);
fs.writeFileSync(path.join(DATA_DIR, 'manifest.json'), manifestJson, 'utf8');
console.log(`\nManifest: ${Object.keys(manifest.shards).length} shards, version ${version}`);
console.log(`Total: ${allLevels.length} levels`);

// Also keep legacy files for backward compat during transition
// (can be removed once all consumers are migrated)
const legacyJs = `/** ⚠️ Legacy — use public/data/*.json shards instead */\nconst levels = ${JSON.stringify(normal)};\n`;
fs.writeFileSync('levels.js', legacyJs, 'utf8');
console.log(`\nLegacy levels.js: ${Math.round(legacyJs.length / 1024)} KB (normal only)`);
