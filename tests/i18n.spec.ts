import { describe, expect, it, beforeEach } from 'vitest';
import { t, setLocale } from '../src/i18n/t';
import { zhTW } from '../src/i18n/locale/zh-TW';

describe('i18n t()', () => {
  beforeEach(() => {
    // Reset to default locale before each test
    setLocale(zhTW);
  });

  it("t('app.title') returns 'SUDOKU ZEN'", () => {
    expect(t('app.title')).toBe('SUDOKU ZEN');
  });

  it("t('mode.practice') returns '修行'", () => {
    expect(t('mode.practice')).toBe('修行');
  });

  it("t('nonexistent.key') returns the key itself (fallback)", () => {
    expect(t('nonexistent.key')).toBe('nonexistent.key');
  });

  it("t('feedback.errorRemaining', { remaining: '2' }) returns string containing '2'", () => {
    const result = t('feedback.errorRemaining', { remaining: '2' });
    expect(result).toContain('2');
    expect(result).not.toContain('{remaining}');
  });

  it("t('wild.online', { count: '5' }) returns string containing '5'", () => {
    const result = t('wild.online', { count: '5' });
    expect(result).toContain('5');
    expect(result).not.toContain('{count}');
  });

  it('nested key access works for deeply nested paths', () => {
    // practice.phase1 is nested under 'practice' key
    const result = t('practice.phase1');
    expect(result).toBe('基礎定式流');
  });

  it('all top-level keys in zh-TW.ts are accessible', () => {
    const topKeys = Object.keys(zhTW);
    expect(topKeys.length).toBeGreaterThan(0);

    // Recursively find a leaf string key under a namespace
    function findLeafKey(obj: Record<string, unknown>, prefix: string): string | null {
      for (const k of Object.keys(obj)) {
        const fullKey = `${prefix}.${k}`;
        if (typeof obj[k] === 'string') return fullKey;
        if (obj[k] && typeof obj[k] === 'object') {
          const found = findLeafKey(obj[k] as Record<string, unknown>, fullKey);
          if (found) return found;
        }
      }
      return null;
    }

    for (const key of topKeys) {
      const val = zhTW[key as keyof typeof zhTW];
      if (typeof val === 'string') {
        expect(t(key)).toBe(val);
      } else if (typeof val === 'object') {
        // Find a leaf string key to verify namespace is accessible
        const leafKey = findLeafKey(val, key);
        expect(leafKey).not.toBeNull();
        if (leafKey) {
          const result = t(leafKey);
          expect(result).not.toBe(leafKey);
        }
      }
    }
  });

  it('setLocale switches the active locale', () => {
    const custom = {
      app: { title: 'TEST TITLE' },
      mode: { practice: 'Practice' },
    };
    setLocale(custom);
    expect(t('app.title')).toBe('TEST TITLE');
    expect(t('mode.practice')).toBe('Practice');
  });

  it('after setLocale to a partial locale, missing keys fall back to key name', () => {
    const partial = {
      app: { title: 'Hello' },
    };
    setLocale(partial);
    expect(t('app.title')).toBe('Hello');
    // 'mode.practice' doesn't exist in partial — should return the key itself
    expect(t('mode.practice')).toBe('mode.practice');
  });

  it('interpolation replaces multiple occurrences of same variable', () => {
    const custom = {
      test: { msg: '{x} and {x}' },
    };
    setLocale(custom);
    expect(t('test.msg', { x: 'A' })).toBe('A and A');
  });
});
