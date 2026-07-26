import { t } from '../i18n/t';
import { isNativeApp } from './nativeApp';

function stableCode(playerId: string): string {
  let hash = 0;
  for (const char of playerId) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return String(1000 + (hash % 9000));
}

/**
 * The App Store build never displays player-authored text. Web keeps the
 * existing alias feature; native clients use a deterministic generated name.
 */
export function publicPlayerAlias(playerId: string, alias: string): string {
  if (!isNativeApp()) return alias;
  return t('miscRuntime.defaultAlias', { code: stableCode(playerId) });
}
