// Wild mode controller — encounter lifecycle, bridging ecology engine → game core.
// Replaces the old "今日隨機" with the ecology-driven Wild system.

import { gs, type LevelData } from '../../game/state';
import { formatSeconds } from '../../game/utils';
import { showFeedback } from '../../ui/feedback';
import { loadWildProfile, saveWildProfile, CHALLENGE_CONFIGS, type WildProfile, type WildEncounter } from './wildState';
import { selectEncounter, selectSessionEncounter, tickCooldowns, setEscapeCooldown } from './ecologyEngine';
import { getTechniqueMeta, getAutoCastKeys } from './techniqueMeta';
import { calculateExp, applyExp, expForLevel } from './expSystem';
import { autoSolve } from './autoSolver';
import {
  triggerIntroIfNeeded,
  triggerFirstKillIfNeeded,
  triggerMilestoneIfNeeded,
  triggerFinaleIfNeeded,
  triggerContinuousFillHint,
} from './mentorController';

// ── Runtime state (non-persisted) ────────────────────────────────────

let _profile: WildProfile | null = null;
let _encounter: WildEncounter | null = null;
let _active = false;

// ── Gauntlet state ───────────────────────────────────────────────────

let _gauntletQueue: WildEncounter[] = [];
let _gauntletIdx = 0;
let _gauntletTotalExp = 0;

export function isWildActive(): boolean {
  return _active;
}
export function getWildProfile(): WildProfile {
  if (!_profile) _profile = loadWildProfile();
  return _profile;
}
export function getCurrentEncounter(): WildEncounter | null {
  return _encounter;
}

// ── Wild-specific gs field reset ─────────────────────────────────────

function resetWildGsFields(): void {
  if (gs.wildTimerInterval) {
    clearInterval(gs.wildTimerInterval);
  }
  gs.wildChallengeMode = null;
  gs.wildBlindMode = false;
  gs.wildNotesDisabled = false;
  gs.wildTimerCountdown = 0;
  gs.wildTimerInterval = null;
}

// ── Countdown timer for timed mode ──────────────────────────────────

function startCountdown(seconds: number): void {
  gs.wildTimerCountdown = seconds;
  // Show initial countdown display
  if (gs.timerEl) gs.timerEl.textContent = formatSeconds(gs.wildTimerCountdown);
  gs.wildTimerInterval = setInterval(() => {
    gs.wildTimerCountdown--;
    if (gs.timerEl) gs.timerEl.textContent = formatSeconds(gs.wildTimerCountdown);
    if (gs.wildTimerCountdown <= 0) {
      clearInterval(gs.wildTimerInterval!);
      gs.wildTimerInterval = null;
      // Trigger game over via lazy import to avoid circular deps
      import('../../game/core').then((m) => m.showGameOver());
    }
  }, 1000);
}

// ── Session (修行輪) management ──────────────────────────────────────

export function getSession(): import('./wildState').WildSession | null {
  return getWildProfile().currentSession;
}

/** Calculate streak bonus multiplier for session summary. */
function sessionStreakMultiplier(wins: number): number {
  if (wins >= 10) return 1.5;
  if (wins >= 8) return 1.3;
  if (wins >= 5) return 1.1;
  return 1.0;
}

const SESSION_LEVEL_GATE = 21; // Lv.21+ unlocks 修行輪; below is free roam

export async function startWorldSession(): Promise<void> {
  const profile = getWildProfile();
  if (profile.iqLevel >= SESSION_LEVEL_GATE) {
    // 修行輪: 10-round structured session
    profile.currentSession = { round: 0, wins: 0, totalExp: 0, techniques: [] };
  } else {
    // 新手村: free roam, no session structure
    profile.currentSession = null;
  }
  saveWildProfile(profile);
  await startWildEncounter();
}

// ── Enter Wild (replaces startPoolRandom) ────────────────────────────

