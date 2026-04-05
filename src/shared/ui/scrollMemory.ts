// Scroll position memory — persists scroll offsets across view switches.
// Extracted from features/levels.ts to break circular dependencies.

const _scrollPositions: Record<string, number> = {};

export function saveScroll(id: string): void {
  const el = document.getElementById(id);
  if (el) _scrollPositions[id] = el.scrollTop;
}

export function restoreScroll(id: string): void {
  const pos = _scrollPositions[id];
  if (pos == null) return;
  const el = document.getElementById(id);
  if (el) el.scrollTop = pos;
}
