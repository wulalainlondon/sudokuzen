// Wild mode controller — encounter lifecycle, bridging ecology engine → game core.
// Replaces the old "今日隨機" with the ecology-driven Wild system.

import { gs, type LevelData } from '../../game/state';
import { formatSeconds } from '../../game/utils';
import { showFeedback } from '../../ui/feedback';
import { showConfirm } from '../../ui/dialog';
import {
  loadWildProfile,
  saveWildProfile,
  CHALLENGE_CONFIGS,
  saveWildEncounter,
  loadWildSave,
  clearWildSave,
  type WildProfile,
  type WildEncounter,
  type WildSaveData,
  type ChallengeMode,
} from './wildState';
import { selectEncounter, selectSessionEncounter, tickCooldowns, setEscapeCooldown } from './ecologyEngine';
import { getTechniqueMeta, getAutoCastKeys } from './techniqueMeta';
import { calculateExp, applyExp, expForLevel, getUnstudiedGateSkills } from './expSystem';
import { autoSolve } from './autoSolver';
import {
  triggerIntroIfNeeded,
  hasCompletedMentorIntro,
  isMentorIntroDeferred,
  deferMentorIntro,
  triggerFirstKillIfNeeded,
  triggerMilestoneIfNeeded,
  triggerFinaleIfNeeded,
  triggerContinuousFillHint,
  startEncounterHintTimers,
  stopEncounterHintTimers,
  triggerCtmIntroIfNeeded,
  getEncounterHintLevel,
} from './mentorController';
import { bridgeShowEncounterTransition } from '../../react/wild/encounterTransitionBridge';
import { playZenEnter, playZenEncounter, playZenBoss } from '../../game/zenAudio';
import { t } from '../../i18n/t';
import { SK } from '../../storage/keys';
import { getEquippedTitle, getTitleResonanceBonus } from '../titles';
import { setNextLevelScreenReturnTarget } from '../levels';

// ── Extracted modules ────────────────────────────────────────────────

import {
  initGauntlet,
  isGauntletActive,
  advanceGauntletOnWin,
  failGauntlet,
  launchGauntletNext,
  getGauntletQueue,
  resetGauntletState,
} from './gauntletEngine';

import { sessionStreakMultiplier } from './sessionManager';

import { TUTORIAL_TOTAL } from './wildTutorial';

// ── Re-exports from extracted modules ────────────────────────────────

export { initGauntlet, isGauntletActive, failGauntlet, launchGauntletNext, getGauntletQueue } from './gauntletEngine';
export { getSession, sessionStreakMultiplier, startWorldSession } from './sessionManager';

// ── Runtime state (non-persisted) ────────────────────────────────────

let _profile: WildProfile | null = null;
let _encounter: WildEncounter | null = null;
let _active = false;

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

// ── Save / Resume (pause mid-encounter) ─────────────────────────────

export function saveCurrentEncounter(): void {
  if (!_encounter || !_active) return;
  if (!gs.currentLevel) return;

  const saveData: WildSaveData = {
    encounter: { ..._encounter },
    levelData: {
      id: gs.currentLevel.id,
      displayName: gs.currentLevel.displayName,
      puzzle: gs.currentLevel.puzzle,
      solution: gs.currentLevel.solution,
      maxTechnique: gs.currentLevel.maxTechnique || '',
    },
    cellsData: gs.cellsData.map((c) => ({ value: c.value, fixed: c.fixed, notes: [...c.notes], isError: false })),
    seconds: gs.seconds,
    errors: gs.errors,
    challengeMode: _encounter.challengeMode,
    actionHistory: gs.actionHistory,
    savedAt: Date.now(),
  };
  saveWildEncounter(saveData);
}

