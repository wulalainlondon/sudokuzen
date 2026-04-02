// TreeNode — single technique node rendered as an "RPG skill icon button".
// Shows: bestiary name glyph in a square icon + technique name below + progress + badge

import { type CSSProperties, type ReactElement } from 'react';
import type { TechStatus } from './practiceTreeStore';
import { t } from '../../i18n/t';
import { TREE, UNLOCK_THRESHOLD } from '../../features/practice/practiceLobby';

interface TreeNodeProps {
  techKey: string;      // e.g. 'naked_single' — for looking up bestiary name
  name: string;         // localized display name (e.g. 'Naked Single')
  status: TechStatus;
  cleared: number;
  total: number;
  compact?: boolean;
  showUnlockHint?: boolean;
  className?: string;
  style?: CSSProperties;
  onClick: () => void;
}

export interface TreeNodeDisplayModel {
  statusChip: string;
  primaryText: string;
  secondaryText: string;
  progressPct: number;
  unlockHintText?: string;
  iconKind: ZenIconKind;
}

export type ZenIconKind = 'mountain' | 'water' | 'wind' | 'seal' | 'lotus' | 'lock';

const FISH_SET = new Set([
  'x_wing',
  'finned_x_wing',
  'swordfish',
  'finned_swordfish',
  'jellyfish',
  'finned_jellyfish',
  'skyscraper',
  'two_string_kite',
  'empty_rectangle',
]);

const CHAIN_SET = new Set([
  'x_cycle_simple_coloring',
  'xy_wing',
  'xyz_wing',
  'w_wing',
  'remote_pairs',
  'xy_chain',
  'aic',
  'aic_mid_chain',
  'aic_long_chain',
  'grouped_aic_nice_loop',
  'discontinuous_nice_loop',
  'forcing_chain_net',
  'cell_forcing_chain',
  'region_forcing_chain',
]);

const SEAL_SET = new Set([
  'unique_rectangle',
  'bug_plus_one',
  'als_xz',
  'als_xy',
  'als_w_wing',
  'als_chain',
  'sue_de_coq',
  'template',
  'death_blossom',
  'exocet_death_blossom',
]);

const LOTUS_SET = new Set(['medusa_3d']);
const PREREQ_MAP = new Map<string, string[]>(TREE.map((node) => [node.key, node.prerequisites]));

function stripTrailingParentheses(name: string): string {
  return name.replace(/\s*\(.*\)\s*$/, '');
}

function getIconKindForTech(techKey: string, status: TechStatus): ZenIconKind {
  if (status === 'locked') return 'lock';
  if (LOTUS_SET.has(techKey)) return 'lotus';
  if (FISH_SET.has(techKey)) return 'water';
  if (CHAIN_SET.has(techKey)) return 'wind';
  if (SEAL_SET.has(techKey)) return 'seal';
  return 'mountain';
}

function getUnlockHintText(techKey: string): string {
  const prereqs = PREREQ_MAP.get(techKey) || [];
  if (prereqs.length === 0) {
    return t('practice.node.lockedHint', { threshold: UNLOCK_THRESHOLD });
  }

  const short = prereqs.slice(0, 2).map((key) => stripTrailingParentheses(t(`technique.${key}`)));
  const joined = short.join('、');
  if (prereqs.length > 2) {
    return t('practice.node.lockedHintNamedMore', {
      prereqs: joined,
      extra: prereqs.length - short.length,
      threshold: UNLOCK_THRESHOLD,
    });
  }
  return t('practice.node.lockedHintNamed', { prereqs: joined, threshold: UNLOCK_THRESHOLD });
}

export function buildTreeNodeDisplayModel(techKey: string, status: TechStatus, cleared: number, total: number): TreeNodeDisplayModel {
  const safeTotal = Math.max(0, total);
  const safeCleared = Math.max(0, Math.min(cleared, safeTotal));
  const remaining = Math.max(0, safeTotal - safeCleared);
  const progressPct = safeTotal > 0 ? (safeCleared / safeTotal) * 100 : 0;
  const secondaryText = t('practice.node.cleared', { cleared: safeCleared, total: safeTotal });
  const iconKind = getIconKindForTech(techKey, status);

  if (status === 'locked') {
    return {
      statusChip: t('practice.node.statusLockedChip'),
      primaryText: t('practice.node.primaryLocked'),
      secondaryText,
      progressPct: 0,
      unlockHintText: getUnlockHintText(techKey),
      iconKind,
    };
  }

  if (status === 'completed') {
    return {
      statusChip: t('practice.node.statusCompletedChip'),
      primaryText: t('practice.node.primaryCompleted'),
      secondaryText,
      progressPct: 100,
      iconKind,
    };
  }

  if (status === 'partial') {
    return {
      statusChip: t('practice.node.statusPartialChip'),
      primaryText: t('practice.node.remaining', { remaining }),
      secondaryText,
      progressPct,
      iconKind,
    };
  }

  return {
    statusChip: t('practice.node.statusUnlockedChip'),
    primaryText: t('practice.node.remaining', { remaining }),
    secondaryText,
    progressPct,
    iconKind,
  };
}

