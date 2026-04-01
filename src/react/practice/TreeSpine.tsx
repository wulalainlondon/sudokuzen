// TreeSpine — a container of TreeNodes arranged in a flowing grid.
// Supports both full-size and compact (branch) layouts.

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
