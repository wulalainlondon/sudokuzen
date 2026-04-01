import { SK, readJson } from '../storage/keys';
import { t } from '../i18n/t';

export interface TitleDef {
  id: string;
  achievementId: string; // '' for default (no achievement required)
  resonance?: string[];  // technique keys that get +10% EXP bonus
}

// 20 titles total (including 'none' for no title and 'default' for 修行者)
const TITLE_DEFS: TitleDef[] = [
  { id: 'none', achievementId: '' },
  { id: 'default', achievementId: '' },
  { id: 'beginner', achievementId: 'first_clear' },
  { id: 'hundred_forge', achievementId: 'clear_50' },
  { id: 'realm_lord', achievementId: 'clear_all' },
  { id: 'flawless', achievementId: 'perfect_one' },
  { id: 'rock_heart', achievementId: 'streak_5_clean' },
  { id: 's_appraiser', achievementId: 'grade_s' },
  { id: 'triple_crown', achievementId: 'streak_3_s' },
  { id: 'fish_hunter', achievementId: 'tech_fish', resonance: ['x_wing', 'swordfish', 'jellyfish', 'finned_x_wing', 'finned_swordfish', 'finned_jellyfish'] },
  { id: 'wind_rider', achievementId: 'tech_wing', resonance: ['xy_wing', 'xyz_wing', 'w_wing'] },
  { id: 'chain_master', achievementId: 'tech_chain', resonance: ['aic', 'aic_mid_chain', 'aic_long_chain', 'grouped_aic_nice_loop', 'discontinuous_nice_loop', 'xy_chain'] },
  { id: 'als_scholar', achievementId: 'tech_als', resonance: ['als_xz', 'als_xy', 'als_w_wing', 'als_chain'] },
  { id: 'eliminator', achievementId: 'elim_5000' },
  { id: 'gale', achievementId: 'speedrun_first' },
  { id: 'phantom', achievementId: 'ghost_win' },
  { id: 'enlightened', achievementId: 'practice_master_1' },
  { id: 'grandmaster', achievementId: 'practice_master_all' },
  { id: 'blind_sword', achievementId: 'mode_blind_first', resonance: [] },
  { id: 'iron_wall', achievementId: 'mode_ironman_first', resonance: [] },
  { id: 'versatile', achievementId: 'mode_all_one_tech' },
];

export { TITLE_DEFS };

/** Get the display name of a title from i18n */
export function getTitleName(titleId: string): string {
  if (titleId === 'none') return '';
  const val = t(`titles.${titleId}`);
  return val === `titles.${titleId}` ? titleId : val;
}

/** Get currently equipped title ID */
export function getEquippedTitle(): string {
  return localStorage.getItem(SK.PLAYER_TITLE) || 'default';
}

/** Set equipped title */
export function setEquippedTitle(titleId: string): void {
  localStorage.setItem(SK.PLAYER_TITLE, titleId);
}

/** Get display string for equipped title (with quotes or empty) */
export function getEquippedTitleDisplay(): string {
  const id = getEquippedTitle();
  if (id === 'none') return '';
  const name = getTitleName(id);
  return name ? `\u300C${name}\u300D` : '';
}

/** Get all titles the player has unlocked (based on achievements) */
export function getUnlockedTitles(): TitleDef[] {
  const achievements = readJson<Record<string, any>>(SK.ACHIEVEMENTS, {});
  return TITLE_DEFS.filter(td => {
    if (td.id === 'none' || td.id === 'default') return true; // always available
    return !!achievements[td.achievementId];
  });
}

/** Check if a title has resonance with a technique (for EXP bonus) */
export function getTitleResonanceBonus(titleId: string, technique: string): number {
  const def = TITLE_DEFS.find(td => td.id === titleId);
  if (!def || !def.resonance) return 0;
  if (def.resonance.includes(technique)) return 0.1; // +10% EXP
  return 0;
}
