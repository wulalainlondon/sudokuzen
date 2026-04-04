// Bestiary grid filtering and display helpers.

import type { Rarity } from './techniqueMeta';
import { t } from '../../i18n/t';

// ── Level titles by IQ level range ───────────────────────────────────

export const LEVEL_TITLES: [number, string][] = [
  [1, t('wild.levelTitle1')],
  [5, t('wild.levelTitle5')],
  [11, t('wild.levelTitle11')],
  [21, t('wild.levelTitle21')],
  [31, t('wild.levelTitle31')],
  [41, t('wild.levelTitle41')],
  [51, t('wild.levelTitle51')],
  [61, t('wild.levelTitle61')],
  [71, t('wild.levelTitle71')],
  [80, t('wild.levelTitle80')],
];

export function getLevelTitle(level: number): string {
  let title = LEVEL_TITLES[0][1];
  for (const [gate, name] of LEVEL_TITLES) {
    if (level >= gate) title = name;
  }
  return title;
}

// ── Filter types & state ─────────────────────────────────────────────

export type BestiaryFilter = 'all' | 'discovered' | 'conquered';
export type RarityFilter = 'all' | Rarity;

let _bestiaryFilter: BestiaryFilter = 'all';
let _rarityFilter: RarityFilter = 'all';

export function getWildBestiaryFilters(): { bestiaryFilter: BestiaryFilter; rarityFilter: RarityFilter } {
  return { bestiaryFilter: _bestiaryFilter, rarityFilter: _rarityFilter };
}

/** Lazily resolved render callback — set by wildLobby.ts to avoid circular imports. */
let _renderCallback: (() => void) | null = null;

/** Called by wildLobby.ts at module init to wire the render loop. */
export function _setBestiaryRenderCallback(cb: () => void): void {
  _renderCallback = cb;
}

export function setWildBestiaryFilter(filter: BestiaryFilter): void {
  _bestiaryFilter = filter;
  _renderCallback?.();
}

export function setWildRarityFilter(rarity: RarityFilter): void {
  _rarityFilter = rarity;
  _renderCallback?.();
}

// ── Rarity labels ────────────────────────────────────────────────────

export const RARITY_LABEL: Record<Rarity, string> = {
  common: t('wild.rarityCommon'),
  rare: t('wild.rarityRare'),
  legendary: t('wild.rarityLegendary'),
  mythic: t('wild.rarityMythic'),
};

// ── Enter chip helper ────────────────────────────────────────────────

export function getEnterChip(level: number): string {
  if (level >= 71) return t('wild.poolHighRisk');
  if (level >= 41) return t('wild.poolElite');
  if (level >= 21) return t('wild.poolAdvanced');
  return t('wild.poolStable');
}

// ── Filter DOM bindings (legacy HTML mode) ───────────────────────────

export function ensureWildFilterBindings(): void {
  const controls = document.getElementById('wild-bestiary-controls');
  if (controls && controls.getAttribute('data-bound') !== '1') {
    controls.setAttribute('data-bound', '1');
    controls.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest('button[data-filter]') as HTMLButtonElement | null;
      if (!btn) return;
      const filter = btn.dataset.filter as BestiaryFilter | undefined;
      if (!filter) return;
      setWildBestiaryFilter(filter);
    });
  }

  const rarityControls = document.getElementById('wild-rarity-controls');
  if (rarityControls && rarityControls.getAttribute('data-bound') !== '1') {
    rarityControls.setAttribute('data-bound', '1');
    rarityControls.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest('button[data-rarity]') as HTMLButtonElement | null;
      if (!btn) return;
      const rarity = btn.dataset.rarity as RarityFilter | undefined;
      if (!rarity) return;
      setWildRarityFilter(rarity);
    });
  }
}
