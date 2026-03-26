import { gs } from '../game/state';

export function updateGhostEngine(currentSecs: number): void {
  if (!gs.isGhostMode || gs.ghostIdx >= gs.ghostHistory.length) return;

  let changed = false;
  while (gs.ghostIdx < gs.ghostHistory.length && gs.ghostHistory[gs.ghostIdx].t <= currentSecs) {
    const action = gs.ghostHistory[gs.ghostIdx];
    if (action.type === 'fill') {
      const cEl = gs.gridEl!.children[action.idx] as HTMLElement;
      if (!cEl.classList.contains('ghost-marked')) {
        cEl.classList.add('ghost-marked');
        gs.ghostFilledCount++;
        changed = true;
      }
    } else if (action.type === 'erase') {
      const cEl = gs.gridEl!.children[action.idx] as HTMLElement;
      if (cEl.classList.contains('ghost-marked')) {
        cEl.classList.remove('ghost-marked');
        gs.ghostFilledCount--;
        changed = true;
      }
    }
    gs.ghostIdx++;
  }
  if (changed) updateGhostProgressUI();
}

export function updateGhostProgressUI(): void {
  if (!gs.isGhostMode) return;
  document.getElementById('ghost-progress-text')!.textContent =
    `👻 ${gs.ghostFilledCount}/81 | 🧑 ${gs.playerFilledCount}/81`;
}

export function recalculatePlayerFilledCount(): void {
  gs.playerFilledCount = gs.cellsData.filter((c) => c.value !== 0).length;
}
