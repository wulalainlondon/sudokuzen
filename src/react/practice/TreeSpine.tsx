// TreeSpine — a vertical chain of TreeNodes connected by lines.
// Each node has a connecting line above it (except the first).

import { type ReactElement, type ReactNode } from 'react';

interface TreeSpineProps {
  label?: string;
  children: ReactNode;
}

export function TreeSpine({ label, children }: TreeSpineProps): ReactElement {
  return (
    <div className="tree-spine">
      {label && <div className="tree-spine-label">{label}</div>}
      <div className="tree-spine-nodes">
        {children}
      </div>
    </div>
  );
}
