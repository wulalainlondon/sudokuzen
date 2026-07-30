// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest';
import { renderDuoConnectionState } from '../src/features/duo/duoConnectionUi';

describe('Duo connection status UI', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="duo-conn-state"></div>
      <div id="duo-room-conn-state"></div>
      <div id="duo-game-connection" hidden></div>
    `;
  });

  it('keeps the board visible and presents a non-blocking reconnect message', () => {
    renderDuoConnectionState('reconnecting');

    const game = document.getElementById('duo-game-connection')!;
    expect(game.hidden).toBe(false);
    expect(game.classList.contains('reconnecting')).toBe(true);
    expect(game.textContent).toContain('重新連接');
    expect(document.getElementById('duo-room-conn-state')?.textContent).toContain('重新連接');
  });

  it('dismisses every connection notice after the authoritative socket reconnects', () => {
    renderDuoConnectionState('reconnecting');
    renderDuoConnectionState('connected');

    expect(document.getElementById('duo-game-connection')?.hidden).toBe(true);
    expect(document.getElementById('duo-conn-state')?.style.display).toBe('none');
    expect(document.getElementById('duo-room-conn-state')?.style.display).toBe('none');
  });

  it('uses a persistent failure treatment when reconnect attempts are exhausted', () => {
    renderDuoConnectionState('failed');

    const game = document.getElementById('duo-game-connection')!;
    expect(game.hidden).toBe(false);
    expect(game.classList.contains('failed')).toBe(true);
    expect(game.textContent).toContain('連線失敗');
  });
});
