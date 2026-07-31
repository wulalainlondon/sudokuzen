export const DUO_FORFEIT_TIME = 9999;
export const DUO_CLOSE_GAP_SECONDS = 8;
export const DUO_CLOSE_GAP_RATIO = 0.05;
export const DUO_DOMINANT_GAP_SECONDS = 30;
export const DUO_DOMINANT_GAP_RATIO = 0.2;

export type DuoOutcomeTier =
  | 'dominant-win'
  | 'close-win'
  | 'win'
  | 'draw'
  | 'close-loss'
  | 'loss'
  | 'dominant-loss'
  | 'forfeit-win'
  | 'forfeit-loss'
  | 'abandoned';

export interface DuoOutcome {
  tier: DuoOutcomeTier;
  diffSec: number;
  gapRatio: number;
  iWon: boolean;
  isDraw: boolean;
  isForfeit: boolean;
}

/**
 * Classifies a finished Duo round from the local player's perspective.
 *
 * Close games accept either a small absolute gap or a small relative gap so
 * longer rounds are not called decisive. Dominant results require both a
 * meaningful number of seconds and a meaningful percentage.
 */
export function classifyDuoOutcome(myTime: number, opponentTime: number): DuoOutcome {
  const myForfeit = myTime === DUO_FORFEIT_TIME;
  const opponentForfeit = opponentTime === DUO_FORFEIT_TIME;

  if (myForfeit || opponentForfeit) {
    const bothForfeited = myForfeit && opponentForfeit;
    return {
      tier: bothForfeited ? 'abandoned' : myForfeit ? 'forfeit-loss' : 'forfeit-win',
      diffSec: 0,
      gapRatio: 0,
      iWon: !myForfeit && opponentForfeit,
      isDraw: false,
      isForfeit: true,
    };
  }

  const safeMyTime = Math.max(0, myTime);
  const safeOpponentTime = Math.max(0, opponentTime);
  const diffSec = Math.abs(safeMyTime - safeOpponentTime);

  if (diffSec === 0) {
    return {
      tier: 'draw',
      diffSec,
      gapRatio: 0,
      iWon: false,
      isDraw: true,
      isForfeit: false,
    };
  }

  const slowerTime = Math.max(safeMyTime, safeOpponentTime, 1);
  const gapRatio = diffSec / slowerTime;
  const iWon = safeMyTime < safeOpponentTime;
  const isClose = diffSec <= DUO_CLOSE_GAP_SECONDS || gapRatio <= DUO_CLOSE_GAP_RATIO;
  const isDominant = diffSec >= DUO_DOMINANT_GAP_SECONDS && gapRatio >= DUO_DOMINANT_GAP_RATIO;

  return {
    tier: isClose
      ? iWon
        ? 'close-win'
        : 'close-loss'
      : isDominant
        ? iWon
          ? 'dominant-win'
          : 'dominant-loss'
        : iWon
          ? 'win'
          : 'loss',
    diffSec,
    gapRatio,
    iWon,
    isDraw: false,
    isForfeit: false,
  };
}
