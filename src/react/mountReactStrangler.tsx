import { createRoot, Root } from 'react-dom/client';
import { Component, type ErrorInfo, type ReactNode } from 'react';

import { AppShell } from './AppShell';

let root: Root | null = null;

class ReactErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[React Strangler] render error:', error, info);
  }
  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}

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
  try {
    const host = ensureHost();
    root = createRoot(host);
    root.render(
      <ReactErrorBoundary>
        <AppShell />
      </ReactErrorBoundary>,
    );
    console.log('[React Strangler] mounted successfully');
  } catch (err) {
    console.error('[React Strangler] mount failed:', err);
  }
}
