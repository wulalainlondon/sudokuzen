// The Duo module binds these before launching a round. Input and lifecycle
// saves remain synchronous without making the solo game import Duo eagerly.
interface DuoPersistenceHandlers {
  recordMove: (cell: number, value: number, correct: boolean) => void;
  saveRound: () => void;
}

let handlers: DuoPersistenceHandlers | null = null;

export function bindDuoPersistence(value: DuoPersistenceHandlers): void {
  handlers = value;
}

export function recordDuoInput(cell: number, value: number, correct: boolean): void {
  handlers?.recordMove(cell, value, correct);
}

export function saveDuoInput(): void {
  handlers?.saveRound();
}
