import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

describe('content-addressed data builds', () => {
  it('keeps manifests identical across rebuilds and changes only the edited shard hash', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sudoku-data-version-'));
    directories.push(directory);
    const levels = [
      { id: 1, mode: 'normal', displayName: '中文測試', puzzle: [0], solution: [1] },
      { id: 2, mode: 'practice', displayName: 'Practice', puzzle: [0], solution: [2] },
    ];
    const source = path.join(directory, 'levels-data.json');
    fs.writeFileSync(source, JSON.stringify(levels));
    const build = () =>
      execFileSync(process.execPath, [path.resolve('scripts/build-data.mjs')], { cwd: directory, stdio: 'pipe' });
    const manifestPath = path.join(directory, 'public/data/manifest.json');
    build();
    const firstText = fs.readFileSync(manifestPath, 'utf8');
    const first = JSON.parse(firstText);
    build();
    expect(fs.readFileSync(manifestPath, 'utf8')).toBe(firstText);
    expect(first.shards.normal.size).toBe(fs.statSync(path.join(directory, 'public/data/normal.json')).size);
    levels[0].puzzle = [1];
    fs.writeFileSync(source, JSON.stringify(levels));
    build();
    const changed = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    expect(changed.version).not.toBe(first.version);
    expect(changed.shards.normal.hash).not.toBe(first.shards.normal.hash);
    expect(changed.shards.practice.hash).toBe(first.shards.practice.hash);
  });

  it('keeps the compact teaching catalog aligned with the full source', () => {
    const source = JSON.parse(fs.readFileSync('teach-data.json', 'utf8')) as Record<
      string,
      { name: string; technique: string }
    >;
    const catalog = JSON.parse(fs.readFileSync('src/data/teachCatalog.json', 'utf8'));
    expect(catalog).toEqual(
      Object.fromEntries(
        Object.entries(source).map(([id, value]) => [id, { name: value.name, technique: value.technique }]),
      ),
    );
    expect(fs.statSync('src/data/teachCatalog.json').size).toBeLessThan(10_000);
  });
});
