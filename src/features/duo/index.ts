// Duo module — re-exports for all duo subsystems

// Tiers & modes
export { DUO_TIERS, DUO_MODES, DUO_TIER_MAP, DUO_MODE_MAP, loadDuoTierPuzzles, pickDuoPuzzle } from './duoTiers';
export type { DuoTier, DuoMode, DuoTierId, DuoModeId } from './duoTiers';

// Profile
export {
  loadDuoProfile,
  saveDuoProfile,
  recordDuoMatch,
  getUnlockedTiers,
  getUnlockedModes,
  checkNewUnlocks,
} from './duoProfile';
export type { DuoProfile, NewUnlocks } from './duoProfile';

// Room
export {
  duoRoomRef,
  getActiveDuoRoomId,
  listWaitingDuoRooms,
  cleanupStaleDuoRooms,
  createDuoRoom,
  joinDuoRoom,
  subscribeDuoRoom,
  resumeDuoRoomIfAny,
  leaveDuoRoom,
} from './duoRoom';
export type { DuoRoomSummary } from './duoRoom';
export { getWsLobbyMirrorDebugState } from './duoLobbyMirror';

// Game
export {
  handleDuoSnapshot,
  updateDuoRoomUI,
  toggleDuoReady,
  startDuoCountdown,
  launchDuoGame,
  updateDuoProgress,
  submitDuoFinish,
  showDuoResult,
  surrenderDuo,
  closeDuoResult,
  requestDuoRematch,
  resetDuoState,
} from './duoGame';

// Lobby
export {
  openDuoLobby,
  closeDuoLobby,
  isDuoLobbyOpen,
  createDuoRoomFromLobby,
  joinDuoRoomFromLobby,
  refreshDuoLobbyRoom,
  setDuoLobbyConnectionState,
} from './duoLobby';

// Room View
export { openDuoRoomView, closeDuoRoomView, isDuoRoomViewOpen, leaveDuoRoomFromView } from './duoRoomView';

// Metrics
export { getDuoMetrics, resetDuoMetrics, bumpDuoMetric } from './duoMetrics';
export type { DuoMetricKey, DuoMetrics } from './duoMetrics';
