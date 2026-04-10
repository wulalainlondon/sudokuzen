import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const VALIDATOR_SCRIPT = path.resolve('scripts/validate-teach-data.mjs');

function writeTempTeachData(mutator?: (data: Record<string, unknown>) => void): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'teach-data-'));
  const filePath = path.join(dir, 'teach-data.json');
  const data = JSON.parse(fs.readFileSync('teach-data.json', 'utf8')) as Record<string, unknown>;
  mutator?.(data);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  return dir;
}

function runValidator(options: { strict?: boolean; cwd?: string; baselineFile?: string } = {}): {
  code: number;
  stdout: string;
  stderr: string;
} {
  const result = spawnSync('node', [VALIDATOR_SCRIPT], {
    cwd: options.cwd,
    env: {
      ...process.env,
      ...(options.strict ? { TEACH_VALIDATE_STRICT: '1' } : {}),
      ...(options.baselineFile ? { TEACH_VALIDATE_BASELINE_FILE: options.baselineFile } : {}),
    },
    encoding: 'utf8',
    timeout: 10000,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  return {
    code: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

describe('teach-data.json validation', () => {
  it('real teach-data.json passes validation', () => {
    const result = runValidator();
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('validated');
    expect(result.stdout).not.toContain('notice(s)');
  });

  it('strict mode passes on the current teach-data.json', () => {
    const result = runValidator({ strict: true });
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('validated');
    expect(result.stdout).not.toContain('notice(s)');
  });

  it('strict mode fails when a new empty-interaction notice is introduced', () => {
    const cwd = writeTempTeachData((data) => {
      const module33 = data['33'] as { practice?: Array<{ answer?: Record<string, unknown> }> };
      const practice = module33.practice?.[0];
      if (!practice?.answer) throw new Error('expected practice answer to exist');
      practice.answer.eliminates = [];
      practice.answer.fills = [];
    });
    const result = runValidator({ strict: true, cwd });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('validation failed');
    expect(result.stderr).toContain('new notice(s) must be fixed');
    expect(result.stderr).toContain(
      "New notice: [33] practice[0] answer.eliminates and answer.fills are empty (practice won't be interactive)",
    );
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
