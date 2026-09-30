/** Stable production realm. Changing the app version never changes this scope. */
import editions from '../../config/app-editions.json';
export type AppEdition = 'pwa' | 'ios' | 'legacy';

export const LEGACY_PROJECT_ID = editions.legacy.projectId;

const configured = import.meta.env.VITE_APP_EDITION;
export const TARGET_EDITION: AppEdition = configured === 'ios' ? 'ios' : configured === 'pwa' ? 'pwa' : 'legacy';

function initialEdition(): AppEdition {
  if (TARGET_EDITION === 'legacy' || typeof localStorage === 'undefined') return TARGET_EDITION;
  // Finish a pre-isolation room against its original server and identity. The
  // scope stays latched for this page lifetime; switch only after a home reload.
  try {
    const room = localStorage.getItem('sudoku_duo_active_room_id');
    const role = localStorage.getItem('sudoku_duo_active_role');
    const realm = localStorage.getItem('sudoku_duo_active_edition');
    return room && (role === 'host' || role === 'guest') && !realm ? 'legacy' : TARGET_EDITION;
  } catch {
    return TARGET_EDITION;
  }
}

export const ACTIVE_EDITION = initialEdition();

export function editionCollection(name: string, edition: AppEdition = ACTIVE_EDITION): string {
  return edition === 'legacy' ? name : `editions/${edition}/${name}`;
}

export function editionProject(edition: AppEdition = ACTIVE_EDITION): string {
  return editions[edition].projectId;
}

export function editionDuoHost(edition: AppEdition = ACTIVE_EDITION): string {
  return editions[edition].duoHost;
}

export function editionEnvelope(): { edition?: 'pwa' | 'ios'; protocolVersion?: 2 } {
  return ACTIVE_EDITION === 'legacy' ? {} : { edition: ACTIVE_EDITION, protocolVersion: 2 };
}

export function assertEditionProject(config: Record<string, string>): void {
  if (ACTIVE_EDITION !== 'legacy' && config.projectId !== editionProject()) {
    throw new Error(`Firebase project does not match ${ACTIVE_EDITION} edition`);
  }
}

let transitionTimer: ReturnType<typeof setInterval> | undefined;
export function mustTransitionEdition(): boolean {
  return (
    ACTIVE_EDITION === 'legacy' && TARGET_EDITION !== 'legacy' && !localStorage.getItem('sudoku_duo_active_room_id')
  );
}
export function scheduleEditionTransition(): void {
  if (ACTIVE_EDITION !== 'legacy' || TARGET_EDITION === 'legacy' || transitionTimer) return;
  transitionTimer = setInterval(() => {
    if (localStorage.getItem('sudoku_duo_active_room_id')) return;
    const home = document.getElementById('level-screen');
    const game = document.querySelector<HTMLElement>('.game-container');
    if (!home || getComputedStyle(home).display === 'none' || (game && getComputedStyle(game).display !== 'none'))
      return;
    clearInterval(transitionTimer);
    window.location.reload();
  }, 1000);
}
