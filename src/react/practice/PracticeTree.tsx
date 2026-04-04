// PracticeTree — SVG skill tree visualization for Practice Mode.
// Renders 41 techniques as connected nodes with branch/merge paths.

import { useCallback, type ReactElement } from 'react';
import { usePracticeTreeStore, type TechNodeState, type TechStatus } from './practiceTreeStore';
import { t } from '../../i18n/t';
import { TreeNode } from './TreeNode';
import { TREE } from '../../features/practice/practiceLobby';

// ── Tree structure definition (must match practiceLobby.ts) ──────────

const PHASE1_KEYS = ['naked_single', 'hidden_single', 'locked_candidates', 'naked_pair', 'hidden_pair', 'naked_triple', 'hidden_triple'];

const BRANCH_LEFT = ['x_wing', 'finned_x_wing', 'swordfish', 'finned_swordfish', 'jellyfish', 'finned_jellyfish', 'skyscraper', 'two_string_kite', 'empty_rectangle'];
const BRANCH_MID = ['x_cycle_simple_coloring', 'xy_wing', 'xyz_wing', 'w_wing', 'remote_pairs'];
const BRANCH_RIGHT = ['unique_rectangle', 'bug_plus_one', 'als_xz', 'als_xy', 'als_w_wing', 'als_chain'];

const PHASE3_KEYS = ['medusa_3d'];
const PHASE4_KEYS = ['xy_chain', 'aic', 'aic_mid_chain', 'aic_long_chain', 'grouped_aic_nice_loop', 'discontinuous_nice_loop'];
const PHASE5_KEYS = ['forcing_chain_net', 'cell_forcing_chain', 'region_forcing_chain', 'sue_de_coq', 'template', 'death_blossom', 'exocet_death_blossom'];

// ── Helpers ───────────────────────────────────────────────────────────

function getNode(nodes: Map<string, TechNodeState>, key: string): TechNodeState {
  return nodes.get(key) || { key, name: key, status: 'locked' as TechStatus, cleared: 0, total: 25 };
}

// ── RPG tree map layout (fishbone) ───────────────────────────────────

const NODE_X = {
  left: 84,
  mid: 180,
  right: 276,
};

const NODE_LAYOUT: Record<string, { x: number; y: number; compact?: boolean }> = {
  naked_single: { x: NODE_X.mid, y: 70 },
  hidden_single: { x: NODE_X.mid, y: 158 },
  locked_candidates: { x: NODE_X.mid, y: 246 },
  naked_pair: { x: NODE_X.mid, y: 334 },
  hidden_pair: { x: NODE_X.mid, y: 422 },
  naked_triple: { x: NODE_X.mid, y: 510 },
  hidden_triple: { x: NODE_X.mid, y: 598 },

  x_wing: { x: NODE_X.left, y: 716, compact: true },
  finned_x_wing: { x: NODE_X.left, y: 794, compact: true },
  swordfish: { x: NODE_X.left, y: 872, compact: true },
  finned_swordfish: { x: NODE_X.left, y: 950, compact: true },
  jellyfish: { x: NODE_X.left, y: 1028, compact: true },
  finned_jellyfish: { x: NODE_X.left, y: 1106, compact: true },
  skyscraper: { x: NODE_X.left, y: 1184, compact: true },
  two_string_kite: { x: NODE_X.left, y: 1262, compact: true },
  empty_rectangle: { x: NODE_X.left, y: 1340, compact: true },

  x_cycle_simple_coloring: { x: NODE_X.mid, y: 912, compact: true },
  xy_wing: { x: NODE_X.mid, y: 990, compact: true },
  xyz_wing: { x: NODE_X.mid, y: 1068, compact: true },
  w_wing: { x: NODE_X.mid, y: 1146, compact: true },
  remote_pairs: { x: NODE_X.mid, y: 1224, compact: true },

  unique_rectangle: { x: NODE_X.right, y: 990, compact: true },
  bug_plus_one: { x: NODE_X.right, y: 1068, compact: true },
  als_xz: { x: NODE_X.right, y: 1146, compact: true },
  als_xy: { x: NODE_X.right, y: 1224, compact: true },
  als_w_wing: { x: NODE_X.right, y: 1302, compact: true },
  als_chain: { x: NODE_X.right, y: 1380, compact: true },

  medusa_3d: { x: NODE_X.mid, y: 1492 },
  xy_chain: { x: NODE_X.mid, y: 1606 },
  aic: { x: NODE_X.mid, y: 1694 },
  aic_mid_chain: { x: NODE_X.mid, y: 1782 },
  aic_long_chain: { x: NODE_X.mid, y: 1870 },
  grouped_aic_nice_loop: { x: NODE_X.mid, y: 1958 },
  discontinuous_nice_loop: { x: NODE_X.mid, y: 2046 },
  forcing_chain_net: { x: NODE_X.mid, y: 2166 },
  cell_forcing_chain: { x: NODE_X.mid, y: 2254 },
  region_forcing_chain: { x: NODE_X.mid, y: 2342 },
  sue_de_coq: { x: NODE_X.mid, y: 2430 },
  template: { x: NODE_X.mid, y: 2518 },
  death_blossom: { x: NODE_X.mid, y: 2606 },
  exocet_death_blossom: { x: NODE_X.mid, y: 2694 },
};

