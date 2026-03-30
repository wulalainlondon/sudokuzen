// Mentor controller — manages showing 弈塵's messages at the right moments.
// Tracks which messages have been seen via localStorage.

import { readJson, writeJson } from '../../storage/keys';
import type { MentorLine } from './mentorDialogue';
import { MENTOR_INTRO, MENTOR_POST_DEMO, MENTOR_FINALE, getMilestoneForLevel, getTechNote } from './mentorDialogue';

// ── Seen state persistence ───────────────────────────────────────────

const SEEN_KEY = 'sudoku_mentor_seen';

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

// ── Display ──────────────────────────────────────────────────────────

let _dismissResolve: (() => void) | null = null;

function showMentorMessage(line: MentorLine): Promise<void> {
  return new Promise((resolve) => {
    const overlay = document.getElementById('mentor-overlay');
    const textEl = document.getElementById('mentor-text');
    const subEl = document.getElementById('mentor-sub');
    if (!overlay || !textEl || !subEl) {
      resolve();
      return;
    }

    textEl.textContent = line.text;
    subEl.textContent = line.sub ?? '';
    overlay.classList.remove('hidden');
    _dismissResolve = () => {
      overlay.classList.add('hidden');
      markSeen(line.key);
      _dismissResolve = null;
      resolve();
    };
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
  await showMentorMessage({ key, text: '第一次斬落，記住這個感覺。\n邏輯不會騙人，但它會藏起來。', sub: '—— 弈塵' });
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
    showFeedback('提示：開啟後可直接點擊空格填入選取中的數字', 'success');
  }, 1500);
}

/** Get tech note for bestiary display. */
export function getMentorNote(techKey: string, conquered: boolean): string | null {
  return getTechNote(techKey, conquered);
}