export async function resumeWildEncounter(): Promise<void> {
  const save = loadWildSave();
  if (!save) return;

  _encounter = save.encounter;
  _active = true;

  const meta = getTechniqueMeta(_encounter.technique);
  applyRarityTint(_encounter.rarity);

  // Build a LevelData for the game core
  const config = CHALLENGE_CONFIGS[save.challengeMode];
  const modeLabel = save.challengeMode !== 'standard' ? ` [${config.displayName}]` : '';
  const wildLevel: LevelData = {
    id: save.levelData.id,
    stars: 0,
    difficultyName: t('wildRuntime.difficultyWorld'),
    displayName: meta
      ? `${meta.name} · ${meta.subtitle}${modeLabel}`
      : `${t('wildRuntime.difficultyWorld')}${modeLabel}`,
    puzzle: save.levelData.puzzle,
    solution: save.levelData.solution,
    maxTechnique: save.levelData.maxTechnique,
    source: 'wild',
  };

  // Write to normal save key so initGame(forceReset=false) can load it
  const { SK } = await import('../../storage/keys');
  const saveKey = SK.save(wildLevel.id, false);
  localStorage.setItem(
    saveKey,
    JSON.stringify({
      levelId: wildLevel.id,
      cellsData: save.cellsData,
      seconds: save.seconds,
      errors: save.errors,
      submissionCount: 0,
      actionHistory: save.actionHistory,
    }),
  );

  // Launch game — initGame with forceReset=false will pick up the save
  const levelScreenEl = document.getElementById('level-screen');
  if (levelScreenEl) levelScreenEl.style.display = 'none';
  const { initGame, updateLivesUI } = await import('../../game/core');
  initGame(wildLevel.id, false, false, null, wildLevel);

  // Remove temp save key (initGame already consumed it)
  localStorage.removeItem(saveKey);

  // Apply challenge mode settings AFTER initGame
  gs.wildChallengeMode = save.challengeMode as ChallengeMode;
  gs.maxErrors = config.maxErrors;
  gs.wildBlindMode = save.challengeMode === 'blind';
  gs.wildNotesDisabled = !!config.notesDisabled;
  updateLivesUI();

  // For timed mode: start countdown with remaining time
  if (save.challengeMode === 'timed' && config.timerCountdown) {
    if (gs.timerInterval) {
      clearInterval(gs.timerInterval);
      gs.timerInterval = null;
    }
    // Calculate remaining time: original countdown minus elapsed seconds
    const elapsed = save.seconds;
    const remaining = Math.max(1, config.timerCountdown - elapsed);
    startCountdown(remaining);
  }
}

export function abandonWildEncounter(): void {
  const save = loadWildSave();
  if (!save) return;

  // Treat as escape — apply cooldown
  _encounter = save.encounter;
  _active = true;
  onWildEscape();
  clearWildSave();
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
  if (gs.wildTimerInterval) {
    clearInterval(gs.wildTimerInterval);
    gs.wildTimerInterval = null;
  }
  gs.wildTimerCountdown = seconds;
  // Show initial countdown display
  if (gs.timerEl) gs.timerEl.textContent = formatSeconds(gs.wildTimerCountdown);
  gs.wildTimerInterval = setInterval(() => {
    gs.wildTimerCountdown--;
    gs.seconds++;
    if (gs.timerEl) gs.timerEl.textContent = formatSeconds(gs.wildTimerCountdown);
    if (gs.wildTimerCountdown <= 0) {
      clearInterval(gs.wildTimerInterval!);
      gs.wildTimerInterval = null;
      // Trigger game over via lazy import to avoid circular deps
      import('../../game/core').then((m) => m.showGameOver()).catch(() => {});
    }
  }, 1000);
}

export function resumeTimedCountdown(): void {
  if (gs.wildChallengeMode !== 'timed') return;
  if (gs.wildTimerCountdown <= 0) return;
  if (gs.wildTimerInterval) return;
  startCountdown(gs.wildTimerCountdown);
}

// ── Enter Wild (replaces startPoolRandom) ────────────────────────────

