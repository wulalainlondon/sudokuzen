// TreeNode — single technique node rendered as an "RPG skill icon button".
// Shows: bestiary name glyph in a square icon + technique name below + progress + badge

import { type CSSProperties, type ReactElement } from 'react';
import type { TechStatus } from './practiceTreeStore';
import { t } from '../../i18n/t';
import { TREE, UNLOCK_THRESHOLD } from '../../features/practice/practiceLobby';

interface TreeNodeProps {
  techKey: string; // e.g. 'naked_single' — for looking up bestiary name
  name: string; // localized display name (e.g. 'Naked Single')
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

export type ZenIconKind = string; // technique key or 'lock'
const PREREQ_MAP = new Map<string, string[]>(TREE.map((node) => [node.key, node.prerequisites]));

function stripTrailingParentheses(name: string): string {
  return name.replace(/\s*\(.*\)\s*$/, '');
}

function getIconKindForTech(techKey: string, status: TechStatus): ZenIconKind {
  if (status === 'locked') return 'lock';
  return techKey;
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

export function buildTreeNodeDisplayModel(
  techKey: string,
  status: TechStatus,
  cleared: number,
  total: number,
): TreeNodeDisplayModel {
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

// ── Per-technique SVG icons ──────────────────────────────────────────
// Each icon is a zen-style stroke drawing in a 64×64 viewBox.
// Fallback: mountain glyph for unknown keys, lock for locked nodes.

const TECH_ICONS: Record<string, ReactElement> = {
  // ── Foundation ─────────────────────────────────────────────────────
  // Eye — seeing the only possibility
  naked_single: (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <ellipse cx="32" cy="32" rx="18" ry="12" />
      <circle cx="32" cy="32" r="5" />
    </svg>
  ),
  // Half-closed eye — hidden observation
  hidden_single: (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <path d="M14 32c6-10 14-14 18-14s12 4 18 14" />
      <circle cx="32" cy="32" r="5" />
      <path d="M14 32c6 10 14 14 18 14" strokeDasharray="4 3" />
    </svg>
  ),
  // Padlock with grid line
  locked_candidates: (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <rect x="20" y="30" width="24" height="18" rx="3" />
      <path d="M26 30v-6a6 6 0 0 1 12 0v6" />
      <line x1="12" y1="39" x2="52" y2="39" strokeDasharray="3 3" />
    </svg>
  ),
  // Two circles linked
  naked_pair: (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="24" cy="32" r="8" />
      <circle cx="40" cy="32" r="8" />
      <line x1="32" y1="28" x2="32" y2="36" />
    </svg>
  ),
  // Two dashed circles linked
  hidden_pair: (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="24" cy="32" r="8" strokeDasharray="4 3" />
      <circle cx="40" cy="32" r="8" strokeDasharray="4 3" />
      <line x1="32" y1="28" x2="32" y2="36" />
    </svg>
  ),
  // Three circles in triangle
  naked_triple: (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="32" cy="20" r="7" />
      <circle cx="22" cy="38" r="7" />
      <circle cx="42" cy="38" r="7" />
      <path d="M32 27v4M26 35l-1-1M38 35l1-1" />
    </svg>
  ),
  // Three dashed circles in triangle
  hidden_triple: (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="32" cy="20" r="7" strokeDasharray="4 3" />
      <circle cx="22" cy="38" r="7" strokeDasharray="4 3" />
      <circle cx="42" cy="38" r="7" strokeDasharray="4 3" />
      <path d="M32 27v4M26 35l-1-1M38 35l1-1" />
    </svg>
  ),

  // ── Fish family ────────────────────────────────────────────────────
  // X cross — two parallel lines crossing
  x_wing: (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <path d="M16 16l32 32M48 16L16 48" />
      <circle cx="16" cy="16" r="3" />
      <circle cx="48" cy="16" r="3" />
      <circle cx="16" cy="48" r="3" />
      <circle cx="48" cy="48" r="3" />
    </svg>
  ),
  // X cross with extra fin mark
  finned_x_wing: (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <path d="M16 16l32 32M48 16L16 48" />
      <circle cx="16" cy="16" r="3" />
      <circle cx="48" cy="16" r="3" />
      <circle cx="16" cy="48" r="3" />
      <circle cx="48" cy="48" r="3" />
      <path d="M48 42l6-4" strokeDasharray="2 2" />
    </svg>
  ),
  // Three parallel slashes — sword marks
  swordfish: (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <path d="M18 12l8 40M28 12l8 40M38 12l8 40" />
      <line x1="14" y1="32" x2="50" y2="32" strokeDasharray="3 3" />
    </svg>
  ),
  // Three slashes with fin
  finned_swordfish: (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <path d="M18 12l8 40M28 12l8 40M38 12l8 40" />
      <line x1="14" y1="32" x2="50" y2="32" strokeDasharray="3 3" />
      <path d="M48 46l5-3" strokeDasharray="2 2" />
    </svg>
  ),
  // Dome + trailing tendrils
  jellyfish: (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <path d="M14 30c0-12 8-18 18-18s18 6 18 18" />
      <path d="M18 30c2 8 2 16 0 22M26 30c1 8 1 16 0 22M34 30c-1 8-1 16 0 22M42 30c-2 8-2 16 0 22" />
    </svg>
  ),
  // Jellyfish with fin mark
  finned_jellyfish: (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <path d="M14 30c0-12 8-18 18-18s18 6 18 18" />
      <path d="M18 30c2 8 2 16 0 22M26 30c1 8 1 16 0 22M34 30c-1 8-1 16 0 22M42 30c-2 8-2 16 0 22" />
      <path d="M50 26l4-2" strokeDasharray="2 2" />
    </svg>
  ),
  // Two towers connected at top
  skyscraper: (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <path d="M20 50V18h8v32M36 50V24h8v26" />
      <path d="M24 18h16" strokeDasharray="3 2" />
    </svg>
  ),
  // Kite shape with two strings
  two_string_kite: (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <path d="M32 12L48 32 32 52 16 32z" />
      <path d="M32 52l-8 6M32 52l8 6" />
    </svg>
  ),
  // Rectangle with empty center
  empty_rectangle: (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <rect x="14" y="18" width="36" height="28" rx="3" />
      <circle cx="32" cy="32" r="6" strokeDasharray="3 3" />
    </svg>
  ),

  // ── Wings ──────────────────────────────────────────────────────────
  // W shape — wave wing
  w_wing: (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <path d="M12 20l10 24 10-16 10 16 10-24" />
    </svg>
  ),
  // Y-branching from center
  xy_wing: (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="32" cy="32" r="5" />
      <path d="M32 27V14M27 35l-12 10M37 35l12 10" />
    </svg>
  ),
  // Three branches from center
  xyz_wing: (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="32" cy="32" r="5" />
      <path d="M32 27V14M27 35l-12 10M37 35l12 10" />
      <circle cx="32" cy="14" r="3" />
      <circle cx="15" cy="45" r="3" />
      <circle cx="49" cy="45" r="3" />
    </svg>
  ),

  // ── Rectangles & special patterns ──────────────────────────────────
  // Rectangle with diagonal slash
  unique_rectangle: (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <rect x="14" y="18" width="36" height="28" rx="2" />
      <path d="M14 46l36-28" />
    </svg>
  ),
  // Bug shape + "1"
  bug_plus_one: (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <ellipse cx="28" cy="34" rx="12" ry="14" />
      <path d="M16 28l-4-6M40 28l4-6M28 20v-6" />
      <text x="47" y="48" fontSize="16" fontWeight="700" fill="currentColor" stroke="none">
        1
      </text>
    </svg>
  ),

  // ── Coloring & Chains ──────────────────────────────────────────────
  // Yin-yang — two colors
  x_cycle_simple_coloring: (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="32" cy="32" r="18" />
      <path d="M32 14a18 18 0 0 1 0 36" />
      <circle cx="32" cy="23" r="4" />
      <circle cx="32" cy="41" r="4" strokeDasharray="3 2" />
    </svg>
  ),
  // Two dots connected by long dashed line
  remote_pairs: (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="14" cy="32" r="5" />
      <circle cx="50" cy="32" r="5" />
      <path d="M19 32h26" strokeDasharray="4 3" />
    </svg>
  ),
  // Chain of linked nodes
  xy_chain: (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="14" cy="32" r="4" />
      <circle cx="28" cy="22" r="4" />
      <circle cx="42" cy="38" r="4" />
      <circle cx="52" cy="26" r="4" />
      <path d="M18 30l6-6M32 24l6 12M46 36l4-8" />
    </svg>
  ),
  // Three-headed — 3D coloring
  medusa_3d: (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="32" cy="38" r="6" />
      <path d="M32 32c-4-6-12-10-14-6M32 32c4-6 12-10 14-6M32 32v-14" />
      <circle cx="18" cy="22" r="3" />
      <circle cx="46" cy="22" r="3" />
      <circle cx="32" cy="16" r="3" />
    </svg>
  ),
  // Alternating strong-weak chain
  aic: (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="12" cy="32" r="4" />
      <circle cx="32" cy="32" r="4" />
      <circle cx="52" cy="32" r="4" />
      <line x1="16" y1="32" x2="28" y2="32" />
      <line x1="36" y1="32" x2="48" y2="32" strokeDasharray="3 2" />
    </svg>
  ),
  // Chain with middle emphasis
  aic_mid_chain: (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="12" cy="32" r="3" />
      <circle cx="26" cy="24" r="3" />
      <circle cx="38" cy="40" r="3" />
      <circle cx="52" cy="32" r="3" />
      <path d="M15 31l8-6M29 26l6 12M41 38l8-5" />
      <circle cx="32" cy="32" r="8" strokeDasharray="3 3" />
    </svg>
  ),
  // Long zigzag chain
  aic_long_chain: (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <path d="M10 40l8-16 8 16 8-16 8 16 8-16 4 8" />
      <circle cx="10" cy="40" r="3" />
      <circle cx="54" cy="32" r="3" />
    </svg>
  ),
  // Closed loop with grouped nodes
  grouped_aic_nice_loop: (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <ellipse cx="32" cy="32" rx="18" ry="16" strokeDasharray="6 3" />
      <circle cx="14" cy="32" r="3" />
      <circle cx="32" cy="16" r="3" />
      <circle cx="50" cy="32" r="3" />
      <circle cx="32" cy="48" r="3" />
    </svg>
  ),
  // Broken loop
  discontinuous_nice_loop: (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <path d="M32 14a18 18 0 0 1 16 28" />
      <path d="M48 42a18 18 0 0 1-32-10" strokeDasharray="4 3" />
      <circle cx="32" cy="14" r="3" />
      <circle cx="48" cy="42" r="3" />
      <path d="M18 34l-4 4" />
    </svg>
  ),
  // Central node radiating chains
  forcing_chain_net: (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="32" cy="32" r="6" />
      <path d="M32 26V12M32 38v14M26 32H12M38 32h14" />
      <path d="M27 27L16 16M37 27l11-11M27 37L16 48M37 37l11 11" strokeDasharray="3 2" />
    </svg>
  ),
  // Grid cell with radiating arrows
  cell_forcing_chain: (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <rect x="24" y="24" width="16" height="16" rx="2" />
      <path d="M24 32H12M40 32h12M32 24V12M32 40v12" />
    </svg>
  ),
  // Region box with radiating arrows
  region_forcing_chain: (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <rect x="18" y="18" width="28" height="28" rx="3" />
      <line x1="18" y1="28" x2="46" y2="28" />
      <line x1="18" y1="38" x2="46" y2="38" />
      <line x1="28" y1="18" x2="28" y2="46" />
      <line x1="38" y1="18" x2="38" y2="46" />
      <path d="M32 12V8M32 52v4M8 32H4M56 32h4" />
    </svg>
  ),

  // ── ALS family ─────────────────────────────────────────────────────
  // Two overlapping sets
  als_xz: (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <ellipse cx="26" cy="32" rx="14" ry="16" />
      <ellipse cx="38" cy="32" rx="14" ry="16" />
    </svg>
  ),
  // Three overlapping sets
  als_xy: (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <ellipse cx="24" cy="28" rx="12" ry="14" />
      <ellipse cx="40" cy="28" rx="12" ry="14" />
      <ellipse cx="32" cy="40" rx="12" ry="14" />
    </svg>
  ),
  // ALS with wing shape
  als_w_wing: (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <ellipse cx="22" cy="34" rx="10" ry="12" />
      <ellipse cx="42" cy="34" rx="10" ry="12" />
      <path d="M22 22l10-10 10 10" />
    </svg>
  ),
  // Chain of overlapping sets
  als_chain: (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <ellipse cx="16" cy="32" rx="8" ry="10" />
      <ellipse cx="32" cy="32" rx="8" ry="10" />
      <ellipse cx="48" cy="32" rx="8" ry="10" />
      <path d="M24 32h-1M40 32h-1" />
    </svg>
  ),

  // ── Master / Legend ────────────────────────────────────────────────
  // Puzzle piece
  sue_de_coq: (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <path d="M16 22h8c0-4 4-6 8-6s8 2 8 6h8v8c4 0 6 4 6 8s-2 8-6 8v8H16V22z" />
    </svg>
  ),
  // Grid template overlay
  template: (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <rect x="14" y="14" width="36" height="36" rx="2" />
      <line x1="14" y1="26" x2="50" y2="26" />
      <line x1="14" y1="38" x2="50" y2="38" />
      <line x1="26" y1="14" x2="26" y2="50" />
      <line x1="38" y1="14" x2="38" y2="50" />
      <circle cx="20" cy="20" r="2.5" />
      <circle cx="44" cy="32" r="2.5" />
      <circle cx="32" cy="44" r="2.5" />
    </svg>
  ),
  // Flower with petals
  death_blossom: (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="32" cy="32" r="5" />
      <path d="M32 27c2-6 0-14-4-14s-4 8-2 14M32 27c-2-6 0-14 4-14s4 8 2 14" />
      <path d="M27 34c-6 2-14 0-14-4s8-4 14-2M37 34c6 2 14 0 14-4s-8-4-14-2" />
      <path d="M30 37c-4 5-4 13 0 14s6-7 4-13M34 37c4 5 4 13 0 14s-6-7-4-13" />
    </svg>
  ),
  // Crown — ultimate technique
  exocet_death_blossom: (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <path d="M12 42l6-20 14 12 14-12 6 20z" />
      <line x1="12" y1="46" x2="52" y2="46" />
      <circle cx="18" cy="22" r="2" />
      <circle cx="32" cy="34" r="2" />
      <circle cx="46" cy="22" r="2" />
    </svg>
  ),
  // Lock — for locked nodes
  lock: (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <rect x="18" y="30" width="28" height="22" rx="4" />
      <path d="M24 30v-6a8 8 0 0 1 16 0v6M32 38v7" />
    </svg>
  ),
};

// Fallback mountain icon for unknown technique keys
const FALLBACK_ICON = (
  <svg viewBox="0 0 64 64" aria-hidden="true">
    <path d="M10 44h44L42 20 32 32 22 20z" />
    <path d="M14 50h36" />
  </svg>
);

function ZenIcon({ kind }: { kind: ZenIconKind }): ReactElement {
  return TECH_ICONS[kind] ?? FALLBACK_ICON;
}

export function TreeNode({
  techKey,
  name,
  status,
  cleared,
  total,
  compact,
  showUnlockHint = true,
  className,
  style,
  onClick,
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
