import { SK } from '../storage/keys';

export function hasActiveDuoSeat(storage: Pick<Storage, 'getItem'> = localStorage): boolean {
  try {
    const roomId = storage.getItem(SK.DUO_ACTIVE_ROOM_ID);
    const role = storage.getItem(SK.DUO_ACTIVE_ROLE);
    return !!roomId && (role === 'host' || role === 'guest');
  } catch {
    return false;
  }
}

export function isGameActivelyPlaying(doc: Pick<Document, 'querySelector' | 'getElementById'> = document): boolean {
  const gameContainer = doc.querySelector('.game-container') as HTMLElement | null;
  if (!gameContainer || gameContainer.style.display !== 'flex') return false;

  const pauseScreen = doc.getElementById('pause-screen') as HTMLElement | null;
  if (pauseScreen?.style.display === 'flex') return false;

  const gameOverOverlay = doc.getElementById('overlay') as HTMLElement | null;
  if (gameOverOverlay?.style.display === 'flex') return false;

  const winCelebration = doc.getElementById('win-celebration') as HTMLElement | null;
  if (winCelebration?.style.display === 'flex') return false;

  return true;
}

export function isPwaUpdateBlocked(): boolean {
  return hasActiveDuoSeat() || isGameActivelyPlaying();
}
