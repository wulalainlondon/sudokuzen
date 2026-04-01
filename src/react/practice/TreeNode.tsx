// TreeNode — single technique node rendered as an "RPG skill icon button".
// Shows: bestiary name glyph in a square icon + technique name below + progress + badge

import type { ReactElement } from 'react';
import type { TechStatus } from './practiceTreeStore';
import { t } from '../../i18n/t';

interface TreeNodeProps {
  techKey: string;      // e.g. 'naked_single' — for looking up bestiary name
  name: string;         // localized display name (e.g. 'Naked Single')
  status: TechStatus;
  cleared: number;
  total: number;
  compact?: boolean;
  onClick: () => void;
}

export function TreeNode({ techKey, name, status, cleared, total, compact, onClick }: TreeNodeProps): ReactElement {
  const pct = total > 0 ? (cleared / total) * 100 : 0;
  const bestiary = t(`technique.${techKey}`);
  // If t() returns the key itself, it means no bestiary name — use first 2 chars of display name
  const glyph = bestiary.startsWith('technique.') ? name.slice(0, 2) : bestiary;
  // Shorten label: remove parenthesized English names like "摩天樓 (Skyscraper)" → "摩天樓"
  const shortName = name.replace(/\s*\(.*\)\s*$/, '');

  return (
    <div
      className={`tree-node tree-node--${status}${compact ? ' tree-node--compact' : ''}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter') onClick(); }}
    >
      <div className="tree-node-icon">
        <span className="tree-node-glyph">{glyph}</span>

        {/* Progress arc at bottom */}
        {(status === 'partial' || status === 'unlocked') && total > 0 && (
          <div className="tree-node-progress">
            <div className="tree-node-progress-fill" style={{ width: `${pct}%` }} />
          </div>
        )}

        {/* Corner badge */}
        {status === 'completed' && <span className="tree-node-badge tree-node-badge--done">✓</span>}
        {status === 'locked' && <span className="tree-node-badge tree-node-badge--lock">🔒</span>}
      </div>
      <div className="tree-node-label">{shortName}</div>
    </div>
  );
}
