// Mentor controller — manages showing 弈塵's messages at the right moments.
// Tracks which messages have been seen via localStorage.

import { readJson, writeJson } from '../../storage/keys';
import type { MentorLine } from './mentorDialogue';
import {
  MENTOR_INTRO,
  MENTOR_POST_DEMO,
  MENTOR_FINALE,
  getMilestoneForLevel,
  getTechNote,
  MENTOR_ENCOUNTER_HINTS,
} from './mentorDialogue';
import { t } from '../../i18n/t';

// ── Seen state persistence ───────────────────────────────────────────

const SEEN_KEY = 'sudoku_mentor_seen';
const INTRO_DEFER_KEY = 'sudoku_mentor_intro_deferred';

function getSeenSet(): Set<string> {
  const arr = readJson<string[]>(SEEN_KEY, []);
  return new Set(arr);
}

function markSeen(key: string): void {
  const seen = getSeenSet();
  seen.add(key);
  writeJson(SEEN_KEY, [...seen]);
}

function hasSeen(key: string): boolean {
  return getSeenSet().has(key);
}

export function hasCompletedMentorIntro(): boolean {
  return hasSeen('intro_complete');
}

export function isMentorIntroDeferred(): boolean {
  return readJson<boolean>(INTRO_DEFER_KEY, false) === true;
}

export function deferMentorIntro(): void {
  writeJson(INTRO_DEFER_KEY, true);
}

// ── Display ──────────────────────────────────────────────────────────

let _dismissResolve: (() => void) | null = null;

function showMentorMessage(line: MentorLine): Promise<void> {
  return new Promise((resolve) => {
    _dismissResolve = () => {
      import('../../react/mentor/mentorBridge')
        .then(({ bridgeDismissMentor }) => bridgeDismissMentor())
        .catch(() => {});
      markSeen(line.key);
      _dismissResolve = null;
      resolve();
    };

    import('../../react/mentor/mentorBridge')
      .then(({ bridgeShowMentor }) => {
        bridgeShowMentor(line.text, line.sub ?? '');
      })
      .catch(() => {});
  });
}

export function dismissMentor(): void {
  _dismissResolve?.();
}

// ── Trigger points ───────────────────────────────────────────────────

/** Show intro sequence + power demo on first ever World mode entry. */
export async function triggerIntroIfNeeded(): Promise<void> {
  if (hasSeen('intro_complete')) return;

  // Step 1: Brief intro lines
  for (const line of MENTOR_INTRO) {
    if (!hasSeen(line.key)) {
      await showMentorMessage(line);
    }
  }

  // Step 2: Power demonstration (弈塵's solve replay)
  const { runMentorDemo } = await import('./mentorDemo');
  await runMentorDemo();

  // Step 3: Post-demo dialogue (the failure, the handoff)
  for (const line of MENTOR_POST_DEMO) {
    if (!hasSeen(line.key)) {
      await showMentorMessage(line);
    }
  }

  // Mark intro as complete
  markSeen('intro_complete');
  writeJson(INTRO_DEFER_KEY, false);
}

export async function startMentorIntroNow(): Promise<void> {
  writeJson(INTRO_DEFER_KEY, false);
  await triggerIntroIfNeeded();
}

/** Show milestone message on level-up (called from expSystem or wildController). */
export async function triggerMilestoneIfNeeded(newLevel: number): Promise<void> {
  const milestone = getMilestoneForLevel(newLevel);
  if (!milestone) return;
  if (hasSeen(milestone.key)) return;
  await showMentorMessage(milestone);
}

/** Show first-kill message. */
export async function triggerFirstKillIfNeeded(): Promise<void> {
  const key = 'first_kill';
  if (hasSeen(key)) return;
  await showMentorMessage({ key, text: t('miscRuntime.firstKillText'), sub: t('miscRuntime.firstKillSub') });
}

/** Show finale message after defeating exocet or collecting all. */
export async function triggerFinaleIfNeeded(allConquered: boolean): Promise<void> {
  if (!allConquered) return;
  if (hasSeen(MENTOR_FINALE.key)) return;
  await showMentorMessage(MENTOR_FINALE);
}

/** One-time hint: teach continuous fill on first encounter. */
export function triggerContinuousFillHint(): void {
  if (hasSeen('hint_continuous_fill')) return;
  markSeen('hint_continuous_fill');

  // Pulse the continuous fill button
  const btn = document.getElementById('continuous-fill-toggle');
  if (btn) {
    btn.classList.add('hint-pulse');
    setTimeout(() => btn.classList.remove('hint-pulse'), 4000);
  }

  // Show mentor hint after a brief delay (let player see the board first)
  setTimeout(async () => {
    const { showFeedback } = await import('../../ui/feedback');
    showFeedback(t('miscRuntime.continuousFillHint'), 'success');
  }, 1500);
}

/** Get tech note for bestiary display. */
export function getMentorNote(techKey: string, conquered: boolean): string | null {
  return getTechNote(techKey, conquered);
}

