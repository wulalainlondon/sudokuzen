// Library overlay UI — extracted from teach-legacy.ts
// Manages the library card rendering and overlay open/close.

import { SK, readJson } from '../storage/keys';
import { getTeachData, getTeachManifest, hasTeachModule } from '../data/dataRegistry';
import type { TeachModuleMeta } from '../data/dataRegistry';
import { t } from '../i18n/t';
import { LEARNING_ORDER, getGroups, getTeachStageLabel, showTeachModal } from './teach-legacy';
import { escapeHtml } from '../shared/html/escape';
import type { SudokuWindow } from '../facade/windowTypes';

// ── Library functions ─────────────────────────────────────────────

export function isTeachReadable(stars: number | string): boolean {
  return hasTeachModule(stars);
}

export type LibraryItem = { book: number; key: string; teach: TeachModuleMeta };

export function getLibraryItemsFromTeachData(): LibraryItem[] {
  // Try manifest first (Phase 3 — no full blob needed)
  // Falls back to full blob for backwards compat
  const td = getTeachData();
  const entries: [string, TeachModuleMeta][] = [];

  if (td && Object.keys(td).length > 0) {
    // Full blob path (backwards compat)
    type LegacyTeachLike = {
      technique?: unknown;
      name?: unknown;
      subtitle?: unknown;
      practice?: unknown;
    };
    for (const [k, v] of Object.entries(td)) {
      const teachLike = (v && typeof v === 'object' ? v : {}) as LegacyTeachLike;
      entries.push([
        k,
        {
          technique: typeof teachLike.technique === 'string' ? teachLike.technique : '',
          name: typeof teachLike.name === 'string' ? teachLike.name : '',
          subtitle: typeof teachLike.subtitle === 'string' ? teachLike.subtitle : '',
          hasPractice: Array.isArray(teachLike.practice) && teachLike.practice.length > 0,
          size: 0,
        },
      ]);
    }
  }

  if (entries.length === 0) return [];

  const orderIndex = new Map(LEARNING_ORDER.map((id, idx) => [id, idx]));

  return entries
    .map(([book, teach]) => ({ book: parseFloat(book), key: String(book), teach }))
    .filter((item) => Number.isFinite(item.book))
    .sort((a, b) => {
      const ai = orderIndex.has(a.book) ? orderIndex.get(a.book)! : Number.MAX_SAFE_INTEGER;
      const bi = orderIndex.has(b.book) ? orderIndex.get(b.book)! : Number.MAX_SAFE_INTEGER;
      if (ai !== bi) return ai - bi;
      return a.book - b.book;
    });
}

/** Async version — uses manifest for library rendering without full blob. */
export async function getLibraryItemsAsync(): Promise<LibraryItem[]> {
  // Try sync first (full blob already loaded)
  const syncItems = getLibraryItemsFromTeachData();
  if (syncItems.length > 0) return syncItems;

  // Fall back to manifest
  const manifest = await getTeachManifest();
  if (!manifest) return [];

  const orderIndex = new Map(LEARNING_ORDER.map((id, idx) => [id, idx]));

  return Object.entries(manifest.modules)
    .map(([book, teach]) => ({ book: parseFloat(book), key: String(book), teach }))
    .filter((item) => Number.isFinite(item.book))
    .sort((a, b) => {
      const ai = orderIndex.has(a.book) ? orderIndex.get(a.book)! : Number.MAX_SAFE_INTEGER;
      const bi = orderIndex.has(b.book) ? orderIndex.get(b.book)! : Number.MAX_SAFE_INTEGER;
      if (ai !== bi) return ai - bi;
      return a.book - b.book;
    });
}

