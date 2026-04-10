// Gauntlet engine — extracted from wildController.ts
// Manages gauntlet queue, advancement, and failure logic.

import { gs, type LevelData } from '../../game/state';
import { showFeedback } from '../../ui/feedback';
import { CHALLENGE_CONFIGS, saveWildProfile, type WildProfile, type WildEncounter } from './wildState';
import { selectEncounter } from './ecologyEngine';
import { getTechniqueMeta } from './techniqueMeta';
import { calculateExp, applyExp } from './expSystem';
import { tickCooldowns } from './ecologyEngine';
import { t } from '../../i18n/t';

// ── Gauntlet state ───────────────────────────────────────────────────

let _gauntletQueue: WildEncounter[] = [];
let _gauntletIdx = 0;
let _gauntletTotalExp = 0;

// ── Accessors for controller integration ─────────────────────────────

export function getGauntletQueue(): WildEncounter[] {
  return _gauntletQueue;
}

export function getGauntletIdx(): number {
  return _gauntletIdx;
}

export function resetGauntletState(): void {
  _gauntletQueue = [];
  _gauntletIdx = 0;
  _gauntletTotalExp = 0;
}

// ── Core gauntlet functions ──────────────────────────────────────────

export async function initGauntlet(profile: WildProfile, currentEncounter: WildEncounter): Promise<void> {
  _gauntletQueue = [currentEncounter];
  _gauntletIdx = 0;
  _gauntletTotalExp = 0;

  // Pre-select 4 more encounters (total 5), restrict to tier 0-1
  for (let i = 1; i < 5; i++) {
    try {
      const enc = await selectEncounter(profile);
      // Override challenge mode to standard for sub-encounters in gauntlet
      enc.challengeMode = 'standard';
      _gauntletQueue.push(enc);
    } catch {
      // If we can't load enough, use whatever we have
      break;
    }
  }
}

export function isGauntletActive(): boolean {
  return _gauntletQueue.length > 0 && _gauntletIdx < _gauntletQueue.length;
}

/**
 * Handle gauntlet win for a sub-puzzle. Returns the next encounter to use,
 * or a final result if the gauntlet is complete.
 */
export function advanceGauntletOnWin(
  encounter: WildEncounter,
  profile: WildProfile,
  seconds: number,
  errors: number,
): {
  done: boolean;
  nextEncounter: WildEncounter | null;
  result: { expGained: number; leveledUp: boolean; newLevel: number } | null;
} {
  const meta = getTechniqueMeta(encounter.technique);
  const baseExp = meta?.expBase ?? 10;
  const subExp = calculateExp(baseExp, encounter.rarity, seconds, errors);
  _gauntletTotalExp += subExp;

  // Update bestiary for current technique
  const entry = profile.bestiary[encounter.technique];
  if (entry) {
    entry.kills++;
    if (entry.bestTime === null || seconds < entry.bestTime) {
      entry.bestTime = seconds;
    }
  }
  profile.puzzlesCompleted++;
  tickCooldowns(profile);

  if (_gauntletIdx + 1 >= _gauntletQueue.length) {
    // Gauntlet complete — apply 3.0x multiplier
    const totalExp = Math.round(_gauntletTotalExp * CHALLENGE_CONFIGS.gauntlet.expMultiplier);
    const result = applyExp(profile, totalExp);
    saveWildProfile(profile);

    _gauntletQueue = [];
    _gauntletIdx = 0;
    _gauntletTotalExp = 0;

    return { done: true, nextEncounter: null, result };
  }

  // More puzzles to go — advance to next
  saveWildProfile(profile);
  _gauntletIdx++;
  const nextEncounter = _gauntletQueue[_gauntletIdx];

  return { done: false, nextEncounter, result: null };
}

export function failGauntlet(): void {
  // On failure: award 1.0x EXP for completed puzzles only
  if (_gauntletTotalExp > 0) {
    // Caller must pass profile and save; we just do EXP application here.
    // Import getWildProfile lazily to avoid circular deps.
    import('./wildController')
      .then(({ getWildProfile }) => {
        const profile = getWildProfile();
        applyExp(profile, _gauntletTotalExp);
        saveWildProfile(profile);
      })
      .catch(() => {});
  }
  _gauntletQueue = [];
  _gauntletIdx = 0;
  _gauntletTotalExp = 0;
}

export async function launchGauntletNext(
  profile: WildProfile,
  encounter: WildEncounter,
  applyRarityTint: (rarity: string) => void,
): Promise<void> {
  const nextMeta = getTechniqueMeta(encounter.technique);

  if (nextMeta) {
    if (!profile.bestiary[encounter.technique]) {
      profile.bestiary[encounter.technique] = {
        discovered: new Date().toISOString().slice(0, 10),
        encounters: 0,
        kills: 0,
        escapes: 0,
        bestTime: null,
        modesCleared: [],
      };
    }
    profile.bestiary[encounter.technique].encounters++;
    saveWildProfile(profile);
  }

  const wildLevel: LevelData = {
    id: -Date.now(),
    stars: 0,
    difficultyName: t('wildRuntime.difficultyWorld'),
    displayName: nextMeta
      ? t('wildRuntime.gauntletLabel', {
          name: nextMeta.name,
          subtitle: nextMeta.subtitle,
          idx: String(_gauntletIdx + 1),
        })
      : t('wildRuntime.gauntletLabelFallback', { idx: String(_gauntletIdx + 1) }),
    puzzle: encounter.puzzle,
    solution: encounter.solution,
    maxTechnique: encounter.technique,
    source: 'wild',
  };

  applyRarityTint(encounter.rarity);

  const { initGame, updateLivesUI } = await import('../../game/core');
  initGame(wildLevel.id, true, false, null, wildLevel);

  gs.wildChallengeMode = 'gauntlet';
  gs.maxErrors = CHALLENGE_CONFIGS.gauntlet.maxErrors;
  gs.wildBlindMode = false;
  gs.wildNotesDisabled = false;
  updateLivesUI();

  showFeedback(t('wild.gauntletCount', { idx: String(_gauntletIdx + 1) }), 'success');
}
