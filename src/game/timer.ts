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
  const isWild = gs.currentLevel.id < 0 && gs.currentLevel.source === 'wild';
  if (isWild) {
    const modeMap: Record<string, string> = {
      standard: '修行',
      ironman: '鐵壁',
      blind: '盲審',
      timed: '疾風',
      noNotes: '無念',
      gauntlet: '百鬼',
    };
    const mode = gs.wildChallengeMode ? (modeMap[gs.wildChallengeMode] ?? '修行') : '修行';
    gs.timerEl.textContent = `世界 ${mode} / ${mins}:${secs}`;
    return;
  }
  gs.timerEl.textContent = `${gs.currentLevel.displayName} / ${mins}:${secs}`;
}
