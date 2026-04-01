// Timer management

import { gs } from './state';
import { recalculatePlayerFilledCount, updateGhostEngine, updateGhostProgressUI } from '../features/ghost';
import { t } from '../i18n/t';

export function startTimer(reset = true): void {
  if (gs.timerInterval) clearInterval(gs.timerInterval);
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
      standard: t('timer.modeStandard'),
      ironman: t('timer.modeIronman'),
      blind: t('timer.modeBlind'),
      timed: t('timer.modeTimed'),
      noNotes: t('timer.modeNoNotes'),
      gauntlet: t('timer.modeGauntlet'),
    };
    const mode = gs.wildChallengeMode ? (modeMap[gs.wildChallengeMode] ?? t('timer.modeStandard')) : t('timer.modeStandard');
    gs.timerEl.textContent = `${t('timer.wildPrefix', { mode })} / ${mins}:${secs}`;
    return;
  }
  if (gs.currentLevel.mode === 'practice') {
    gs.timerEl.textContent = `${t('timer.practicePrefix')} / ${mins}:${secs}`;
    return;
  }
  gs.timerEl.textContent = `${gs.currentLevel.displayName} / ${mins}:${secs}`;
}
