import fs from 'node:fs';
import path from 'node:path';

// Vite's manifest distinguishes static imports from dynamic imports. Use that
// graph for both offline shell caching and the initial-load performance budget.
export function getBuildAssetGraph(distDir) {
  const html = fs.readFileSync(path.join(distDir, 'index.html'), 'utf8');
  const entryName = html.match(/<script\b[^>]*\btype=["']module["'][^>]*\bsrc=["']([^"']+\.js)["']/i)?.[1];
  if (!entryName) throw new Error('Missing module entry in dist/index.html');
  const manifest = JSON.parse(fs.readFileSync(path.join(distDir, '.vite', 'manifest.json'), 'utf8'));
  const entryKey = Object.keys(manifest).find(key => manifest[key].isEntry && path.basename(manifest[key].file) === path.basename(entryName));
  if (!entryKey) throw new Error('Module entry is absent from the Vite manifest');
  const visited = new Set();
  const assets = new Set();
  const visit = key => {
    if (visited.has(key)) return;
    visited.add(key);
    const chunk = manifest[key];
    if (!chunk) throw new Error(`Missing static dependency: ${key}`);
    for (const file of [chunk.file, ...(chunk.css || []), ...(chunk.assets || [])]) {
      if (!file || file.includes('..') || path.isAbsolute(file)) throw new Error(`Invalid build asset: ${file}`);
      if (!fs.existsSync(path.join(distDir, file))) throw new Error(`Missing build asset: ${file}`);
      assets.add(file);
    }
    for (const dependency of chunk.imports || []) visit(dependency);
  };
  visit(entryKey);
  const initial = [...assets].sort();
  // Cache app-owned lazy screens for first-visit offline play, without adding
  // them to the initial execution graph or preloading Firebase network SDKs.
  for (const key of Object.keys(manifest)) {
    if (key.startsWith('src/') && manifest[key].isDynamicEntry) visit(key);
  }
  return {
    entryJs: manifest[entryKey].file,
    entryCss: manifest[entryKey].css || [],
    assets: initial,
    offlineAssets: [...assets].sort(),
    js: initial.filter(file => file.endsWith('.js')),
    css: initial.filter(file => file.endsWith('.css')),
  };
}
