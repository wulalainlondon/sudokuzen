import type { ReactElement } from 'react';

import { TeachOverlay } from '../features/teach/components/TeachOverlay';
import { WinCelebration } from './win/WinCelebration';

export function AppShell(): ReactElement {
  return (
    <>
      <TeachOverlay />
      <WinCelebration />
    </>
  );
}