export async function startWildEncounter(): Promise<void> {
  const profile = getWildProfile();

  // Show mentor intro on first ever entry
  await triggerIntroIfNeeded();

  // If in a session, advance the round
  const session = profile.currentSession;
  if (session && session.round < 10) {
    session.round++;
    saveWildProfile(profile);
  }

  showFeedback(session ? `修行輪 ${session.round}/10` : '遭遇中...', 'success');

  try {
    if (session) {
      _encounter = await selectSessionEncounter(profile, session.round);
    } else {
      _encounter = await selectEncounter(profile);
    }

    // Only allow non-standard modes on techniques the player has mastered
    // Mastered = studied (T0-T1) or conquered at least once (T2+)
    if (_encounter.challengeMode !== 'standard') {
      const studied = (profile.studiedSkills || []).includes(_encounter.technique);
      const conquered = profile.bestiary[_encounter.technique]?.kills > 0;
      if (!studied && !conquered) {
        _encounter.challengeMode = 'standard';
      }
    }
  } catch (e) {
    showFeedback('題庫載入失敗，請稍後重試', 'error');
    console.error('[Wild] selectEncounter failed:', e);
    return;
  }

  _active = true;
  profile.totalEncounters = (profile.totalEncounters ?? 0) + 1;

  // Record encounter in bestiary
  const meta = getTechniqueMeta(_encounter.technique);
  if (meta) {
    if (!profile.bestiary[_encounter.technique]) {
      profile.bestiary[_encounter.technique] = {
        discovered: new Date().toISOString().slice(0, 10),
        encounters: 0,
        kills: 0,
        escapes: 0,
        bestTime: null,
      };
    }
    profile.bestiary[_encounter.technique].encounters++;
    saveWildProfile(profile);
  }

  const mode = _encounter.challengeMode;
  const config = CHALLENGE_CONFIGS[mode];

  // Auto-solve mastered techniques to produce bottleneck state
  let puzzleToUse = _encounter.puzzle;
  let prefilledNotes: number[][] | null = null;
  if (profile.autoCastEnabled) {
    const autoCastKeys = getAutoCastKeys(profile.iqLevel);
    // Don't auto-cast the target technique itself
    autoCastKeys.delete(_encounter.technique);
    if (autoCastKeys.size > 0) {
      const result = autoSolve(_encounter.puzzle, _encounter.solution, autoCastKeys);
      puzzleToUse = result.partialPuzzle;
      prefilledNotes = result.notes;
    }
  }

  // Build a LevelData for the game core
  const modeLabel = mode !== 'standard' ? ` [${config.displayName}]` : '';
  const sessionLabel = session ? `[${session.round}/10] ` : '';
  const bossLabel = session && session.round === 10 ? ' 【BOSS】' : '';
  const wildLevel: LevelData = {
    id: -Date.now(), // negative = Wild mode, unique per encounter
    stars: 0,
    difficultyName: '世界',
    displayName: meta
      ? `${sessionLabel}${meta.name} · ${meta.subtitle}${modeLabel}${bossLabel}`
      : `${sessionLabel}世界${modeLabel}${bossLabel}`,
    puzzle: puzzleToUse,
    solution: _encounter.solution,
    maxTechnique: _encounter.technique,
    source: 'wild',
  };

  // Apply rarity tint to game container
  applyRarityTint(_encounter.rarity);

  // Launch game via core — dynamic import to avoid circular deps
  document.getElementById('level-screen')?.style.setProperty('display', 'none');
  const { initGame } = await import('../../game/core');
  initGame(wildLevel.id, true, false, null, wildLevel);

  // Inject pre-computed candidate notes from auto-solver
  if (prefilledNotes) {
    const { updateCellDisplay } = await import('../../game/board');
    for (let i = 0; i < 81; i++) {
      if (gs.cellsData[i].value === 0 && prefilledNotes[i].length > 0) {
        gs.cellsData[i].notes = prefilledNotes[i];
        if (gs.gridEl) {
          updateCellDisplay(gs.gridEl.children[i] as HTMLElement, gs.cellsData[i]);
        }
      }
    }
  }

  // Apply challenge mode settings AFTER initGame
  gs.wildChallengeMode = mode;
  gs.maxErrors = config.maxErrors;
  gs.wildBlindMode = mode === 'blind';
  gs.wildNotesDisabled = !!config.notesDisabled;

  // Update lives UI after maxErrors change
  const { updateLivesUI } = await import('../../game/core');
  updateLivesUI();

  // For timed mode: start countdown (replaces the normal timer display)
  if (mode === 'timed' && config.timerCountdown) {
    // Stop the normal timer that initGame started
    if (gs.timerInterval) {
      clearInterval(gs.timerInterval);
      gs.timerInterval = null;
    }
    startCountdown(config.timerCountdown);
  }

  // Handle gauntlet mode: pre-select 5 encounters
  if (mode === 'gauntlet') {
    await initGauntlet(profile);
  }

  // Track technique in session
  if (session && !session.techniques.includes(_encounter.technique)) {
    session.techniques.push(_encounter.technique);
    saveWildProfile(profile);
  }

  // First encounter indicator / boss indicator
  if (session && session.round === 10) {
    showFeedback('Boss 遭遇！', 'success');
  } else {
    const bestiaryEntry = profile.bestiary[_encounter.technique];
    if (bestiaryEntry && bestiaryEntry.encounters === 1) {
      showFeedback('初遇 — ？？？', 'success');
    }
  }

  // Show mentor ghost time target
  if (_encounter.mentorTime > 0) {
    const mins = Math.floor(_encounter.mentorTime / 60);
    const secs = _encounter.mentorTime % 60;
    const timeStr = mins > 0 ? `${mins}:${secs.toString().padStart(2, '0')}` : `${secs}s`;
    // Show mentor time as a subtle indicator on the timer area
    const timerEl = gs.timerEl;
    if (timerEl) {
      timerEl.setAttribute('data-mentor-time', String(_encounter.mentorTime));
      timerEl.title = `弈塵的紀錄：${timeStr}`;
    }
  }

  // One-time hint: teach continuous fill on first encounter
  if (profile.totalEncounters <= 1) {
    triggerContinuousFillHint();
  }
}

