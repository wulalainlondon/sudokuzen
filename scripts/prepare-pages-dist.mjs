import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const distDir = path.join(root, 'dist');

if (!fs.existsSync(distDir)) {
  throw new Error('dist directory not found. Run "npm run build" first.');
}

// Files that need manual copy (NOT in public/, so Vite doesn't handle them)
const requiredFiles = [
  'levels.js',        // legacy compat (normal only) — will be removed after full migration
  // mid_pool.js removed — merged into levels-data.json
  // techniques.js removed — teach data now lazy-loads via public/teach/*.json shards
  // Level data now lazy-loads via public/data/*.json shards (Vite copies public/ automatically)
  'sw.js',
  'style.css',
];

for (const rel of requiredFiles) {
  const src = path.join(root, rel);
  const dest = path.join(distDir, rel);
  if (!fs.existsSync(src)) {
    console.warn(`[prepare-pages-dist] skip missing file: ${rel}`);
    continue;
  }
  fs.copyFileSync(src, dest);
}

// CI and local release tooling generate the runtime Firebase config under public/.
// Prefer it over the root placeholder so prepare-pages-dist does not overwrite a
// valid Vite-copied production config with an intentionally credential-free stub.
const firebaseConfigCandidates = [
  path.join(root, 'public', 'firebase-config.js'),
  path.join(root, 'firebase-config.js'),
];
const firebaseConfigSource = firebaseConfigCandidates.find((candidate) => fs.existsSync(candidate));
if (!firebaseConfigSource) {
  throw new Error('firebase-config.js is missing');
}
fs.copyFileSync(firebaseConfigSource, path.join(distDir, 'firebase-config.js'));

// Keep an optional local override script path to avoid runtime 404.
const localConfig = path.join(root, 'firebase-config.local.js');
const localDest = path.join(distDir, 'firebase-config.local.js');
if (fs.existsSync(localConfig)) {
  fs.copyFileSync(localConfig, localDest);
} else {
  fs.writeFileSync(localDest, '// local firebase override (optional)\n', 'utf8');
}

console.log('Prepared dist/ for GitHub Pages deployment.');
