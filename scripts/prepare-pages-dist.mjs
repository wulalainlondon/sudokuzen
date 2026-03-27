import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const distDir = path.join(root, 'dist');

if (!fs.existsSync(distDir)) {
  throw new Error('dist directory not found. Run "npm run build" first.');
}

// Files that need manual copy (NOT in public/, so Vite doesn't handle them)
const requiredFiles = [
  'levels.js',
  // techniques.js removed — teach data now lazy-loads via public/teach/*.json shards
  'mid_pool.js',
  'firebase-config.js',
  'sw.js',
  'style.css',
  // manifest.json, icons are in public/ → Vite copies them automatically
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

// Keep an optional local override script path to avoid runtime 404.
const localConfig = path.join(root, 'firebase-config.local.js');
const localDest = path.join(distDir, 'firebase-config.local.js');
if (fs.existsSync(localConfig)) {
  fs.copyFileSync(localConfig, localDest);
} else {
  fs.writeFileSync(localDest, '// local firebase override (optional)\n', 'utf8');
}

console.log('Prepared dist/ for GitHub Pages deployment.');