// ── Gauntlet mode ───────────────────────────────────────────────────

async function initGauntlet(profile: WildProfile): Promise<void> {
  _gauntletQueue = [_encounter!];
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

function isGauntletActive(): boolean {
  return _gauntletQueue.length > 0 && _gauntletIdx < _gauntletQueue.length;
}

async function _advanceGauntlet(
  seconds: number,
  errors: number,
): Promise<{ expGained: number; leveledUp: boolean; newLevel: number } | null> {
  const profile = getWildProfile();
  const meta = getTechniqueMeta(_encounter!.technique);
  const baseExp = meta?.expBase ?? 10;

  // Calculate EXP at 1.0x for this sub-puzzle (multiplier applied at end)
  const subExp = calculateExp(baseExp, _encounter!.rarity, seconds, errors);
  _gauntletTotalExp += subExp;

  _gauntletIdx++;

  if (_gauntletIdx >= _gauntletQueue.length) {
    // Gauntlet complete — apply 3.0x multiplier
    const totalExp = Math.round(_gauntletTotalExp * CHALLENGE_CONFIGS.gauntlet.expMultiplier);
    const result = applyExp(profile, totalExp);

    // Update bestiary for final technique
    const entry = profile.bestiary[_encounter!.technique];
    if (entry) {
      entry.kills++;
      if (entry.bestTime === null || seconds < entry.bestTime) {
        entry.bestTime = seconds;
      }
    }
    profile.puzzlesCompleted++;
    tickCooldowns(profile);
    saveWildProfile(profile);

    _gauntletQueue = [];
    _gauntletIdx = 0;
    _gauntletTotalExp = 0;
    _active = false;

    return result;
  }

  // More puzzles to go — update bestiary for current, advance to next
  const entry = profile.bestiary[_encounter!.technique];
  if (entry) {
    entry.kills++;
    if (entry.bestTime === null || seconds < entry.bestTime) {
      entry.bestTime = seconds;
    }
  }
  profile.puzzlesCompleted++;
  tickCooldowns(profile);
  saveWildProfile(profile);

  // Load next gauntlet puzzle
  _encounter = _gauntletQueue[_gauntletIdx];
  const nextMeta = getTechniqueMeta(_encounter.technique);

  // Record next encounter in bestiary
  if (nextMeta) {
    if (!profile.bestiary[_encounter.technique]) {
      profile.bestiary[_encounter.technique] = {
        discovered: new Date().toISOString().slice(0, 10),
        encounters: 0,
        kills: 0,
        escapes: 0,
        bestTime: null,
      };
    }
    profile.bestiary[_encounter.technique].encounters++;
    saveWildProfile(profile);
  }

  const wildLevel: LevelData = {
    id: -Date.now(),
    stars: 0,
    difficultyName: '世界',
    displayName: nextMeta
      ? `${nextMeta.name} · ${nextMeta.subtitle} [百鬼 ${_gauntletIdx + 1}/5]`
      : `世界 [百鬼 ${_gauntletIdx + 1}/5]`,
    puzzle: _encounter.puzzle,
    solution: _encounter.solution,
    maxTechnique: _encounter.technique,
    source: 'wild',
  };

  applyRarityTint(_encounter.rarity);

  const { initGame } = await import('../../game/core');
  // Don't reset accumulated seconds — pass them through
  initGame(wildLevel.id, true, false, null, wildLevel);

  // Keep standard mode settings for gauntlet sub-puzzles
  gs.wildChallengeMode = 'gauntlet';
  gs.maxErrors = CHALLENGE_CONFIGS.gauntlet.maxErrors;
  gs.wildBlindMode = false;
  gs.wildNotesDisabled = false;

  const { updateLivesUI } = await import('../../game/core');
  updateLivesUI();

  showFeedback(`百鬼夜行 ${_gauntletIdx + 1}/5`, 'success');

  return null; // Not done yet
}

function failGauntlet(): void {
  // On failure: award 1.0x EXP for completed puzzles only
  if (_gauntletTotalExp > 0) {
    const profile = getWildProfile();
    applyExp(profile, _gauntletTotalExp);
    saveWildProfile(profile);
  }
  _gauntletQueue = [];
  _gauntletIdx = 0;
  _gauntletTotalExp = 0;
}

// ── Win handler (called from core.ts checkWin) ───────────────────────

export function onWildComplete(
  seconds: number,
  errors: number,
): { expGained: number; leveledUp: boolean; newLevel: number; firstKill: string | null; firstKillSub: string | null; beatMentor: boolean } {
  if (!_encounter || !_active) return { expGained: 0, leveledUp: false, newLevel: 1, firstKill: null, firstKillSub: null, beatMentor: false };

  // Handle gauntlet advancement
  if (isGauntletActive()) {
    // advanceGauntlet is async — we handle it via a then chain
    // But onWildComplete is sync. We need to return synchronously.
    // For gauntlet, we trigger the advance asynchronously and return partial result.
    const profile = getWildProfile();
    const meta = getTechniqueMeta(_encounter.technique);
    const baseExp = meta?.expBase ?? 10;
    const subExp = calculateExp(baseExp, _encounter.rarity, seconds, errors);

    if (_gauntletIdx + 1 >= _gauntletQueue.length) {
      // Final gauntlet puzzle — apply full multiplier
      _gauntletTotalExp += subExp;
      const totalExp = Math.round(_gauntletTotalExp * CHALLENGE_CONFIGS.gauntlet.expMultiplier);
      const result = applyExp(profile, totalExp);

      const entry = profile.bestiary[_encounter.technique];
      if (entry) {
        entry.kills++;
        if (entry.bestTime === null || seconds < entry.bestTime) {
          entry.bestTime = seconds;
        }
      }
      profile.puzzlesCompleted++;
      tickCooldowns(profile);
      saveWildProfile(profile);

      _gauntletQueue = [];
      _gauntletIdx = 0;
      _gauntletTotalExp = 0;
      _active = false;
      resetWildGsFields();

      return { ...result, firstKill: null, firstKillSub: null, beatMentor: false };
    }

    // Not final — advance to next (async, but we still return a partial result)
    _gauntletTotalExp += subExp;
    const entry = profile.bestiary[_encounter.technique];
    if (entry) {
      entry.kills++;
      if (entry.bestTime === null || seconds < entry.bestTime) {
        entry.bestTime = seconds;
      }
    }
    profile.puzzlesCompleted++;
    tickCooldowns(profile);
    saveWildProfile(profile);

    _gauntletIdx++;
    _encounter = _gauntletQueue[_gauntletIdx];

    // Async: launch next puzzle
    launchGauntletNext(profile);

    // Return 0 exp (not finished yet) — the win celebration should show gauntlet progress
    return { expGained: 0, leveledUp: false, newLevel: profile.iqLevel, firstKill: null, firstKillSub: null, beatMentor: false };
  }

  const profile = getWildProfile();
  const meta = getTechniqueMeta(_encounter.technique);
  const baseExp = meta?.expBase ?? 10;

  // Calculate and apply EXP with challenge multiplier
  const challengeMultiplier = CHALLENGE_CONFIGS[_encounter.challengeMode]?.expMultiplier ?? 1.0;
  let expGained = calculateExp(baseExp, _encounter.rarity, seconds, errors, challengeMultiplier);

  // 弈塵 ghost bonus: beat his time → +50% EXP
  const beatMentor = _encounter.mentorTime > 0 && seconds <= _encounter.mentorTime;
  if (beatMentor) {
    expGained = Math.round(expGained * 1.5);
  }

  const result = applyExp(profile, expGained);

  // Update bestiary
  const entry = profile.bestiary[_encounter.technique];
  const isFirstKill = entry ? entry.kills === 0 : false;
  if (entry) {
    entry.kills++;
    if (entry.bestTime === null || seconds < entry.bestTime) {
      entry.bestTime = seconds;
    }
  }

  // Tick cooldowns (completed a puzzle)
  profile.puzzlesCompleted++;
  tickCooldowns(profile);

  // Track session progress
  const session = profile.currentSession;
  if (session) {
    session.wins++;
    session.totalExp += expGained;
  }

  // Award memory fragments (newbie zone only)
  if (profile.iqLevel < 21) {
    const fragMeta = getTechniqueMeta(_encounter.technique);
    if (fragMeta && fragMeta.fragmentsRequired > 0) {
      if (!profile.fragments) profile.fragments = {};
      const current = profile.fragments[_encounter.technique] || 0;
      if (current < fragMeta.fragmentsRequired) {
        const award = errors === 0 ? 2 : 1;
        profile.fragments[_encounter.technique] = Math.min(current + award, fragMeta.fragmentsRequired);

        // Check if just reached threshold
        if (profile.fragments[_encounter.technique] >= fragMeta.fragmentsRequired
            && current < fragMeta.fragmentsRequired) {
          const techName = fragMeta.name;
          setTimeout(async () => {
            const { showFeedback: fb } = await import('../../ui/feedback');
            fb(`${techName} 的記憶碎片已集齊——去圖鑑研習`, 'success');
          }, 2500);
        }
      }
    }
  }

  saveWildProfile(profile);

  // Session round 10 complete: apply streak bonus and finalize
  if (session && session.round === 10) {
    const multiplier = sessionStreakMultiplier(session.wins);
    const bonusExp = Math.round(session.totalExp * (multiplier - 1));
    if (bonusExp > 0) {
      applyExp(profile, bonusExp);
      saveWildProfile(profile);
    }
    // Don't clear session yet — win celebration will read it for summary
    _active = false;
    resetWildGsFields();
    return { expGained, leveledUp: result.leveledUp, newLevel: result.newLevel, firstKill: isFirstKill ? meta?.name ?? null : null, firstKillSub: isFirstKill ? meta?.subtitle ?? null : null, beatMentor };
  }

  _active = false;
  resetWildGsFields();

  // Mentor triggers (async, non-blocking — fire after win celebration)
  setTimeout(async () => {
    // First ever kill
    if (profile.puzzlesCompleted === 1) {
      await triggerFirstKillIfNeeded();
    }
    // Level-up milestone
    if (result.leveledUp) {
      await triggerMilestoneIfNeeded(result.newLevel);
    }
    // Check if all techniques conquered (finale)
    const totalTechs = 40;
    const conqueredCount = Object.values(profile.bestiary).filter((e) => e.kills > 0).length;
    await triggerFinaleIfNeeded(conqueredCount >= totalTechs);
  }, 2000);

  return { ...result, firstKill: isFirstKill ? meta?.name ?? null : null, firstKillSub: isFirstKill ? meta?.subtitle ?? null : null, beatMentor };
}

async function launchGauntletNext(profile: WildProfile): Promise<void> {
  const nextMeta = getTechniqueMeta(_encounter!.technique);

  if (nextMeta) {
    if (!profile.bestiary[_encounter!.technique]) {
      profile.bestiary[_encounter!.technique] = {
        discovered: new Date().toISOString().slice(0, 10),
        encounters: 0,
        kills: 0,
        escapes: 0,
        bestTime: null,
      };
    }
    profile.bestiary[_encounter!.technique].encounters++;
    saveWildProfile(profile);
  }

  const wildLevel: LevelData = {
    id: -Date.now(),
    stars: 0,
    difficultyName: '世界',
    displayName: nextMeta
      ? `${nextMeta.name} · ${nextMeta.subtitle} [百鬼 ${_gauntletIdx + 1}/5]`
      : `世界 [百鬼 ${_gauntletIdx + 1}/5]`,
    puzzle: _encounter!.puzzle,
    solution: _encounter!.solution,
    maxTechnique: _encounter!.technique,
    source: 'wild',
  };

  applyRarityTint(_encounter!.rarity);

  const { initGame, updateLivesUI } = await import('../../game/core');
  initGame(wildLevel.id, true, false, null, wildLevel);

  gs.wildChallengeMode = 'gauntlet';
  gs.maxErrors = CHALLENGE_CONFIGS.gauntlet.maxErrors;
  gs.wildBlindMode = false;
  gs.wildNotesDisabled = false;
  updateLivesUI();

  showFeedback(`百鬼夜行 ${_gauntletIdx + 1}/5`, 'success');
}

// ── Fail / escape handler (called from core.ts showGameOver) ─────────

export function onWildEscape(): void {
  if (!_encounter || !_active) return;

  const profile = getWildProfile();

  // Handle gauntlet failure
  if (isGauntletActive()) {
    failGauntlet();
  }

  // Update bestiary
  const entry = profile.bestiary[_encounter.technique];
  if (entry) entry.escapes++;

  // Set cooldown for this technique
  setEscapeCooldown(profile, _encounter.technique);

  // Tick cooldowns — escaping still counts as "completing" a puzzle attempt
  profile.puzzlesCompleted++;
  tickCooldowns(profile);

  // Session: loss counts but session continues (player can still advance)
  // No wins increment on escape

  saveWildProfile(profile);
  _active = false;
  resetWildGsFields();
}

// ── Continue to next encounter ───────────────────────────────────────

export async function continueWild(): Promise<void> {
  clearRarityTint();
  const profile = getWildProfile();
  const session = profile.currentSession;

  // If session round 10 is done, start a new session
  if (session && session.round >= 10) {
    profile.currentSession = { round: 0, wins: 0, totalExp: 0, techniques: [] };
    saveWildProfile(profile);
  }

  await startWildEncounter();
}

// ── Exit Wild (return to level screen) ───────────────────────────────

export function exitWild(): void {
  _active = false;
  _encounter = null;
  _gauntletQueue = [];
  _gauntletIdx = 0;
  _gauntletTotalExp = 0;
  resetWildGsFields();
  clearRarityTint();

  // Clear session on exit
  const profile = getWildProfile();
  if (profile.currentSession) {
    profile.currentSession = null;
    saveWildProfile(profile);
  }
}

// ── Rarity environment tint ──────────────────────────────────────────

function applyRarityTint(rarity: string): void {
  const container = document.querySelector('.game-container') as HTMLElement | null;
  if (!container) return;
  clearRarityTint();
  container.classList.add(`wild-${rarity}`);
}

function clearRarityTint(): void {
  const container = document.querySelector('.game-container') as HTMLElement | null;
  if (!container) return;
  container.classList.remove('wild-common', 'wild-rare', 'wild-legendary', 'wild-mythic');
}

// ── Profile summary (for UI) ─────────────────────────────────────────

export function getProfileSummary(): {
  level: number;
  exp: number;
  expNext: number;
  expProgress: number;
  discovered: number;
  completed: number;
} {
  const p = getWildProfile();
  const currentThreshold = expForLevel(p.iqLevel);
  const nextThreshold = expForLevel(p.iqLevel + 1);
  const expInLevel = p.totalExp - currentThreshold;
  const expNeeded = nextThreshold - currentThreshold;
  return {
    level: p.iqLevel,
    exp: p.totalExp,
    expNext: nextThreshold,
    expProgress: expNeeded > 0 ? Math.min(1, expInLevel / expNeeded) : 0,
    discovered: Object.keys(p.bestiary).length,
    completed: p.puzzlesCompleted,
  };
}
