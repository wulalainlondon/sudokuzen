// Shared payload types for the pre-level modal flow.

export interface PreLevelOpenPayload {
  levelId: number;
  displayName: string;
  techName: string;
  techTier: string;
  bestRecord: string;
  hasRecord: boolean;
  hasReplay: boolean;
  isPractice: boolean;
  isSpeedrun: boolean;
}
