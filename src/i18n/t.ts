// i18n accessor — simple key-based string lookup.
// Usage: t('win.heading.normal') → 'PERFECT FLOW'
// For interpolation: t('feedback.errorRemaining', { remaining: 2 }) → '錯誤！2 次機會剩餘'

import { zhTW } from './locale/zh-TW';

type StringTable = typeof zhTW;
type FlatKeys<T, Prefix extends string = ''> =
  T extends Record<string, unknown>
    ? { [K in keyof T & string]: T[K] extends Record<string, unknown>
        ? FlatKeys<T[K], `${Prefix}${K}.`>
        : `${Prefix}${K}`
      }[keyof T & string]
    : never;

export type I18nKey = FlatKeys<StringTable>;

let _locale: Record<string, unknown> = zhTW;

/** Set the active locale (for future language switching). */
export function setLocale(locale: Record<string, unknown>): void {
  _locale = locale;
}

/** Get a translated string by dot-separated key. Supports {var} interpolation. */
export function t(key: string, vars?: Record<string, string | number>): string {
  const parts = key.split('.');
  let node: unknown = _locale;
  for (const part of parts) {
    if (node && typeof node === 'object' && part in (node as Record<string, unknown>)) {
      node = (node as Record<string, unknown>)[part];
    } else {
      // Key not found — return key itself as fallback
      return key;
    }
  }
  let result = typeof node === 'string' ? node : key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      result = result.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    }
  }
  return result;
}
