import { t } from '../i18n/t';
import { SK, readJson } from '../storage/keys';
import { getAllLevels } from '../data/dataRegistry';
import { toClassicLevelRecord } from '../shared/records/levelRecords';
import { isNativeApp } from '../platform/nativeApp';

export type JourneyMode = 'practice' | 'world' | 'duo';

export const JOURNEY_GATES = {
  practiceNormalClears: 3,
  worldVerifiedTechniques: 1,
  duoVerifiedTechniques: 3,
} as const;

interface JourneyProgress {
  normalClears: number;
  practiceClears: number;
  teachReadCount: number;
  verifiedLevel: number;
  verifiedTechniques: string[];
  worldLevel: number;
  worldEncounters: number;
  duoPlays: number;
}

export interface JourneyState extends JourneyProgress {
  practiceUnlocked: boolean;
  worldUnlocked: boolean;
  duoUnlocked: boolean;
  currentChapter: 'prologue' | 'practice' | 'world' | 'duo';
}

function countTruthyRecords(value: Record<string, unknown>): number {
  return Object.values(value).filter(Boolean).length;
}

function isE2EMode(): boolean {
  return localStorage.getItem('sudoku_e2e_mode') === '1';
}

function isInstalledPwa(): boolean {
  if (isNativeApp()) return false;
  const iosNavigator = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia?.('(display-mode: standalone)').matches === true || iosNavigator.standalone === true;
}

const TEACH_MODULE_TECHNIQUES: ReadonlyArray<readonly [string, string]> = [
  ['1', 'naked_single'],
  ['2', 'hidden_single'],
  ['3', 'locked_candidates'],
  ['4', 'naked_pair'],
  ['5', 'hidden_pair'],
  ['6', 'naked_triple'],
  ['7', 'hidden_triple'],
  ['8', 'x_wing'],
  ['9', 'finned_x_wing'],
  ['10', 'skyscraper'],
  ['11', 'xy_wing'],
  ['12', 'xyz_wing'],
  ['13', 'w_wing'],
  ['14', 'unique_rectangle'],
  ['15', 'x_cycle_simple_coloring'],
  ['16', 'swordfish'],
  ['17', 'finned_swordfish'],
  ['18', 'aic'],
  ['19', 'aic_mid_chain'],
  ['20', 'grouped_aic_nice_loop'],
  ['21', 'aic_long_chain'],
  ['22', 'als_xz'],
  ['23', 'als_chain'],
  ['24', 'forcing_chain_net'],
  ['25', 'exocet_death_blossom'],
  ['26', 'remote_pairs'],
  ['27', 'two_string_kite'],
  ['28', 'empty_rectangle'],
  ['29', 'bug_plus_one'],
  ['30', 'jellyfish'],
  ['31', 'finned_jellyfish'],
  ['32', 'xy_chain'],
  ['33', 'discontinuous_nice_loop'],
  ['34', 'cell_forcing_chain'],
  ['35', 'region_forcing_chain'],
  ['36', 'template'],
  ['37', 'als_xy'],
  ['38', 'als_w_wing'],
  ['39', 'sue_de_coq'],
  ['40', 'death_blossom'],
];

export function getJourneyState(): JourneyState {
  const normalRecords = readJson<Record<string, unknown>>(SK.RECORDS, {});
  const practiceRecords = readJson<Record<string, unknown>>(SK.PRACTICE_RECORDS, {});
  const teachRead = readJson<Record<string, boolean>>(SK.TEACH_READ, {});
  const normalClears = countTruthyRecords(normalRecords);
  const practiceClears = countTruthyRecords(practiceRecords);
  const teachReadCount = countTruthyRecords(teachRead);
  const worldProfile = readJson<Record<string, unknown>>(SK.WILD_PROFILE, {});
  const worldLevel = Math.max(1, Number(worldProfile.iqLevel) || 1);
  const worldEncounters = Math.max(0, Number(worldProfile.totalEncounters) || 0);
  const duoProfile = readJson<{ playCount?: Record<string, number> }>(SK.DUO_PROFILE, {});
  const profileDuoPlays = Object.values(duoProfile.playCount || {}).reduce(
    (sum, count) => sum + Math.max(0, Number(count) || 0),
    0,
  );
  // v1 recorded completed matches in a separate map. Count it for access
  // grandfathering so returning players never lose a chapter after upgrading.
  const legacyDuoRecords = readJson<Record<string, unknown>>(SK.DUO_RECORDS, {});
  const duoPlays = profileDuoPlays + countTruthyRecords(legacyDuoRecords);
  // Before the journey rollout every mode was directly accessible. The auth
  // migration records the previous PWA identity in LEGACY_PLAYER_ID, giving us
  // a durable, device-local upgrade marker without weakening Firestore rules.
  const legacyPwaPlayer = Boolean(localStorage.getItem(SK.LEGACY_PLAYER_ID));
  // Installed web PWAs used the pre-journey rules where every mode was directly
  // accessible. Detect the runtime itself as a fallback because browser storage
  // cleanup or the UID migration can remove the older local identity marker.
  const installedPwa = isInstalledPwa();
  const e2e = isE2EMode();

  const studiedTechniques = new Set(
    TEACH_MODULE_TECHNIQUES.filter(([moduleId]) => teachRead[moduleId]).map(([, technique]) => technique),
  );
  const practiceClearCounts = new Map<string, number>();
  for (const record of Object.values(practiceRecords)) {
    const parsed = toClassicLevelRecord(record);
    if (!parsed?.techKey) continue;
    practiceClearCounts.set(parsed.techKey, (practiceClearCounts.get(parsed.techKey) || 0) + 1);
  }
  const fieldProof = new Set(readJson<string[]>(SK.TECHNIQUES_USED, []));
  for (const level of getAllLevels()) {
    if (normalRecords[level.id] && level.maxTechnique) fieldProof.add(level.maxTechnique);
  }
  const bestiary = (worldProfile.bestiary || {}) as Record<string, { kills?: number }>;
  for (const [technique, entry] of Object.entries(bestiary)) {
    if ((Number(entry?.kills) || 0) > 0) fieldProof.add(technique);
  }
  const verifiedTechniques = [...studiedTechniques].filter(
    (technique) => (practiceClearCounts.get(technique) || 0) >= 3 && fieldProof.has(technique),
  );
  const verifiedLevel = verifiedTechniques.length;

  // Existing progress in a later mode is always grandfathered. This prevents
  // the chapter rollout from taking access away from returning players.
  const practiceUnlocked =
    e2e ||
    installedPwa ||
    legacyPwaPlayer ||
    normalClears >= JOURNEY_GATES.practiceNormalClears ||
    practiceClears > 0 ||
    worldEncounters > 0 ||
    duoPlays > 0;
  const worldUnlocked =
    e2e ||
    installedPwa ||
    legacyPwaPlayer ||
    verifiedLevel >= JOURNEY_GATES.worldVerifiedTechniques ||
    worldEncounters > 0 ||
    worldLevel > 1 ||
    duoPlays > 0;
  const duoUnlocked =
    e2e || installedPwa || legacyPwaPlayer || verifiedLevel >= JOURNEY_GATES.duoVerifiedTechniques || duoPlays > 0;
  const currentChapter = duoUnlocked ? 'duo' : worldUnlocked ? 'world' : practiceUnlocked ? 'practice' : 'prologue';

  return {
    normalClears,
    practiceClears,
    teachReadCount,
    verifiedLevel,
    verifiedTechniques,
    worldLevel,
    worldEncounters,
    duoPlays,
    practiceUnlocked,
    worldUnlocked,
    duoUnlocked,
    currentChapter,
  };
}

