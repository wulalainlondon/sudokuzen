// TreeNode — single technique node rendered as a "stone marker" on the path.
// Shows: status dot + technique name + mini progress bar + count

import type { ReactElement } from 'react';
import type { TechStatus } from './practiceTreeStore';

interface TreeNodeProps {
  name: string;
  status: TechStatus;
  cleared: number;
  total: number;
  compact?: boolean;
  onClick: () => void;
}

const DOT_CLASS: Record<TechStatus, string> = {
  locked: 'tree-dot tree-dot--locked',
  unlocked: 'tree-dot tree-dot--unlocked',
  partial: 'tree-dot tree-dot--partial',
  completed: 'tree-dot tree-dot--completed',
};

export function TreeNode({ name, status, cleared, total, compact, onClick }: TreeNodeProps): ReactElement {
  const pct = total > 0 ? (cleared / total) * 100 : 0;

  return (
    <div
      className={`tree-node tree-node--${status}${compact ? ' tree-node--compact' : ''}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter') onClick(); }}
    >
      <div className={DOT_CLASS[status]} />
      <div className="tree-node-body">
        <div className="tree-node-name">
          {status === 'locked' ? `🔒 ${name}` : name}
        </div>
        <div className="tree-node-bar">
          <div className="tree-node-bar-fill" style={{ width: `${pct}%` }} />
        </div>
      </div>
      <div className="tree-node-count">{cleared}/{total}</div>
    </div>
  );
}
