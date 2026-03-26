// Timer management

import { gs } from './state';
import { recalculatePlayerFilledCount, updateGhostEngine, updateGhostProgressUI } from '../features/ghost';

export function startTimer(reset = true): void {
  clearInterval(gs.timerInterval!);
  if (reset) {
    gs.seconds = 0;
    gs.ghostIdx = 0;
    gs.ghostFilledCount = 0;
    gs.playerFilledCount = 0;
  }

  if (gs.isGhostMode) {
    recalculatePlayerFilledCount();
    updateGhostEngine(gs.seconds);
    updateGhostProgressUI();
  }

  updateTimerUI();
  gs.timerInterval = setInterval(() => {
    gs.seconds++;
    updateTimerUI();
    if (gs.isGhostMode) updateGhostEngine(gs.seconds);
  }, 1000);
}

export function updateTimerUI(): void {
  if (!gs.timerEl || !gs.currentLevel) return;
  const mins = Math.floor(gs.seconds / 60)
    .toString()
    .padStart(2, '0');
  const secs = (gs.seconds % 60).toString().padStart(2, '0');
  gs.timerEl.textContent = `${gs.currentLevel.displayName} / ${mins}:${secs}`;
}
