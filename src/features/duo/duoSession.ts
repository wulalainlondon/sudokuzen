import { ACTIVE_EDITION, scheduleEditionTransition } from '../../platform/appEdition';
import { SK } from '../../storage/keys';
import type { Role } from './duoWsProtocol';

export function readStoredDuoRoomId(): string | null {
  try {
    const storedEdition = localStorage.getItem('sudoku_duo_active_edition');
    if (storedEdition && storedEdition !== ACTIVE_EDITION) return null;
    return localStorage.getItem(SK.DUO_ACTIVE_ROOM_ID);
  } catch {
    return null;
  }
}

export function readStoredDuoRole(): Role | null {
  try {
    const role = localStorage.getItem(SK.DUO_ACTIVE_ROLE);
    return role === 'host' || role === 'guest' ? role : null;
  } catch {
    return null;
  }
}

export function storeDuoRoomId(roomId: string): void {
  if (ACTIVE_EDITION !== 'legacy') localStorage.setItem('sudoku_duo_active_edition', ACTIVE_EDITION);
  localStorage.setItem(SK.DUO_ACTIVE_ROOM_ID, roomId);
}

export function storeDuoRole(role: Role): void {
  localStorage.setItem(SK.DUO_ACTIVE_ROLE, role);
}

export function clearStoredDuoSession(): void {
  localStorage.removeItem(SK.DUO_ACTIVE_ROOM_ID);
  localStorage.removeItem(SK.DUO_ACTIVE_ROLE);
  localStorage.removeItem('sudoku_duo_active_edition');
  scheduleEditionTransition();
}
