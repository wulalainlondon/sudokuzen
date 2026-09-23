import type { WildProfile, BestiaryEntry } from '../../features/wild/wildState';

export const DEFAULT_WILD_PROFILE: WildProfile = {
  iqLevel: 1,
  totalExp: 0,
  gateOverflowExp: 0,
  puzzlesCompleted: 0,
  totalEncounters: 0,
  cooldowns: {},
  bestiary: {},
  battlefieldMode: 'knight',
  autoCastEnabled: true,
  currentSession: null,
  fragments: {},
  studiedSkills: [],
  tutorialCompleted: false,
  tutorialRound: 0,
};

function count(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0;
}

// Progress only moves forward. Merge before every write so a profile captured
// before cloud hydration (or another World screen edit) cannot erase records.
// Settings and the active session come from the more advanced snapshot; they
// can reset intentionally, so a field-by-field maximum would be incorrect.
export function mergeWildProfiles(existing: Partial<WildProfile>, incoming: Partial<WildProfile>): WildProfile {
  const current = { ...DEFAULT_WILD_PROFILE, ...existing };
  const next = { ...current, ...incoming };
  const bestiary: Record<string, BestiaryEntry> = { ...current.bestiary };
  for (const [key, entry] of Object.entries(next.bestiary ?? {})) {
    const previous = bestiary[key];
    if (!previous) {
      bestiary[key] = entry;
      continue;
    }
    const times = [previous.bestTime, entry.bestTime].filter((time): time is number => typeof time === 'number');
    bestiary[key] = {
      discovered: [previous.discovered, entry.discovered].filter(Boolean).sort()[0] ?? '',
      encounters: Math.max(count(previous.encounters), count(entry.encounters)),
      kills: Math.max(count(previous.kills), count(entry.kills)),
      escapes: Math.max(count(previous.escapes), count(entry.escapes)),
      bestTime: times.length ? Math.min(...times) : null,
      modesCleared: [...new Set([...(previous.modesCleared ?? []), ...(entry.modesCleared ?? [])])],
    };
  }
  const fragments = { ...current.fragments };
  for (const [key, value] of Object.entries(next.fragments ?? {})) {
    fragments[key] = Math.max(count(fragments[key]), count(value));
  }
  const moreAdvanced = count(next.totalExp) >= count(current.totalExp) ? next : current;
  const incomingIsCurrent =
    count(incoming.totalExp) >= count(existing.totalExp) &&
    count(incoming.puzzlesCompleted) >= count(existing.puzzlesCompleted) &&
    count(incoming.totalEncounters) >= count(existing.totalEncounters);
  const mutable = incomingIsCurrent ? next : current;
  return {
    ...current,
    ...next,
    battlefieldMode: mutable.battlefieldMode,
    autoCastEnabled: mutable.autoCastEnabled,
    currentSession: mutable.currentSession,
    cooldowns: mutable.cooldowns,
    iqLevel: Math.max(count(current.iqLevel), count(next.iqLevel)),
    totalExp: Math.max(count(current.totalExp), count(next.totalExp)),
    gateOverflowExp: count(moreAdvanced.gateOverflowExp),
    puzzlesCompleted: Math.max(count(current.puzzlesCompleted), count(next.puzzlesCompleted)),
    totalEncounters: Math.max(count(current.totalEncounters), count(next.totalEncounters)),
    bestiary,
    fragments,
    studiedSkills: [...new Set([...(current.studiedSkills ?? []), ...(next.studiedSkills ?? [])])],
    tutorialCompleted: !!(current.tutorialCompleted || next.tutorialCompleted),
    tutorialRound: Math.max(count(current.tutorialRound), count(next.tutorialRound)),
  };
}
