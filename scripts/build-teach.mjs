#!/usr/bin/env node
/**
 * Build teach data artifacts from teach-data.json (source of truth).
 *
 * Outputs:
 *   techniques.js          — runtime global for <script> tag (backwards compat)
 *   public/teach/manifest.json — version manifest for lazy-load shards
 *   public/teach/1.json … 40.json — per-technique shards for lazy loading
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const TD = JSON.parse(fs.readFileSync('teach-data.json', 'utf8'));
const keys = Object.keys(TD).sort((a, b) => Number(a) - Number(b));

// ── 1. techniques.js (Phase 1 compat) ────────────────────────────
const header = `/**
 * 數獨技巧教學資料 — 秘笈 1 ~ 40
 * ⚠️  自動產生，勿手動編輯 — 修改 teach-data.json 後執行 npm run build:teach
 */
`;
const js = header + 'const TEACH_DATA = ' + JSON.stringify(TD, null, 2) + ';\n';
fs.writeFileSync('techniques.js', js, 'utf8');
console.log(`✓ techniques.js (${Math.round(js.length / 1024)} KB)`);

// ── 2. Per-technique shards ──────────────────────────────────────
const shardDir = path.join('public', 'teach');
fs.mkdirSync(shardDir, { recursive: true });

const shardMeta = {};
for (const key of keys) {
  const shard = JSON.stringify(TD[key]);
  fs.writeFileSync(path.join(shardDir, `${key}.json`), shard, 'utf8');
  shardMeta[key] = {
    technique: TD[key].technique,
    name: TD[key].name,
    subtitle: TD[key].subtitle || '',
    hasPractice: Array.isArray(TD[key].practice) && TD[key].practice.length > 0,
    size: shard.length,
  };
}
console.log(`✓ ${keys.length} shards → public/teach/`);

// ── 3. Manifest with content hash ────────────────────────────────
const fullHash = crypto.createHash('sha256').update(JSON.stringify(TD)).digest('hex').slice(0, 12);
const manifest = {
  version: fullHash,
  generatedAt: new Date().toISOString(),
  totalModules: keys.length,
  modules: shardMeta,
};
fs.writeFileSync(path.join(shardDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
console.log(`✓ manifest.json (version: ${fullHash})`);
