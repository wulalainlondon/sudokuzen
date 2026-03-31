import type { ReactElement } from 'react';

import { TeachOverlay } from '../features/teach/components/TeachOverlay';
import { WinCelebration } from './win/WinCelebration';
import { GameOverOverlay } from './gameover/GameOverOverlay';
import { StatsModal } from './stats/StatsModal';
import { PreLevelModal } from './prelevel/PreLevelModal';

export function AppShell(): ReactElement {
  return (
    <>
      <TeachOverlay />
      <WinCelebration />
      <GameOverOverlay />
      <StatsModal />
      <PreLevelModal />
    </>
  );
}
