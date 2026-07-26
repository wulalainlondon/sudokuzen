// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearStoredDuoSession,
  readStoredDuoRole,
  readStoredDuoRoomId,
  storeDuoRole,
  storeDuoRoomId,
} from '../src/features/duo/duoSession';
import { SK } from '../src/storage/keys';

describe('duo session persistence', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('persists the room and role needed for WebSocket reclaim', () => {
    storeDuoRoomId('room-123');
    storeDuoRole('guest');

    expect(readStoredDuoRoomId()).toBe('room-123');
    expect(readStoredDuoRole()).toBe('guest');
  });

  it('rejects corrupt roles instead of attempting an invalid reclaim', () => {
    localStorage.setItem(SK.DUO_ACTIVE_ROLE, 'spectator');
    expect(readStoredDuoRole()).toBeNull();
  });

  it('clears room and role together', () => {
    storeDuoRoomId('room-123');
    storeDuoRole('host');

    clearStoredDuoSession();

    expect(readStoredDuoRoomId()).toBeNull();
    expect(readStoredDuoRole()).toBeNull();
  });
});
