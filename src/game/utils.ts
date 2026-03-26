// Pure utility functions — no state, no side effects

export function formatSeconds(sec: number): string {
  const mins = Math.floor(sec / 60)
    .toString()
    .padStart(2, '0');
  const secs = (sec % 60).toString().padStart(2, '0');
  return `${mins}:${secs}`;
}

export function cellLabel(idx: number): string {
  const r = Math.floor(idx / 9) + 1;
  const c = (idx % 9) + 1;
  return `R${r}C${c}`;
}

export function hashStringToSeed(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function clampDigit(v: any): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  const rounded = Math.round(n);
  return rounded >= 1 && rounded <= 9 ? rounded : 0;
}

export function normalizeNotes(rawNotes: any): number[] {
  if (!Array.isArray(rawNotes)) return [];
  const uniq = new Set<number>();
  rawNotes.forEach((n: any) => {
    const d = clampDigit(n);
    if (d !== 0) uniq.add(d);
  });
  return Array.from(uniq).sort((a, b) => a - b);
}

export function normalizeSavedCells(rawCells: any, puzzle: number[]): import('./state').CellData[] | null {
  if (!Array.isArray(rawCells) || !Array.isArray(puzzle) || puzzle.length !== 81) return null;
  const safe: import('./state').CellData[] = [];
  for (let i = 0; i < 81; i++) {
    const clue = clampDigit(puzzle[i]);
    if (clue !== 0) {
      safe.push({ value: clue, fixed: true, notes: [], isError: false });
      continue;
    }
    const raw = rawCells[i];
    const value = clampDigit(raw && raw.value);
    safe.push({
      value,
      fixed: false,
      notes: value === 0 ? normalizeNotes(raw && raw.notes) : [],
      isError: false,
    });
  }
  return safe;
}

export const ALIAS_MIN_LEN = 1;
export const ALIAS_MAX_LEN = 24;

export function normalizeAlias(raw: any): string {
  if (typeof raw !== 'string') return '';
  return raw.trim().slice(0, ALIAS_MAX_LEN);
}