const TREE_EDGES: Array<[string, string]> = [
  ['naked_single', 'hidden_single'],
  ['hidden_single', 'locked_candidates'],
  ['locked_candidates', 'naked_pair'],
  ['naked_pair', 'hidden_pair'],
  ['hidden_pair', 'naked_triple'],
  ['naked_triple', 'hidden_triple'],

  ['hidden_triple', 'x_wing'],
  ['hidden_triple', 'x_cycle_simple_coloring'],
  ['hidden_triple', 'unique_rectangle'],

  ['x_wing', 'finned_x_wing'],
  ['finned_x_wing', 'swordfish'],
  ['swordfish', 'finned_swordfish'],
  ['finned_swordfish', 'jellyfish'],
  ['jellyfish', 'finned_jellyfish'],
  ['finned_jellyfish', 'skyscraper'],
  ['skyscraper', 'two_string_kite'],
  ['two_string_kite', 'empty_rectangle'],

  ['x_cycle_simple_coloring', 'xy_wing'],
  ['xy_wing', 'xyz_wing'],
  ['xyz_wing', 'w_wing'],
  ['w_wing', 'remote_pairs'],

  ['unique_rectangle', 'bug_plus_one'],
  ['bug_plus_one', 'als_xz'],
  ['als_xz', 'als_xy'],
  ['als_xy', 'als_w_wing'],
  ['als_w_wing', 'als_chain'],

  ['empty_rectangle', 'medusa_3d'],
  ['remote_pairs', 'medusa_3d'],
  ['als_chain', 'medusa_3d'],

  ['medusa_3d', 'xy_chain'],
  ['xy_chain', 'aic'],
  ['aic', 'aic_mid_chain'],
  ['aic_mid_chain', 'aic_long_chain'],
  ['aic_long_chain', 'grouped_aic_nice_loop'],
  ['grouped_aic_nice_loop', 'discontinuous_nice_loop'],
  ['discontinuous_nice_loop', 'forcing_chain_net'],
  ['forcing_chain_net', 'cell_forcing_chain'],
  ['cell_forcing_chain', 'region_forcing_chain'],
  ['region_forcing_chain', 'sue_de_coq'],
  ['sue_de_coq', 'template'],
  ['template', 'death_blossom'],
  ['death_blossom', 'exocet_death_blossom'],
];

const MAP_WIDTH = 360;
const MAP_HEIGHT = 2810;
const NODE_SIZE = 78;
const ROOT_Y = 70;
const MAP_Y_SCALE = 1.2;
const UNLOCK_THRESHOLD = 3;
const PREREQ_MAP = new Map<string, string[]>(TREE.map((node) => [node.key, node.prerequisites]));
const CHILD_MAP = new Map<string, string[]>();

for (const node of TREE) {
  for (const pre of node.prerequisites) {
    const list = CHILD_MAP.get(pre) || [];
    list.push(node.key);
    CHILD_MAP.set(pre, list);
  }
}

function mapY(y: number): number {
  if (y <= ROOT_Y) return y;
  return ROOT_Y + (y - ROOT_Y) * MAP_Y_SCALE;
}

