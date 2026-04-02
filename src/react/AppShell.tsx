import type { ReactElement } from 'react';

import { TeachOverlay } from '../features/teach/components/TeachOverlay';
import { WinCelebration } from './win/WinCelebration';
import { GameOverOverlay } from './gameover/GameOverOverlay';
import { StatsModal } from './stats/StatsModal';
import { PreLevelModal } from './prelevel/PreLevelModal';
import { ReplayModal } from './replay/ReplayModal';
import { DuoResultModal } from './duoresult/DuoResultModal';
import { AchievementToast } from './toast/AchievementToast';
import { LibraryOverlay } from './library/LibraryOverlay';
import { MentorOverlay } from './mentor/MentorOverlay';
import { EncounterTransition } from './wild/EncounterTransition';
import { PracticeTree } from './practice/PracticeTree';
import { NormalStageMap } from './normal/NormalStageMap';
import { NormalLevelList } from './normal/NormalLevelList';

export function AppShell(): ReactElement {
  return (
    <>
      <TeachOverlay />
      <WinCelebration />
      <GameOverOverlay />
      <StatsModal />
      <PreLevelModal />
      <ReplayModal />
      <DuoResultModal />
      <AchievementToast />
      <LibraryOverlay />
      <MentorOverlay />
      <EncounterTransition />
      <PracticeTree />
      <NormalStageMap />
      <NormalLevelList />
    </>
  );
}
