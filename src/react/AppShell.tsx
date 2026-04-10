import { lazy, Suspense, type ReactElement } from 'react';

import { PracticeTree } from './practice/PracticeTree';
import { NormalStageMap } from './normal/NormalStageMap';
import { NormalLevelList } from './normal/NormalLevelList';
import { WildBestiaryGrid } from './wild/WildBestiaryGrid';
import {
  WildAutoCastRow,
  WildBestiaryControls,
  WildEnterButton,
  WildProfileCard,
  WildSessionCard,
} from './wild/WildLobbyPanels';
import { WildMentorNoteModal } from './wild/WildMentorNoteModal';
import { useTeachStore } from '../features/teach/state/teachStore';
import { useWinStore } from './win/winStore';
import { useGameOverStore } from './gameover/gameOverStore';
import { useStatsStore } from './stats/statsStore';
import { usePreLevelStore } from './prelevel/preLevelStore';
import { useReplayStore } from './replay/replayStore';
import { useDuoResultStore } from './duoresult/duoResultStore';
import { useAchievementToastStore } from './toast/achievementToastStore';
import { useLibraryStore } from './library/libraryStore';
import { useMentorStore } from './mentor/mentorStore';
import { useEncounterTransitionStore } from './wild/encounterTransitionStore';
import { useFirstKillRevelationStore } from './wild/firstKillRevelationStore';

const TeachOverlay = lazy(() =>
  import('../features/teach/components/TeachOverlay').then((m) => ({ default: m.TeachOverlay })),
);
const WinCelebration = lazy(() => import('./win/WinCelebration').then((m) => ({ default: m.WinCelebration })));
const GameOverOverlay = lazy(() => import('./gameover/GameOverOverlay').then((m) => ({ default: m.GameOverOverlay })));
const StatsModal = lazy(() => import('./stats/StatsModal').then((m) => ({ default: m.StatsModal })));
const PreLevelModal = lazy(() => import('./prelevel/PreLevelModal').then((m) => ({ default: m.PreLevelModal })));
const ReplayModal = lazy(() => import('./replay/ReplayModal').then((m) => ({ default: m.ReplayModal })));
const DuoResultModal = lazy(() => import('./duoresult/DuoResultModal').then((m) => ({ default: m.DuoResultModal })));
const AchievementToast = lazy(() => import('./toast/AchievementToast').then((m) => ({ default: m.AchievementToast })));
const LibraryOverlay = lazy(() => import('./library/LibraryOverlay').then((m) => ({ default: m.LibraryOverlay })));
const MentorOverlay = lazy(() => import('./mentor/MentorOverlay').then((m) => ({ default: m.MentorOverlay })));
const EncounterTransition = lazy(() =>
  import('./wild/EncounterTransition').then((m) => ({ default: m.EncounterTransition })),
);
const FirstKillRevelation = lazy(() =>
  import('./wild/FirstKillRevelation').then((m) => ({ default: m.FirstKillRevelation })),
);

export function AppShell(): ReactElement {
  const teachOpen = useTeachStore((s) => s.open);
  const winVisible = useWinStore((s) => s.visible);
  const gameOverVisible = useGameOverStore((s) => s.visible);
  const statsVisible = useStatsStore((s) => s.visible);
  const preLevelVisible = usePreLevelStore((s) => s.visible);
  const replayVisible = useReplayStore((s) => s.visible);
  const duoResultVisible = useDuoResultStore((s) => s.visible);
  const toastVisible = useAchievementToastStore((s) => s.visible);
  const libraryVisible = useLibraryStore((s) => s.visible);
  const mentorVisible = useMentorStore((s) => s.visible);
  const encounterActive = useEncounterTransitionStore((s) => s.active);
  const revelationActive = useFirstKillRevelationStore((s) => s.active);

  return (
    <>
      <Suspense fallback={null}>
        {teachOpen ? <TeachOverlay /> : null}
        {winVisible ? <WinCelebration /> : null}
        {gameOverVisible ? <GameOverOverlay /> : null}
        {statsVisible ? <StatsModal /> : null}
        {preLevelVisible ? <PreLevelModal /> : null}
        {replayVisible ? <ReplayModal /> : null}
        {duoResultVisible ? <DuoResultModal /> : null}
        {toastVisible ? <AchievementToast /> : null}
        {libraryVisible ? <LibraryOverlay /> : null}
        {mentorVisible ? <MentorOverlay /> : null}
        {encounterActive ? <EncounterTransition /> : null}
        {revelationActive ? <FirstKillRevelation /> : null}
      </Suspense>
      <PracticeTree />
      <NormalStageMap />
      <NormalLevelList />
      <WildProfileCard />
      <WildSessionCard />
      <WildAutoCastRow />
      <WildEnterButton />
      <WildBestiaryControls />
      <WildBestiaryGrid />
      <WildMentorNoteModal />
    </>
  );
}