export async function startWildEncounter(): Promise<void> {
  const profile = getWildProfile();

  // Tutorial: first 3 encounters are fixed for new players
  if (!profile.tutorialCompleted) {
    if (!isMentorIntroDeferred()) {
      await triggerIntroIfNeeded();
    }

    const { TUTORIAL_ENCOUNTERS } = await import('./wildTutorial');
    const tutEnc = TUTORIAL_ENCOUNTERS[profile.tutorialRound ?? 0];
    if (tutEnc) {
      _encounter = { ...tutEnc, startedAt: Date.now() };

      _active = true;
      profile.totalEncounters = (profile.totalEncounters ?? 0) + 1;

      import('../../features/skills/candidateTrackingController')
        .then((m) => m.resetTrackingEncounterState())
        .catch(() => {});

      const meta = getTechniqueMeta(_encounter.technique);
      if (meta) {
        if (!profile.bestiary[_encounter.technique]) {
          profile.bestiary[_encounter.technique] = {
            discovered: new Date().toISOString().slice(0, 10),
            encounters: 0,
            kills: 0,
            escapes: 0,
            bestTime: null,
            modesCleared: [],
          };
        }
        profile.bestiary[_encounter.technique].encounters++;
        saveWildProfile(profile);
      }

      const config = CHALLENGE_CONFIGS[_encounter.challengeMode];
      const bestiaryEntry = profile.bestiary[_encounter.technique];
      const isFirstEncounter = bestiaryEntry ? bestiaryEntry.encounters === 1 : false;
      const wildLevel: LevelData = {
        id: -Date.now(),
        stars: 0,
        difficultyName: t('wildRuntime.difficultyWorld'),
        displayName: meta ? `${meta.name} · ${meta.subtitle}` : t('wildRuntime.difficultyWorld'),
        puzzle: _encounter.puzzle,
        solution: _encounter.solution,
        maxTechnique: _encounter.technique,
        source: 'wild',
      };

      applyRarityTint(_encounter.rarity);
      bridgeShowEncounterTransition({
        techName: meta?.name ?? '???',
        techSubtitle: meta?.subtitle ?? '',
        rarity: _encounter.rarity,
        challengeMode: _encounter.challengeMode,
        isBoss: false,
        isFirstEncounter,
        rarityTone: _encounter.rarity,
        isResume: false,
      });
      playZenEnter();
      setTimeout(() => playZenEncounter(), 400);

      const levelScreenLaunch = document.getElementById('level-screen');
      if (levelScreenLaunch) levelScreenLaunch.style.display = 'none';
      const { initGame } = await import('../../game/core');
      initGame(wildLevel.id, true, false, null, wildLevel);

      gs.wildChallengeMode = _encounter.challengeMode;
      gs.maxErrors = config.maxErrors;
      gs.wildBlindMode = false;
      gs.wildNotesDisabled = false;

      const { updateLivesUI } = await import('../../game/core');
      updateLivesUI();

      // Auto-unlock CTM at locked_candidates tutorial encounter
      if (isFirstEncounter && _encounter.technique === 'locked_candidates' && !gs.candidateTrackingEnabled) {
        gs.candidateTrackingEnabled = true;
        localStorage.setItem(SK.CTM_ENABLED, '1');
      }

      startEncounterHintTimers(_encounter.technique, isFirstEncounter, false);
      triggerCtmIntroIfNeeded(_encounter.technique, isFirstEncounter, false);

      showFeedback(t('wild.encounterLoading'), 'success');

      return;
    }
  }

  // First entry: allow skipping/deferring mentor prologue so the first puzzle starts immediately.
  if (!hasCompletedMentorIntro() && !isMentorIntroDeferred()) {
    const shouldWatchNow = await showConfirm(t('wild.introPrompt'), t('wild.watchIntro'), t('cancel'));
    if (shouldWatchNow) {
      await triggerIntroIfNeeded();
    } else {
      deferMentorIntro();
      showFeedback(t('wild.introDeferred'), 'success');
    }
  }

  // If in a session, advance the round
  const session = profile.currentSession;
  if (session && session.round < 10) {
    session.round++;
    saveWildProfile(profile);
  }

  showFeedback(
    session ? t('wild.sessionRound', { round: String(session.round) }) : t('wild.encounterLoading'),
    'success',
  );

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
    showFeedback(t('wild.poolLoadError'), 'error');
    console.error('[Wild] selectEncounter failed:', e);
    return;
  }

  _active = true;
  profile.totalEncounters = (profile.totalEncounters ?? 0) + 1;

  // Reset per-encounter CTM transient state (e.g. firstDiscovery toast guard)
  import('../../features/skills/candidateTrackingController')
    .then((m) => m.resetTrackingEncounterState())
    .catch(() => {});

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
        modesCleared: [],
      };
    }
    profile.bestiary[_encounter.technique].encounters++;
    saveWildProfile(profile);
  }

  const mode = _encounter.challengeMode;
  const config = CHALLENGE_CONFIGS[mode];

  // Auto-solve mastered techniques to produce bottleneck state
  let puzzleToUse = _encounter.puzzle;
  if (profile.autoCastEnabled) {
    const autoCastKeys = getAutoCastKeys(profile.iqLevel);
    // Don't auto-cast the target technique itself
    autoCastKeys.delete(_encounter.technique);
    if (autoCastKeys.size > 0) {
      const result = autoSolve(_encounter.puzzle, _encounter.solution, autoCastKeys);
      // P1a: Ensure at least 5 empty cells remain after auto-solve
      // If auto-solve leaves too few, fall back to original puzzle
      const emptyCount = result.partialPuzzle.filter((v) => v === 0).length;
      if (emptyCount >= 5) {
        puzzleToUse = result.partialPuzzle;
        // Keep encounters manual: do not auto-fill candidates.
      }
      // else: skip auto-solve entirely to avoid empty-board encounters
    }
  }

  // Build a LevelData for the game core
  const modeLabel = mode !== 'standard' ? ` [${config.displayName}]` : '';
  const sessionLabel = session ? `[${session.round}/10] ` : '';
  const bossLabel = session && session.round === 10 ? ' 【BOSS】' : '';
  const isBoss = !!(session && session.round === 10);
  const bestiaryEntry = profile.bestiary[_encounter.technique];
  const isFirstEncounter = bestiaryEntry ? bestiaryEntry.encounters === 1 : false;
  const isConquered = bestiaryEntry ? bestiaryEntry.kills > 0 : false;
  // Tier 2+ not-yet-conquered encounters: veil the name as ??? throughout the encounter
  const veilName = !isConquered && meta !== undefined && meta.tier >= 2;
  const wildLevel: LevelData = {
    id: -Date.now(), // negative = Wild mode, unique per encounter
    stars: 0,
    difficultyName: t('wildRuntime.difficultyWorld'),
    displayName: veilName
      ? `${sessionLabel}??? · ${t('wildRuntime.unknownPattern')}${modeLabel}${bossLabel}`
      : meta
        ? `${sessionLabel}${meta.name} · ${meta.subtitle}${modeLabel}${bossLabel}`
        : `${sessionLabel}${t('wildRuntime.difficultyWorld')}${modeLabel}${bossLabel}`,
    puzzle: puzzleToUse,
    solution: _encounter.solution,
    maxTechnique: _encounter.technique,
    source: 'wild',
  };

  // Apply rarity tint to game container
  applyRarityTint(_encounter.rarity);

  // Trigger encounter transition overlay with zen audio
  bridgeShowEncounterTransition({
    techName: veilName ? '???' : (meta?.name ?? '???'),
    techSubtitle: veilName ? t('wildRuntime.unknownPattern') : meta ? meta.subtitle : t('wildRuntime.difficultyWorld'),
    rarity: _encounter.rarity,
    challengeMode: mode,
    isBoss,
    isFirstEncounter,
    rarityTone: _encounter.rarity,
    isResume: false,
  });
  // Phase 1 audio: temple bell
  playZenEnter();
  // Phase 2 audio: brush on paper (delayed 400ms)
  setTimeout(() => playZenEncounter(), 400);
  // Phase 3 audio: boss thunder if boss (delayed 1200ms)
  if (isBoss) {
    setTimeout(() => playZenBoss(), 1200);
  }
  // Phase 4: transition auto-dismisses at 2200ms via the component

  // Launch game via core — dynamic import to avoid circular deps
  const levelScreenLaunch = document.getElementById('level-screen');
  if (levelScreenLaunch) levelScreenLaunch.style.display = 'none';
  const { initGame } = await import('../../game/core');
  initGame(wildLevel.id, true, false, null, wildLevel);

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
    await initGauntlet(profile, _encounter);
  }

  // Track technique in session
  if (session && !session.techniques.includes(_encounter.technique)) {
    session.techniques.push(_encounter.technique);
    saveWildProfile(profile);
  }

  // First encounter indicator / boss indicator
  if (session && session.round === 10) {
    showFeedback(t('wild.bossEncounter'), 'success');
  } else {
    const bestiaryEntry = profile.bestiary[_encounter.technique];
    if (bestiaryEntry && bestiaryEntry.encounters === 1) {
      if (veilName) {
        showFeedback(t('wild.firstEncounter'), 'success');
      } else {
        showFeedback(t('wild.firstEncounterNamed', { name: meta?.name ?? '???' }), 'success');
      }
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
      timerEl.title = t('skills.mentorRecord', { time: timeStr });
    }
  }

  // One-time hint: teach continuous fill on first encounter
  if (profile.totalEncounters <= 1) {
    triggerContinuousFillHint();
  }

  // Auto-unlock CTM at first Locked Candidates encounter
  if (isFirstEncounter && _encounter.technique === 'locked_candidates' && !gs.candidateTrackingEnabled) {
    gs.candidateTrackingEnabled = true;
    localStorage.setItem(SK.CTM_ENABLED, '1');
  }

  // Start encounter hint timers for first encounters and re-encounters of unmastered techniques
  startEncounterHintTimers(_encounter.technique, isFirstEncounter, veilName);

  // Immediate CTM introduction for first ??? encounter (any Tier 2+ technique)
  triggerCtmIntroIfNeeded(_encounter.technique, isFirstEncounter, veilName);
}

