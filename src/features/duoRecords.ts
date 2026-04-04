// Duo win/loss records & streaks — extracted from duo.ts

import { SK, readJson, writeJson } from '../storage/keys';

export interface DuoRecords {
  wins: Record<string, number>;
  streak: number;
  streakHolder: string;
}

export function loadDuoRecords(): DuoRecords {
  return readJson<DuoRecords>(SK.DUO_RECORDS, { wins: {}, streak: 0, streakHolder: '' });
}

export function saveDuoRecords(data: DuoRecords): void {
  writeJson(SK.DUO_RECORDS, data);
}

export function recordDuoWin(winnerAlias: string, loserAlias: string): DuoRecords {
  const rec = loadDuoRecords();
  if (!rec.wins) rec.wins = {};
  rec.wins[winnerAlias] = (rec.wins[winnerAlias] || 0) + 1;
  if (!rec.wins[loserAlias]) rec.wins[loserAlias] = 0;
  // Update streak
  if (rec.streakHolder === winnerAlias) {
    rec.streak = (rec.streak || 0) + 1;
  } else {
    rec.streakHolder = winnerAlias;
    rec.streak = 1;
  }
  saveDuoRecords(rec);
  return rec;
}

export function recordDuoDraw(): DuoRecords {
  const rec = loadDuoRecords();
  rec.streak = 0;
  rec.streakHolder = '';
  saveDuoRecords(rec);
  return rec;
}
