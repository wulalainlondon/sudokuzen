import type { CellData, MoveRecord } from '../../game/state';

const DUO_ROUND_KEY = 'sudoku_duo_round_v1';
const SNAPSHOT_VERSION = 1;

export interface DuoRoundSnapshot {
  version: 1;
  roomId: string;
  role: 'host' | 'guest';
  puzzleSeed: number;
  startedAtMs: number;
  seconds: number;
  errors: number;
  cells: Array<{ value: number; notes: number[] }>;
  moves: MoveRecord[];
}

function sanitizeMove(value: unknown): MoveRecord | null {
  if (!value || typeof value !== 'object') return null;
  const move = value as Partial<MoveRecord>;
  const t = Math.max(0, Math.floor(Number(move.t) || 0));
  const cell = Math.floor(Number(move.cell));
  const val = Math.floor(Number(move.val));
  if (cell < 0 || cell > 80 || val < 0 || val > 9) return null;
  return { t, cell, val, ok: !!move.ok };
}

function sanitizeNotes(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= 9))].sort((a, b) => a - b);
}

export function saveDuoRoundSnapshot(snapshot: Omit<DuoRoundSnapshot, 'version'>): void {
  if (typeof localStorage === 'undefined') return;
  const payload: DuoRoundSnapshot = {
    ...snapshot,
    version: SNAPSHOT_VERSION,
    seconds: Math.max(0, Math.floor(snapshot.seconds)),
    errors: Math.max(0, Math.floor(snapshot.errors)),
    cells: snapshot.cells.slice(0, 81).map((cell) => ({
      value: Math.max(0, Math.min(9, Math.floor(Number(cell.value) || 0))),
      notes: sanitizeNotes(cell.notes),
    })),
    moves: snapshot.moves
      .slice(0, 2000)
      .map(sanitizeMove)
      .filter((move): move is MoveRecord => move !== null),
  };
  try {
    localStorage.setItem(DUO_ROUND_KEY, JSON.stringify(payload));
  } catch (error) {
    console.warn('[duo] round snapshot save failed:', error);
  }
}

export function loadDuoRoundSnapshot(
  roomId: string,
  role: 'host' | 'guest',
  puzzleSeed: number,
): DuoRoundSnapshot | null {
  if (typeof localStorage === 'undefined') return null;
  let raw: unknown;
  try {
    raw = JSON.parse(localStorage.getItem(DUO_ROUND_KEY) || 'null');
  } catch {
    clearDuoRoundSnapshot();
    return null;
  }
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as Partial<DuoRoundSnapshot>;
  if (
    data.version !== SNAPSHOT_VERSION ||
    data.roomId !== roomId ||
    data.role !== role ||
    Number(data.puzzleSeed) !== puzzleSeed ||
    !Array.isArray(data.cells) ||
    data.cells.length !== 81
  ) {
    return null;
  }
  const startedAtMs = Math.max(0, Math.floor(Number(data.startedAtMs) || 0));
  const seconds = Math.max(0, Math.floor(Number(data.seconds) || 0));
  const errors = Math.max(0, Math.floor(Number(data.errors) || 0));
  const cells = data.cells.map((cell) => {
    const candidate = cell && typeof cell === 'object' ? (cell as { value?: unknown; notes?: unknown }) : {};
    return {
      value: Math.max(0, Math.min(9, Math.floor(Number(candidate.value) || 0))),
      notes: sanitizeNotes(candidate.notes),
    };
  });
  const moves = Array.isArray(data.moves)
    ? data.moves
        .map(sanitizeMove)
        .filter((move): move is MoveRecord => move !== null)
        .slice(0, 2000)
    : [];
  return {
    version: SNAPSHOT_VERSION,
    roomId,
    role,
    puzzleSeed,
    startedAtMs,
    seconds,
    errors,
    cells,
    moves,
  };
}

export function restoreDuoCells(
  target: CellData[],
  puzzle: number[],
  solution: number[],
  snapshot: DuoRoundSnapshot,
): number {
  let restored = 0;
  for (let i = 0; i < 81; i++) {
    const cell = target[i];
    const saved = snapshot.cells[i];
    if (!cell || puzzle[i] !== 0 || !saved) continue;
    const value = saved.value === solution[i] ? saved.value : 0;
    cell.value = value;
    cell.notes = value === 0 ? saved.notes : [];
    cell.isError = false;
    if (value !== 0) restored++;
  }
  return restored;
}

export function clearDuoRoundSnapshot(): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(DUO_ROUND_KEY);
}

export const __DUO_ROUND_KEY = DUO_ROUND_KEY;