// ── Encounter hint timers (L1/L2/L3 — first-encounter guidance) ──────

let _hintTimers: ReturnType<typeof setTimeout>[] = [];
let _hintLevel = 0;

function showEncounterHint(techKey: string, level: 1 | 2 | 3): void {
  const hints = MENTOR_ENCOUNTER_HINTS[techKey];
  if (!hints) return;
  const text = level === 1 ? hints.level1 : level === 2 ? hints.level2 : hints.level3;
  if (!text || text.startsWith('mentor.encounterHints.')) return; // i18n key not yet translated
  import('../../react/mentor/mentorBridge')
    .then(({ bridgeShowMentor }) => {
      bridgeShowMentor(text, '── 弈塵 ──');
    })
    .catch(() => {});
}

/**
 * Start time-based encounter hint timers.
 * Call this immediately after a first-encounter puzzle is launched,
 * or on re-encounters of not-yet-conquered Tier 2+ techniques (isVeiled=true).
 * Timers stop automatically on stopEncounterHintTimers().
 */
export function startEncounterHintTimers(techKey: string, isFirstEncounter: boolean, isVeiled = false): void {
  stopEncounterHintTimers();
  if (!isFirstEncounter && !isVeiled) return;
  // No hints defined for this technique — skip entirely.
  if (!MENTOR_ENCOUNTER_HINTS[techKey]) return;

  _hintLevel = 0;

  // Re-encounters of unmastered techniques (isVeiled && !isFirstEncounter):
  // skip L1 (player already knows CTM), start from L2 at 5 min.
  if (isVeiled && !isFirstEncounter) {
    const L2_MS = 5 * 60 * 1000;
    const L3_MS = 10 * 60 * 1000;

    const t2 = setTimeout(() => {
      if (_hintLevel >= 2) return;
      _hintLevel = 2;
      showEncounterHint(techKey, 2);
    }, L2_MS);

    const t3 = setTimeout(() => {
      if (_hintLevel >= 3) return;
      _hintLevel = 3;
      showEncounterHint(techKey, 3);
    }, L3_MS);

    _hintTimers.push(t2, t3);
    return;
  }

  // First encounter: L1 / L2 / L3 at staggered intervals.
  //   L1 —  30 s (CTM introduction)
  //   L2 — 330 s = 30s + 5 min (structural hint)
  //   L3 — 630 s = 30s + 5 min + 5 min (near give-up)
  const L1_MS = 30 * 1000;
  const L2_MS = 30 * 1000 + 5 * 60 * 1000;
  const L3_MS = 30 * 1000 + 10 * 60 * 1000;

  const t1 = setTimeout(() => {
    if (_hintLevel >= 1) return;
    _hintLevel = 1;
    showEncounterHint(techKey, 1);
  }, L1_MS);

  const t2 = setTimeout(() => {
    if (_hintLevel >= 2) return;
    _hintLevel = 2;
    showEncounterHint(techKey, 2);
  }, L2_MS);

  const t3 = setTimeout(() => {
    if (_hintLevel >= 3) return;
    _hintLevel = 3;
    showEncounterHint(techKey, 3);
  }, L3_MS);

  _hintTimers.push(t1, t2, t3);
}

/** Pulse the numpad digit buttons to guide the player toward a long-press. */
function pulseCTMNumpad(): void {
  const numpad = document.getElementById('numpad');
  if (!numpad) return;
  numpad.querySelectorAll<HTMLElement>('.num-btn').forEach((el) => el.classList.add('ctm-intro-pulse'));
  setTimeout(() => {
    numpad.querySelectorAll<HTMLElement>('.num-btn').forEach((el) => el.classList.remove('ctm-intro-pulse'));
  }, 8000);
}

/**
 * One-time CTM introduction hint, shown immediately when the player enters
 * their first Tier 2+ (???) encounter. Fires after a 2-second delay so
 * the board is visible before the overlay appears.
 */
export function triggerCtmIntroIfNeeded(techKey: string, isFirstEncounter: boolean, isVeiled: boolean): void {
  if (!isFirstEncounter || !isVeiled) return;
  if (hasSeen('ctm_intro')) return;
  markSeen('ctm_intro');

  setTimeout(() => {
    pulseCTMNumpad();
    import('../../react/mentor/mentorBridge')
      .then(({ bridgeShowMentor }) => {
        bridgeShowMentor(t('mentor.ctmIntro.text'), t('mentor.ctmIntro.sub'));
      })
      .catch(() => {});
  }, 2000);
}

/** Stop all active encounter hint timers (call on encounter exit or win). */
export function stopEncounterHintTimers(): void {
  _hintTimers.forEach(clearTimeout);
  _hintTimers = [];
  _hintLevel = 0;
}

/** Returns the highest hint level shown during this encounter (0 = no hints used). */
export function getEncounterHintLevel(): number {
  return _hintLevel;
}
