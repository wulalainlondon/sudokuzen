import type { SudokuWindow } from './windowTypes';

type LegacyFacade = Partial<Pick<
  SudokuWindow,
  | 'showLevelScreen'
  | 'openReplayModal'
  | 'closeReplayModal'
  | 'closeDuoResult'
  | 'surrenderDuo'
  | 'closeLibraryOverlay'
  | 'dismissMentor'
  | 'resetGame'
  | 'continueWild'
  | 'exitWild'
  | 'showTeachModal'
  | 'startPoolRandom'
  | 'toggleDuoReady'
  | 'openDuoLobby'
  | 'closeDuoLobby'
  | 'createDuoRoomFromLobby'
  | 'joinDuoRoomFromLobby'
  | 'refreshDuoLobbyRoom'
  | 'leaveDuoRoom'
  | 'copyDuoRoomId'
>> & Record<string, unknown>;

export function bindLegacyFacade(facade: LegacyFacade): void {
  Object.assign(window as unknown as Record<string, unknown>, facade);
}
