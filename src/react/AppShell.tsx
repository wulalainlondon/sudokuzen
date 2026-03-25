import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useMemo, type ReactElement } from 'react';

import { TeachOverlay } from '../features/teach/components/TeachOverlay';

export function AppShell(): ReactElement {
  const queryClient = useMemo(() => new QueryClient(), []);

  return (
    <QueryClientProvider client={queryClient}>
      <TeachOverlay />
    </QueryClientProvider>
  );
}