function buildEdgePath(from: string, to: string): string {
  const rawA = NODE_LAYOUT[from];
  const rawB = NODE_LAYOUT[to];
  const a = { ...rawA, y: mapY(rawA.y) };
  const b = { ...rawB, y: mapY(rawB.y) };
  const fromBottomY = a.y + NODE_SIZE;
  const fromTopY = a.y;
  const toBottomY = b.y + NODE_SIZE;
  const toTopY = b.y;

  // Connect from node edge to node edge so lines never run across node faces.
  const goingDown = b.y >= a.y;
  const y1 = goingDown ? fromBottomY : fromTopY;
  const y2 = goingDown ? toTopY : toBottomY;

  if (Math.abs(a.x - b.x) < 3) {
    return `M ${a.x} ${y1} L ${b.x} ${y2}`;
  }

  // Side branches: orthogonal elbows (RPG skill-tree style), never crossing node faces.
  const startX = b.x > a.x ? a.x + NODE_SIZE / 2 : a.x - NODE_SIZE / 2;
  const endX = b.x > a.x ? b.x - NODE_SIZE / 2 : b.x + NODE_SIZE / 2;
  const elbowY = goingDown
    ? Math.min(y1 + 34, y2 - 18)
    : Math.max(y1 - 34, y2 + 18);
  return `M ${startX} ${y1} L ${startX} ${elbowY} L ${endX} ${elbowY} L ${endX} ${y2}`;
}

function edgeClass(from: string, to: string, nodes: Map<string, TechNodeState>): string {
  const fromNode = getNode(nodes, from);
  const toNode = getNode(nodes, to);
  if (toNode.status === 'locked') return 'tree-map-line tree-map-line--locked';
  if (fromNode.cleared >= UNLOCK_THRESHOLD && toNode.status === 'completed') {
    return 'tree-map-line tree-map-line--completed';
  }
  if (fromNode.cleared >= UNLOCK_THRESHOLD) return 'tree-map-line tree-map-line--active';
  return 'tree-map-line tree-map-line--locked';
}

export function isFrontierLockedNode(key: string, nodes: Map<string, TechNodeState>): boolean {
  const node = getNode(nodes, key);
  if (node.status !== 'locked') return false;
  const prereqs = PREREQ_MAP.get(key) || [];
  if (prereqs.length === 0) return false;
  return prereqs.every((pre) => getNode(nodes, pre).status !== 'locked');
}

export function isTreeNodeVisible(key: string, nodes: Map<string, TechNodeState>): boolean {
  const node = getNode(nodes, key);
  if (node.status !== 'locked') return true;
  return isFrontierLockedNode(key, nodes);
}

function buildVisibleNodeSet(orderedKeys: string[], nodes: Map<string, TechNodeState>): Set<string> {
  const visible = new Set<string>();
  const visited = new Set<string>();
  const queue: Array<{ key: string; depth: number }> = [];
  const PREVIEW_DEPTH = 1;

  for (const key of orderedKeys) {
    const node = getNode(nodes, key);
    if (node.status !== 'locked') {
      visible.add(key);
      queue.push({ key, depth: 0 });
      visited.add(`${key}:0`);
      continue;
    }
    if (isFrontierLockedNode(key, nodes)) {
      visible.add(key);
      queue.push({ key, depth: 1 });
      visited.add(`${key}:1`);
    }
  }

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || current.depth >= PREVIEW_DEPTH) continue;

    const children = CHILD_MAP.get(current.key) || [];
    for (const child of children) {
      const nextDepth = current.depth + 1;
      const ticket = `${child}:${nextDepth}`;
      if (visited.has(ticket)) continue;
      visited.add(ticket);

      const childNode = getNode(nodes, child);
      if (childNode.status === 'locked') {
        visible.add(child);
      }
      queue.push({ key: child, depth: nextDepth });
    }
  }

  return visible;
}

// ── Main component ────────────────────────────────────────────────────

