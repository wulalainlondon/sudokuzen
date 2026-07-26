// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest';
import { bindPlayerIdentityToAuth } from '../src/firebase/client';
import { SK } from '../src/storage/keys';

describe('Firebase player identity migration', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('does not mark a brand-new install as a legacy PWA player', () => {
    expect(bindPlayerIdentityToAuth('new_uid_123')).toBe('p_new_uid_123');
    expect(localStorage.getItem(SK.PLAYER_ID)).toBe('p_new_uid_123');
    expect(localStorage.getItem(SK.LEGACY_PLAYER_ID)).toBeNull();
  });

  it('preserves the previous PWA identity while binding to the auth UID', () => {
    localStorage.setItem(SK.PLAYER_ID, 'p_old_timestamp_random');

    expect(bindPlayerIdentityToAuth('owner_uid_456')).toBe('p_owner_uid_456');
    expect(localStorage.getItem(SK.PLAYER_ID)).toBe('p_owner_uid_456');
    expect(localStorage.getItem(SK.LEGACY_PLAYER_ID)).toBe('p_old_timestamp_random');
  });

  it('is idempotent after the identity has already been bound', () => {
    localStorage.setItem(SK.PLAYER_ID, 'p_owner_uid_456');
    localStorage.setItem(SK.LEGACY_PLAYER_ID, 'p_old_timestamp_random');

    bindPlayerIdentityToAuth('owner_uid_456');

    expect(localStorage.getItem(SK.PLAYER_ID)).toBe('p_owner_uid_456');
    expect(localStorage.getItem(SK.LEGACY_PLAYER_ID)).toBe('p_old_timestamp_random');
  });
});