// ── Win handler (called from core.ts checkWin) ───────────────────────

export function onWildComplete(
  seconds: number,
  errors: number,
): {
  expGained: number;
  leveledUp: boolean;
  newLevel: number;
  firstKill: string | null;
  firstKillSub: string | null;
  firstKillKey: string | null;
  beatMentor: boolean;
  cleanSolveBonus: number;
} {
  if (!_encounter || !_active)
    return {
      expGained: 0,
      leveledUp: false,
      newLevel: 1,
      firstKill: null,
      firstKillSub: null,
      firstKillKey: null,
      beatMentor: false,
      cleanSolveBonus: 0,
    };

  // Handle gauntlet advancement
  if (isGauntletActive()) {
    const profile = getWildProfile();
    const gauntletResult = advanceGauntletOnWin(_encounter, profile, seconds, errors);

    if (gauntletResult.done) {
      // Gauntlet complete
      _active = false;
      resetWildGsFields();
      stopEncounterHintTimers();
      return {
        ...gauntletResult.result!,
        firstKill: null,
        firstKillSub: null,
        firstKillKey: null,
        beatMentor: false,
        cleanSolveBonus: 0,
      };
    }

    // Not final — advance to next encounter
    _encounter = gauntletResult.nextEncounter!;

    // Async: launch next puzzle
    launchGauntletNext(profile, _encounter, applyRarityTint);

    // Return 0 exp (not finished yet) — the win celebration should show gauntlet progress
    return {
      expGained: 0,
      leveledUp: false,
      newLevel: profile.iqLevel,
      firstKill: null,
      firstKillSub: null,
      firstKillKey: null,
      beatMentor: false,
      cleanSolveBonus: 0,
    };
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

  // Title resonance bonus: +10% EXP
  const titleBonus = getTitleResonanceBonus(getEquippedTitle(), _encounter.technique);
  if (titleBonus > 0) {
    expGained = Math.round(expGained * (1 + titleBonus));
    showFeedback(t('titles.resonanceBonus'), 'success');
  }

  // Clean solve bonus: +20 EXP for completing without any mentor hints
  const CLEAN_SOLVE_BONUS = 20;
  const cleanSolveBonus = getEncounterHintLevel() === 0 ? CLEAN_SOLVE_BONUS : 0;
  if (cleanSolveBonus > 0) expGained += cleanSolveBonus;

  const result = applyExp(profile, expGained);

  // P0: Show clear feedback when Lv.20 gate blocks progression
  if (result.gated) {
    const unstudied = getUnstudiedGateSkills(profile);
    const banked = profile.gateOverflowExp ?? 0;
    showFeedback(t('wild.gateBlockedWithOverflow', { count: String(unstudied.length), exp: String(banked) }), 'error');
  }

  // Update bestiary
  const entry = profile.bestiary[_encounter.technique];
  const isFirstKill = entry ? entry.kills === 0 : false;
  if (entry) {
    entry.kills++;
    if (entry.bestTime === null || seconds < entry.bestTime) {
      entry.bestTime = seconds;
    }
    // Record challenge mode cleared
    if (!entry.modesCleared) entry.modesCleared = [];
    if (!entry.modesCleared.includes(_encounter.challengeMode)) {
      entry.modesCleared.push(_encounter.challengeMode);
    }
  }

  // Advance tutorial round if in tutorial
  if (!profile.tutorialCompleted) {
    profile.tutorialRound = (profile.tutorialRound ?? 0) + 1;
    if (profile.tutorialRound >= TUTORIAL_TOTAL) {
      profile.tutorialCompleted = true;
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
        if (
          profile.fragments[_encounter.technique] >= fragMeta.fragmentsRequired &&
          current < fragMeta.fragmentsRequired
        ) {
          const techName = fragMeta.name;
          setTimeout(async () => {
            const { showFeedback: fb } = await import('../../ui/feedback');
            fb(t('skills.fragmentsCollected', { name: techName }), 'success');
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
    clearWildSave();
    stopEncounterHintTimers();
    return {
      expGained,
      leveledUp: result.leveledUp,
      newLevel: result.newLevel,
      firstKill: isFirstKill ? (meta?.name ?? null) : null,
      firstKillSub: isFirstKill ? (meta?.subtitle ?? null) : null,
      firstKillKey: isFirstKill ? _encounter.technique : null,
      beatMentor,
      cleanSolveBonus,
    };
  }

  _active = false;
  resetWildGsFields();
  clearWildSave();
  stopEncounterHintTimers();

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

  return {
    ...result,
    firstKill: isFirstKill ? (meta?.name ?? null) : null,
    firstKillSub: isFirstKill ? (meta?.subtitle ?? null) : null,
    firstKillKey: isFirstKill ? _encounter.technique : null,
    beatMentor,
    cleanSolveBonus,
  };
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
  clearWildSave();
  stopEncounterHintTimers();
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
  void import('../../game/bgm').then(({ stopBgm }) => stopBgm());
  setNextLevelScreenReturnTarget('world');
  // Save encounter state for resume (if mid-encounter and not gauntlet)
  if (_active && _encounter && getGauntletQueue().length === 0) {
    saveCurrentEncounter();
  }

  stopEncounterHintTimers();
  _active = false;
  _encounter = null;
  resetGauntletState();
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
  container.setAttribute('data-rarity', rarity);
}

function clearRarityTint(): void {
  const container = document.querySelector('.game-container') as HTMLElement | null;
  if (!container) return;
  container.classList.remove('wild-common', 'wild-rare', 'wild-legendary', 'wild-mythic');
  container.removeAttribute('data-rarity');
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