export function PracticeTree(): ReactElement | null {
  const { visible, nodes, completedCount } = usePracticeTreeStore();

  const handleNodeClick = useCallback((key: string) => {
    const node = nodes.get(key);
    if (!node) return;
    if (node.status === 'locked') {
      import('../../ui/feedback').then(({ showFeedback }) => {
        showFeedback(t('practice.techLocked'), 'error');
      }).catch(() => {});
      return;
    }
    import('../../features/practice/practiceLobby').then((m) => m.enterPracticeTechnique(key)).catch(() => {});
  }, [nodes]);

  if (!visible) return null;

  const orderedKeys = [
    ...PHASE1_KEYS,
    ...BRANCH_LEFT,
    ...BRANCH_MID,
    ...BRANCH_RIGHT,
    ...PHASE3_KEYS,
    ...PHASE4_KEYS,
    ...PHASE5_KEYS,
  ];
  const frontierLockedKeys = new Set(orderedKeys.filter((key) => isFrontierLockedNode(key, nodes)));
  const visibleKeys = buildVisibleNodeSet(orderedKeys, nodes);
  const visibleLayouts = [...visibleKeys]
    .map((key) => NODE_LAYOUT[key])
    .filter((pos): pos is { x: number; y: number; compact?: boolean } => Boolean(pos))
    .map((pos) => ({ ...pos, y: mapY(pos.y) }));
  const tallestNodeBottom = visibleLayouts.length
    ? Math.max(...visibleLayouts.map((pos) => pos.y + NODE_SIZE))
    : 520;
  const dynamicMapHeight = Math.min(MAP_HEIGHT, Math.max(460, tallestNodeBottom + 140));
  const showPhase3 = PHASE3_KEYS.some((key) => visibleKeys.has(key));
  const showPhase4 = PHASE4_KEYS.some((key) => visibleKeys.has(key));
  const showPhase5 = PHASE5_KEYS.some((key) => visibleKeys.has(key));

  return (
    <div className="practice-tree-container" id="practice-tree">
      <div className="practice-tree-header">
        <button className="tier-back-btn" onClick={() => {
          import('../../features/practice/practiceLobby').then((m) => m.closePracticeLobby()).catch(() => {});
        }}>
          {t('nav.back')}
        </button>
        <div className="practice-tree-title">{t('practice.lobbyTitle')}</div>
        <div className="practice-tree-progress">{t('practice.progress', { completed: String(completedCount) })}</div>
      </div>

      <div className="practice-tree-scroll">
        <div className="practice-tree-map" style={{ height: `${dynamicMapHeight}px`, width: `${MAP_WIDTH}px` }}>
          <div className="tree-phase-label tree-phase-label--map" style={{ top: `${mapY(20)}px` }}>{t('practice.phase1')}</div>
          {showPhase3 && <div className="tree-phase-label tree-phase-label--map" style={{ top: `${mapY(1538)}px` }}>{t('practice.phase3')}</div>}
          {showPhase4 && <div className="tree-phase-label tree-phase-label--map" style={{ top: `${mapY(1638)}px` }}>{t('practice.phase4')}</div>}
          {showPhase5 && <div className="tree-phase-label tree-phase-label--map" style={{ top: `${mapY(2100)}px` }}>{t('practice.phase5')}</div>}

          <svg className="practice-tree-map-lines" viewBox={`0 0 ${MAP_WIDTH} ${dynamicMapHeight}`} preserveAspectRatio="none">
            {TREE_EDGES.filter(([from, to]) => visibleKeys.has(from) && visibleKeys.has(to)).map(([from, to]) => (
              <path
                key={`${from}-${to}`}
                d={buildEdgePath(from, to)}
                className={edgeClass(from, to, nodes)}
                fill="none"
              />
            ))}
          </svg>

          {orderedKeys.map((key) => {
            if (!visibleKeys.has(key)) return null;
            const n = getNode(nodes, key);
            const pos = NODE_LAYOUT[key];
            if (!pos) return null;
            return (
              <TreeNode
                key={key}
                techKey={key}
                name={n.name}
                status={n.status}
                cleared={n.cleared}
                total={n.total}
                compact={!!pos.compact || (n.status === 'locked' && !frontierLockedKeys.has(key))}
                showUnlockHint={n.status === 'locked' && frontierLockedKeys.has(key)}
                className="tree-node--map"
                style={{ left: `${pos.x}px`, top: `${mapY(pos.y)}px` }}
                onClick={() => handleNodeClick(key)}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
