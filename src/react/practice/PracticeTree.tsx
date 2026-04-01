// PracticeTree — SVG skill tree visualization for Practice Mode.
// Renders 41 techniques as connected nodes with branch/merge paths.

import { useCallback, type ReactElement } from 'react';
import { usePracticeTreeStore, type TechNodeState, type TechStatus } from './practiceTreeStore';
import { TreeNode } from './TreeNode';
import { TreeSpine } from './TreeSpine';
import { TreeFork } from './TreeFork';
import { t } from '../../i18n/t';

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

// ── Phase section label ───────────────────────────────────────────────

function PhaseLabel({ text }: { text: string }): ReactElement {
  return <div className="tree-phase-label">{text}</div>;
}

// ── Convergence hint ──────────────────────────────────────────────────

function ConvergeHint(): ReactElement {
  return <div className="tree-converge-hint">三路匯合</div>;
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
      });
      return;
    }
    import('../../features/practice/practiceLobby').then((m) => m.enterPracticeTechnique(key));
  }, [nodes]);

  if (!visible) return null;

  const renderNodes = (keys: string[], compact = false) =>
    keys.map((key) => {
      const n = getNode(nodes, key);
      return (
        <TreeNode
          key={key}
          name={n.name}
          status={n.status}
          cleared={n.cleared}
          total={n.total}
          compact={compact}
          onClick={() => handleNodeClick(key)}
        />
      );
    });

  return (
    <div className="practice-tree-container" id="practice-tree">
      <div className="practice-tree-header">
        <button className="tier-back-btn" onClick={() => {
          import('../../features/practice/practiceLobby').then((m) => m.closePracticeLobby());
        }}>
          {t('nav.back')}
        </button>
        <div className="practice-tree-title">{t('practice.lobbyTitle')}</div>
        <div className="practice-tree-progress">{t('practice.progress', { completed: String(completedCount) })}</div>
      </div>

      <div className="practice-tree-scroll">
        {/* Phase 1: Foundation — linear spine */}
        <PhaseLabel text={t('practice.phase1')} />
        <TreeSpine>
          {renderNodes(PHASE1_KEYS)}
        </TreeSpine>

        {/* Split: hidden_triple → 3 branches */}
        <PhaseLabel text={t('practice.phase2')} />
        <TreeFork type="split" branchCount={3}>
          <TreeSpine label={t('practice.branchFish')}>
            {renderNodes(BRANCH_LEFT, true)}
          </TreeSpine>
          <TreeSpine label={t('practice.branchColor')}>
            {renderNodes(BRANCH_MID, true)}
          </TreeSpine>
          <TreeSpine label={t('practice.branchALS')}>
            {renderNodes(BRANCH_RIGHT, true)}
          </TreeSpine>
        </TreeFork>

        {/* Merge: 3 branches → medusa_3d */}
        <TreeFork type="merge" branchCount={3}>
          <div />
        </TreeFork>
        <ConvergeHint />

        {/* Phase 3: Convergence */}
        <PhaseLabel text={t('practice.phase3')} />
        <TreeSpine>
          {renderNodes(PHASE3_KEYS)}
        </TreeSpine>

        {/* Phase 4: Chain arts */}
        <PhaseLabel text={t('practice.phase4')} />
        <TreeSpine>
          {renderNodes(PHASE4_KEYS)}
        </TreeSpine>

        {/* Phase 5: Endgame */}
        <PhaseLabel text={t('practice.phase5')} />
        <TreeSpine>
          {renderNodes(PHASE5_KEYS)}
        </TreeSpine>
      </div>
    </div>
  );
}