export function canOpenJourneyMode(mode: JourneyMode, state = getJourneyState()): boolean {
  if (mode === 'practice') return state.practiceUnlocked;
  if (mode === 'world') return state.worldUnlocked;
  return state.duoUnlocked;
}

export function getJourneyLockMessage(mode: JourneyMode, state = getJourneyState()): string {
  if (canOpenJourneyMode(mode, state)) return '';
  if (mode === 'practice') {
    return t('journey.practiceLock', {
      cleared: state.normalClears,
      needed: JOURNEY_GATES.practiceNormalClears,
    });
  }
  if (mode === 'world') {
    return t('journey.worldLock', {
      level: state.verifiedLevel,
      needed: JOURNEY_GATES.worldVerifiedTechniques,
    });
  }
  return t('journey.duoLock', {
    level: state.verifiedLevel,
    needed: JOURNEY_GATES.duoVerifiedTechniques,
  });
}

function setEntryState(button: HTMLElement | null, unlocked: boolean, unlockedSub: string, lockedSub: string): void {
  if (!button) return;
  button.classList.toggle('journey-locked', !unlocked);
  button.removeAttribute('aria-disabled');
  if (unlocked) button.removeAttribute('aria-description');
  else button.setAttribute('aria-description', lockedSub);
  button.title = unlocked ? unlockedSub : lockedSub;
  const sub = button.querySelector<HTMLElement>('[data-journey-sub]');
  if (sub) sub.textContent = unlocked ? unlockedSub : `🔒 ${lockedSub}`;
}

export function syncJourneyHome(): void {
  const state = getJourneyState();
  const guideTitle = document.getElementById('journey-current-title');
  const guideProgress = document.getElementById('journey-current-progress');
  if (guideTitle) guideTitle.textContent = t(`journey.chapter.${state.currentChapter}`);
  if (guideProgress) {
    if (state.currentChapter === 'prologue') {
      guideProgress.textContent = t('journey.prologueProgress', {
        cleared: Math.min(state.normalClears, JOURNEY_GATES.practiceNormalClears),
        needed: JOURNEY_GATES.practiceNormalClears,
      });
    } else if (state.currentChapter === 'practice') {
      guideProgress.textContent = t('journey.practiceProgress', {
        level: state.verifiedLevel,
        needed: JOURNEY_GATES.worldVerifiedTechniques,
      });
    } else if (state.currentChapter === 'world') {
      guideProgress.textContent = t('journey.worldProgress', {
        level: state.verifiedLevel,
        needed: JOURNEY_GATES.duoVerifiedTechniques,
      });
    } else {
      guideProgress.textContent = t('journey.duoProgress');
    }
  }

  setEntryState(
    document.getElementById('practice-entry-btn'),
    state.practiceUnlocked,
    t('practice.entrySub'),
    getJourneyLockMessage('practice', state),
  );
  setEntryState(
    document.getElementById('world-entry-btn'),
    state.worldUnlocked,
    t('wild.entrySub'),
    getJourneyLockMessage('world', state),
  );
  setEntryState(
    document.getElementById('duo-journey-entry-btn'),
    state.duoUnlocked,
    t('journey.duoEntrySub'),
    getJourneyLockMessage('duo', state),
  );

  const duoShortcut = document.getElementById('duo-entry-btn');
  if (duoShortcut) {
    duoShortcut.classList.toggle('journey-locked', !state.duoUnlocked);
    const lockMessage = getJourneyLockMessage('duo', state);
    duoShortcut.removeAttribute('aria-disabled');
    if (state.duoUnlocked) duoShortcut.removeAttribute('aria-description');
    else duoShortcut.setAttribute('aria-description', lockMessage);
    duoShortcut.title = state.duoUnlocked ? t('journey.duoEntrySub') : lockMessage;
  }
}
