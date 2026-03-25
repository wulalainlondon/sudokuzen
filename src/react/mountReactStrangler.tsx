import { createRoot, Root } from 'react-dom/client';

import { AppShell } from './AppShell';

let root: Root | null = null;

function ensureHost(): HTMLElement {
  let host = document.getElementById('react-strangler-root');
  if (host) return host;
  host = document.createElement('div');
  host.id = 'react-strangler-root';
  document.body.appendChild(host);
  return host;
}

export function mountReactStrangler(): void {
  if (root) return;
  const host = ensureHost();
  root = createRoot(host);
  root.render(<AppShell />);
}
