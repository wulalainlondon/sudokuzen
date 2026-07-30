// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest';
import { hasActiveDuoSeat, isGameActivelyPlaying, isPwaUpdateBlocked } from '../src/pwa/updateSafety';

describe('PWA update safety', () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '';
  });

  it('holds an update throughout a Duo room, including result and rematch preparation', () => {
    localStorage.setItem('sudoku_duo_active_room_id', 'room-1');
    localStorage.setItem('sudoku_duo_active_role', 'host');
    document.body.innerHTML = '<div class="game-container" style="display:none"></div>';

    expect(hasActiveDuoSeat()).toBe(true);
    expect(isPwaUpdateBlocked()).toBe(true);
  });

  it('does not treat an incomplete or cleared Duo seat as active', () => {
    localStorage.setItem('sudoku_duo_active_room_id', 'room-1');
    expect(hasActiveDuoSeat()).toBe(false);

    localStorage.setItem('sudoku_duo_active_role', 'spectator');
    expect(hasActiveDuoSeat()).toBe(false);
  });

  it('continues protecting an ordinary game and releases on pause', () => {
    document.body.innerHTML = `
      <div class="game-container" style="display:flex"></div>
      <div id="pause-screen" style="display:none"></div>
    `;
    expect(isGameActivelyPlaying()).toBe(true);

    document.getElementById('pause-screen')!.style.display = 'flex';
    expect(isGameActivelyPlaying()).toBe(false);
    expect(isPwaUpdateBlocked()).toBe(false);
  });
});
