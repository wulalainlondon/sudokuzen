import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

function runValidator(): { code: number; stdout: string; stderr: string } {
  try {
    const stdout = execFileSync('node', ['scripts/validate-teach-data.mjs'], {
      encoding: 'utf8',
      timeout: 10000,
    });
    return { code: 0, stdout, stderr: '' };
  } catch (e: unknown) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    return { code: err.status ?? 1, stdout: err.stdout ?? '', stderr: err.stderr ?? '' };
  }
}

describe('teach-data.json validation', () => {
  it('real teach-data.json passes validation', () => {
    const result = runValidator();
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('validated');
  });

  it('is valid JSON with 40 modules', () => {
    const data = JSON.parse(fs.readFileSync('teach-data.json', 'utf8'));
    expect(Object.keys(data)).toHaveLength(40);
    for (let i = 1; i <= 40; i++) {
      expect(data[String(i)]).toBeDefined();
    }
  });

  it('every module has required fields', () => {
    const data = JSON.parse(fs.readFileSync('teach-data.json', 'utf8'));
    for (const [key, mod] of Object.entries(data) as [string, Record<string, unknown>][]) {
      expect(mod.technique, `[${key}] technique`).toBeTypeOf('string');
      expect(mod.name, `[${key}] name`).toBeTypeOf('string');
      expect(mod.subtitle, `[${key}] subtitle`).toBeTypeOf('string');
      expect(mod.explanation, `[${key}] explanation`).toBeInstanceOf(Array);
      expect(mod.example, `[${key}] example`).toBeDefined();
      const example = mod.example as { board?: unknown[]; steps?: unknown[] };
      expect(example.board, `[${key}] board`).toHaveLength(81);
      expect(example.steps?.length ?? 0, `[${key}] steps`).toBeGreaterThan(0);
    }
  });

  it('shards match source data', () => {
    const data = JSON.parse(fs.readFileSync('teach-data.json', 'utf8'));
    for (const key of ['1', '20', '40']) {
      const shardPath = `public/teach/${key}.json`;
      if (!fs.existsSync(shardPath)) continue;
      const shard = JSON.parse(fs.readFileSync(shardPath, 'utf8'));
      expect(shard.technique).toBe(data[key].technique);
      expect(shard.name).toBe(data[key].name);
    }
  });

  it('manifest version and module count match', () => {
    const manifestPath = 'public/teach/manifest.json';
    if (!fs.existsSync(manifestPath)) return;
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    expect(manifest.version).toBeTypeOf('string');
    expect(manifest.version.length).toBeGreaterThan(0);
    expect(manifest.totalModules).toBe(40);
    expect(Object.keys(manifest.modules)).toHaveLength(40);
  });
});