export function getLibraryLearningGroups(items: LibraryItem[]) {
  const byId = new Map(items.map((item) => [item.book, item]));
  const used = new Set<number>();

  const groups = getGroups().map((group) => {
    const groupItems = group.ids.map((id) => byId.get(id)).filter(Boolean) as LibraryItem[];
    groupItems.forEach((item) => used.add(item.book));
    return { ...group, items: groupItems };
  }).filter((group) => group.items.length > 0);

  const ungrouped = items.filter((item) => !used.has(item.book));
  if (ungrouped.length) {
    groups.push({
      id: 'extra',
      name: t('learnGroups.extra'),
      hint: t('learnGroups.extraHint'),
      ids: [],
      items: ungrouped,
    });
  }

  return groups;
}

export function renderLibraryCards(): void {
  // React now manages the #library-list element; find it from the DOM
  const listEl = document.getElementById('library-list');
  if (!listEl) return;

  // Try sync first, fall back to async manifest
  const syncItems = getLibraryItemsFromTeachData();
  if (syncItems.length > 0) {
    renderLibraryCardsFromItems(syncItems);
  } else {
    listEl.innerHTML = '<div class="library-empty">載入秘笈目錄…</div>';
    getLibraryItemsAsync().then((items) => renderLibraryCardsFromItems(items));
  }
}

function renderLibraryCardsFromItems(items: LibraryItem[]): void {
  const listEl = document.getElementById('library-list');
  if (!listEl) return;
  const read = readJson<Record<string, boolean>>(SK.TEACH_READ, {});

  if (!items.length) {
    listEl.innerHTML = '<div class="library-empty">目前沒有可研讀的秘笈內容</div>';
    return;
  }

  const orderIndex = new Map(items.map((item, idx) => [item.book, idx + 1]));
  const groups = getLibraryLearningGroups(items);

  listEl.innerHTML = groups
    .map((group) => {
      const cardsHtml = group.items
        .map(({ book, key, teach }) => {
          const isRead = !!read[key];
          const orderNo = orderIndex.get(book) || '-';
          const stage = getTeachStageLabel(book);
          return `
        <article class="library-card" data-star="${key}" role="button" tabindex="0"
            onclick="openTeachFromLibrary('${key}')"
            onkeydown="if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openTeachFromLibrary('${key}'); }">
            <div class="library-card-head">
                <span class="library-star">#${orderNo} ・秘笈 ${book} ・${stage}</span>
                <div class="library-badges">
                    ${isRead ? '<span class="library-badge read">已讀</span>' : ''}
                    ${teach.hasPractice ? '<span class="library-badge practice">可練習</span>' : ''}
                </div>
            </div>
            <h3 class="library-card-title">${escapeHtml(teach.name)}</h3>
            <p class="library-card-subtitle">${escapeHtml(teach.subtitle)}</p>
            <div class="library-card-key">${escapeHtml(teach.technique || '-')}</div>
            <button class="library-open-btn" onclick="event.stopPropagation(); openTeachFromLibrary('${key}')">研讀秘笈</button>
        </article>
      `;
        })
        .join('');

      return `
      <section class="library-group" data-group="${group.id}">
          <header class="library-group-head">
              <h3 class="library-group-title">${group.name}</h3>
              <p class="library-group-hint">${group.hint}</p>
          </header>
          <div class="library-group-cards">${cardsHtml}</div>
      </section>
    `;
    })
    .join('');
}

export function openLibraryOverlay(): void {
  import('../react/library/libraryBridge').then(({ bridgeOpenLibrary }) => bridgeOpenLibrary()).catch(() => {});
}

export function closeLibraryOverlay(): void {
  import('../react/library/libraryBridge').then(({ bridgeCloseLibrary }) => bridgeCloseLibrary()).catch(() => {});
}

export function openTeachFromLibrary(stars: string | number): void {
  // Route through window.showTeachModal so the React bridge can intercept
  const wShow = (window as SudokuWindow).showTeachModal;
  if (wShow) wShow(parseFloat(String(stars)), 'library');
  else showTeachModal(parseFloat(String(stars)), 'library');
}