function ZenIcon({ kind }: { kind: ZenIconKind }): ReactElement {
  if (kind === 'water') {
    return (
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <path d="M12 36c5-5 11-5 16 0s11 5 16 0 11-5 16 0" />
        <path d="M12 44c5-5 11-5 16 0s11 5 16 0 11-5 16 0" />
      </svg>
    );
  }
  if (kind === 'wind') {
    return (
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <path d="M10 24h30c4 0 7-3 7-7s-3-7-7-7c-3 0-5 2-6 4" />
        <path d="M10 34h40c4 0 7 3 7 7s-3 7-7 7c-3 0-5-2-6-4" />
      </svg>
    );
  }
  if (kind === 'seal') {
    return (
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <rect x="16" y="16" width="32" height="32" rx="5" />
        <path d="M24 40l16-16M24 24h16M24 32h8" />
      </svg>
    );
  }
  if (kind === 'lotus') {
    return (
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <path d="M32 20c5 4 7 9 7 14-4-1-8-4-11-8-3 4-7 7-11 8 0-5 2-10 7-14 2 1 5 2 8 2z" />
        <path d="M15 41c5-1 10 0 17 5 7-5 12-6 17-5-5 6-10 9-17 9s-12-3-17-9z" />
      </svg>
    );
  }
  if (kind === 'lock') {
    return (
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <rect x="18" y="30" width="28" height="22" rx="4" />
        <path d="M24 30v-6a8 8 0 0 1 16 0v6M32 38v7" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <path d="M10 44h44L42 20 32 32 22 20z" />
      <path d="M14 50h36" />
    </svg>
  );
}

export function TreeNode({
  techKey, name, status, cleared, total, compact, showUnlockHint = true, className, style, onClick,
}: TreeNodeProps): ReactElement {
  const bestiary = t(`technique.${techKey}`); // keep i18n dependency warm for technique glossary
  void bestiary;
  // Shorten label: remove parenthesized English names like "摩天樓 (Skyscraper)" → "摩天樓"
  const shortName = stripTrailingParentheses(name);
  const displayName = shortName === '???' ? t('practice.node.lockedNameFallback') : shortName;
  const model = buildTreeNodeDisplayModel(techKey, status, cleared, total);
  const ringRadius = compact ? 24 : 26;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringDashOffset = ringCircumference - (ringCircumference * model.progressPct) / 100;

  return (
    <div
      className={`tree-node tree-node--${status}${compact ? ' tree-node--compact' : ''}${className ? ` ${className}` : ''}`}
      style={style}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
    >
      <div className="tree-node-icon">
        <span className={`tree-node-chip tree-node-chip--${status}`}>{model.statusChip}</span>
        <span className={`tree-node-glyph tree-node-glyph--${status}`}>
          <ZenIcon kind={model.iconKind} />
        </span>

        <svg className="tree-node-ring" viewBox="0 0 64 64" aria-hidden="true">
          <circle className="tree-node-ring-track" cx="32" cy="32" r={ringRadius} />
          <circle
            className="tree-node-ring-fill"
            cx="32"
            cy="32"
            r={ringRadius}
            style={{
              strokeDasharray: ringCircumference,
              strokeDashoffset: ringDashOffset,
            }}
          />
        </svg>

        <span className={`tree-node-primary tree-node-primary--${status}`}>{model.primaryText}</span>
        <span className={`tree-node-secondary tree-node-secondary--${status}`}>{model.secondaryText}</span>

        {/* Corner badge */}
        {status === 'completed' && <span className="tree-node-badge tree-node-badge--done">✓</span>}
      </div>
      <div className="tree-node-label">{displayName}</div>
      {showUnlockHint && model.unlockHintText && <div className="tree-node-hint">{model.unlockHintText}</div>}
    </div>
  );
}
