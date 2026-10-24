import { SK } from '../../storage/keys';

export interface RecoveryCell {
  value: number;
  fixed: boolean;
  notes: number[];
}

export interface RecoverySession {
  version: 1;
  cells: RecoveryCell[];
  solution: number[];
  seconds: number;
}

export function conflictCells(values: number[]): Set<number> {
  const conflicts = new Set<number>();
  for (let i = 0; i < 81; i++) {
    if (!values[i]) continue;
    for (let j = i + 1; j < 81; j++) {
      if (values[i] !== values[j]) continue;
      if (
        Math.floor(i / 9) === Math.floor(j / 9) ||
        i % 9 === j % 9 ||
        (Math.floor(i / 27) === Math.floor(j / 27) && Math.floor((i % 9) / 3) === Math.floor((j % 9) / 3))
      ) {
        conflicts.add(i);
        conflicts.add(j);
      }
    }
  }
  return conflicts;
}

/** Bounded MRV search: never choose an arbitrary solution for an ambiguous screenshot. */
export function solveRecoveryBoard(values: number[]): {
  status: 'unique' | 'multiple' | 'invalid' | 'limit';
  solution: number[];
} {
  if (
    values.length !== 81 ||
    values.some((v) => !Number.isInteger(v) || v < 0 || v > 9) ||
    conflictCells(values).size
  ) {
    return { status: 'invalid', solution: [] };
  }
  const board = [...values];
  let visits = 0;
  let count = 0;
  let solution: number[] = [];
  const search = () => {
    if (++visits > 100_000 || count > 1) return;
    let best = -1;
    let options: number[] = [];
    for (let i = 0; i < 81; i++) {
      if (board[i]) continue;
      const used = new Set<number>();
      const row = Math.floor(i / 9);
      const col = i % 9;
      for (let n = 0; n < 9; n++) {
        used.add(board[row * 9 + n]);
        used.add(board[n * 9 + col]);
        used.add(board[(Math.floor(row / 3) * 3 + Math.floor(n / 3)) * 9 + Math.floor(col / 3) * 3 + (n % 3)]);
      }
      const candidates = [1, 2, 3, 4, 5, 6, 7, 8, 9].filter((n) => !used.has(n));
      if (!candidates.length) return;
      if (best < 0 || candidates.length < options.length) {
        best = i;
        options = candidates;
        if (options.length === 1) break;
      }
    }
    if (best < 0) {
      count++;
      if (count === 1) solution = [...board];
      return;
    }
    for (const n of options) {
      board[best] = n;
      search();
      if (count > 1 || visits > 100_000) break;
    }
    board[best] = 0;
  };
  search();
  return { status: count > 1 ? 'multiple' : visits > 100_000 ? 'limit' : count === 1 ? 'unique' : 'invalid', solution };
}

export function saveRecoverySession(session: RecoverySession): boolean {
  try {
    localStorage.setItem(SK.RECOVERY_SESSION, JSON.stringify(session));
    return true;
  } catch {
    return false;
  }
}

export function loadRecoverySession(): RecoverySession | null {
  try {
    const data = JSON.parse(localStorage.getItem(SK.RECOVERY_SESSION) || 'null') as RecoverySession | null;
    if (
      !data ||
      data.version !== 1 ||
      !Array.isArray(data.cells) ||
      data.cells.length !== 81 ||
      !Array.isArray(data.solution) ||
      data.solution.length !== 81 ||
      data.solution.some((n) => !Number.isInteger(n) || n < 1 || n > 9) ||
      conflictCells(data.solution).size ||
      !Number.isFinite(data.seconds) ||
      data.seconds < 0
    )
      return null;
    if (
      data.cells.some(
        (c, i) =>
          !c ||
          !Number.isInteger(c.value) ||
          c.value < 0 ||
          c.value > 9 ||
          typeof c.fixed !== 'boolean' ||
          (c.fixed && (!c.value || c.value !== data.solution[i])) ||
          !Array.isArray(c.notes) ||
          c.notes.some((n) => !Number.isInteger(n) || n < 1 || n > 9),
      )
    )
      return null;
    return {
      version: 1,
      cells: data.cells.map((c) => ({ ...c, notes: [...new Set(c.notes)] })),
      solution: [...data.solution],
      seconds: Math.floor(data.seconds),
    };
  } catch {
    return null;
  }
}
