// 弈塵 (Yi-Chen) — mentor dialogue system.
// A melancholic, elegant swordsman who fell at Tier 4's logic abyss.
// His notes are scattered across the world like fragments of a broken journal.
//
// All dialogue strings are sourced from the i18n system (mentor.* keys).
// Constants are built lazily so t() reads the active locale at call time.

import { t } from '../../i18n/t';

// ── Milestone dialogues (triggered once at key moments) ─────────────

export interface MentorLine {
  key: string; // unique trigger key
  text: string; // main dialogue
  sub?: string; // optional subtitle/attribution
}

// Helper: build a MentorLine whose text/sub are resolved from i18n at access time.
function line(key: string, textKey: string, subKey?: string): MentorLine {
  return {
    key,
    get text() { return t(textKey); },
    get sub() { return subKey ? t(subKey) : undefined; },
  };
}

export const MENTOR_INTRO: MentorLine[] = [
  line('intro_1', 'mentor.intro.intro_1'),
  line('intro_2', 'mentor.intro.intro_2'),
];

export const MENTOR_POST_DEMO: MentorLine[] = [
  line('post_demo_1', 'mentor.postDemo.post_demo_1', 'mentor.postDemo.post_demo_1_sub'),
  line('post_demo_2', 'mentor.postDemo.post_demo_2', 'mentor.postDemo.post_demo_2_sub'),
];

export const MENTOR_MILESTONES: MentorLine[] = [
  // First kill
  line('first_kill', 'mentor.milestones.first_kill', 'mentor.milestones.first_kill_sub'),
  // Reach Lv.11 (Tier 1 mastered)
  line('tier1_mastered', 'mentor.milestones.tier1_mastered', 'mentor.milestones.tier1_mastered_sub'),
  // Reach Lv.21 (Tier 2 unlocks)
  line('tier2_unlocked', 'mentor.milestones.tier2_unlocked', 'mentor.milestones.tier2_unlocked_sub'),
  // Reach Lv.41 (Tier 3 unlocks)
  line('tier3_unlocked', 'mentor.milestones.tier3_unlocked', 'mentor.milestones.tier3_unlocked_sub'),
  // Reach Lv.61 (Deep chains)
  line('tier3_deep', 'mentor.milestones.tier3_deep', 'mentor.milestones.tier3_deep_sub'),
  // Reach Lv.71 (Tier 4 — where mentor fell)
  line('tier4_threshold', 'mentor.milestones.tier4_threshold', 'mentor.milestones.tier4_threshold_sub'),
];

// ── Per-technique notes (shown in bestiary after first encounter) ────

// Before conquest: vague, poetic hints (no technique name revealed)
// After conquest: full note with technique name

interface TechNote {
  /** Shown when the technique is encountered but not yet conquered. */
  veiled: string;
  /** Shown after first successful kill. */
  unveiled: string;
}

// All technique keys that have mentor notes
const TECH_KEYS = [
  'naked_single', 'hidden_single',
  'locked_candidates', 'naked_pair', 'hidden_pair', 'naked_triple', 'hidden_triple',
  'unique_rectangle', 'skyscraper', 'two_string_kite', 'empty_rectangle',
  'x_wing', 'finned_x_wing', 'xy_wing', 'xyz_wing', 'w_wing', 'remote_pairs', 'bug_plus_one',
  'x_cycle_simple_coloring', 'swordfish', 'finned_swordfish', 'jellyfish', 'finned_jellyfish',
  'aic', 'aic_mid_chain', 'aic_long_chain', 'grouped_aic_nice_loop', 'discontinuous_nice_loop', 'xy_chain',
  'als_xz', 'als_xy', 'als_w_wing', 'als_chain',
  'forcing_chain_net', 'cell_forcing_chain', 'region_forcing_chain',
  'sue_de_coq', 'template', 'death_blossom', 'exocet_death_blossom',
] as const;

function buildTechNotes(): Record<string, TechNote> {
  const notes: Record<string, TechNote> = {};
  for (const key of TECH_KEYS) {
    notes[key] = {
      get veiled() { return t(`mentor.techniques.${key}.veiled`); },
      get unveiled() { return t(`mentor.techniques.${key}.unveiled`); },
    };
  }
  return notes;
}

export const MENTOR_TECH_NOTES: Record<string, TechNote> = buildTechNotes();

// ── Final message (after defeating exocet / collecting all) ─────────

export const MENTOR_FINALE: MentorLine = line(
  'finale',
  'mentor.finale.text',
  'mentor.finale.sub',
);

// ── Helper: get milestone for a level-up ────────────────────────────

export function getMilestoneForLevel(newLevel: number): MentorLine | null {
  if (newLevel === 11) return MENTOR_MILESTONES.find((m) => m.key === 'tier1_mastered') ?? null;
  if (newLevel === 21) return MENTOR_MILESTONES.find((m) => m.key === 'tier2_unlocked') ?? null;
  if (newLevel === 41) return MENTOR_MILESTONES.find((m) => m.key === 'tier3_unlocked') ?? null;
  if (newLevel === 61) return MENTOR_MILESTONES.find((m) => m.key === 'tier3_deep') ?? null;
  if (newLevel === 71) return MENTOR_MILESTONES.find((m) => m.key === 'tier4_threshold') ?? null;
  return null;
}

/** Get the tech note for a technique, based on whether it's been conquered. */
export function getTechNote(techKey: string, conquered: boolean): string | null {
  const note = MENTOR_TECH_NOTES[techKey];
  if (!note) return null;
  return conquered ? note.unveiled : note.veiled;
}
