import { SK } from '../../storage/keys';
import type { Role } from './duoWsProtocol';

export function readStoredDuoRoomId(): string | null {
  try {
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
  localStorage.setItem(SK.DUO_ACTIVE_ROOM_ID, roomId);
}

export function storeDuoRole(role: Role): void {
  localStorage.setItem(SK.DUO_ACTIVE_ROLE, role);
}

export function clearStoredDuoSession(): void {
  localStorage.removeItem(SK.DUO_ACTIVE_ROOM_ID);
  localStorage.removeItem(SK.DUO_ACTIVE_ROLE);
}
