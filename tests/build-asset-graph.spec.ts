import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

describe('initial build asset graph', () => {
  it('includes nested static imports and CSS, but does not preload dynamic feature chunks', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sudoku-assets-'));
    try {
      fs.mkdirSync(path.join(directory, '.vite'));
      fs.mkdirSync(path.join(directory, 'assets'));
      fs.writeFileSync(
        path.join(directory, 'index.html'),
        '<script type="module" src="/sudokuzen/assets/main.js"></script>',
      );
      const manifest = {
        'index.html': {
          isEntry: true,
          file: 'assets/main.js',
          imports: ['shared'],
          dynamicImports: ['src/world.ts'],
          css: ['assets/main.css'],
        },
        shared: { file: 'assets/shared.js', imports: ['base'] },
        base: { file: 'assets/base.js', imports: ['shared'] },
        'src/world.ts': { file: 'assets/world.js', isDynamicEntry: true },
      };
      fs.writeFileSync(path.join(directory, '.vite/manifest.json'), JSON.stringify(manifest));
      for (const file of ['main.js', 'shared.js', 'base.js', 'world.js', 'main.css'])
        fs.writeFileSync(path.join(directory, 'assets', file), 'test');
      const script = `import { getBuildAssetGraph } from ${JSON.stringify(pathToFileURL(path.resolve('scripts/build-asset-graph.mjs')).href)}; console.log(JSON.stringify(getBuildAssetGraph(process.argv[1])));`;
      const graph = JSON.parse(
        execFileSync(process.execPath, ['--input-type=module', '-e', script, directory], { encoding: 'utf8' }),
      );
      expect(graph.assets).toEqual(['assets/base.js', 'assets/main.css', 'assets/main.js', 'assets/shared.js']);
      expect(graph.js).toHaveLength(3);
      expect(graph.offlineAssets).toContain('assets/world.js');
      fs.rmSync(path.join(directory, 'assets/base.js'));
      expect(() =>
        execFileSync(process.execPath, ['--input-type=module', '-e', script, directory], { stdio: 'pipe' }),
      ).toThrow();
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });
});
