// Candidate Tracking Mode (CTM)
import { vibrate } from '../../platform/haptics';
// Activated by long-pressing a numpad digit (300ms) in Wild mode.
// Lets players manually select candidate cells and build link chains;
// fires evaluateAllSkills() on each change to detect valid patterns.

import { gs } from '../../game/state';
import { evaluateAllSkills, getSkillById } from './skillRegistry';
import type { SkillPreview } from './types';
import { getUnitCells } from './types';
import { getChoreography, showChainPreview, clearChainPreview } from './castChoreography';
import { showFeedback } from '../../ui/feedback';
import { updateCellDisplay } from '../../game/board';
import { cellLabel } from '../../game/utils';
import { recordElimination } from '../stats';
import { t } from '../../i18n/t';
import { saveGameStatus } from '../../game/core';

// ── Module state ─────────────────────────────────────────────────────

let _preview: SkillPreview | null = null;
let _casting = false;
let _firstDiscoveryShown = false; // guard: show firstDiscovery toast at most once per encounter

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function recordAction(
  type: string,
  detail: string,
  idx: number | null = null,
  val: number | null = null,
  notes: number[] | null = null,
): void {
  gs.actionHistory.push({ t: gs.seconds, type, detail, idx, val, notes: notes ? notes.slice() : null });
  if (gs.actionHistory.length > 1200) gs.actionHistory.shift();
}

function findNoteSpan(cellEl: HTMLElement, digit: number): HTMLElement | null {
  return cellEl.querySelector(`.note-num[data-digit="${digit}"]`) as HTMLElement | null;
}

/** Returns all cells that share a strong link with cellIdx for digit.
 *  A strong link exists when, in a given unit, exactly 2 cells carry the digit. */
function getStrongLinkPartners(digit: number, cellIdx: number): number[] {
  const row = Math.floor(cellIdx / 9);
  const col = cellIdx % 9;
  const box = Math.floor(row / 3) * 3 + Math.floor(col / 3);
  const partners: number[] = [];

  for (const unitType of ['row', 'col', 'box'] as const) {
    const unitIndex = unitType === 'row' ? row : unitType === 'col' ? col : box;
    const unitCells = getUnitCells(unitType, unitIndex);
    const withDigit = unitCells.filter((c) => gs.cellsData[c].value === 0 && gs.cellsData[c].notes.includes(digit));
    if (withDigit.length === 2 && withDigit.includes(cellIdx)) {
      const partner = withDigit.find((c) => c !== cellIdx);
      if (partner !== undefined && !partners.includes(partner)) {
        partners.push(partner);
      }
    }
  }
  return partners;
}

// ── Highlight management ─────────────────────────────────────────────

function clearTrackingClasses(): void {
  if (!gs.gridEl) return;
  Array.from(gs.gridEl.children).forEach((el) => {
    el.classList.remove(
      'tracking-available',
      'tracking-selected',
      'tracking-strong-partner',
      'tracking-selected-strong',
      'tracking-selected-weak',
      'tracking-ready',
      'tracking-reject',
      'tracking-strong-anchor',
    );
    el.querySelectorAll('.tracking-note-lit').forEach((n) => n.classList.remove('tracking-note-lit'));
  });
}

export function refreshTrackingHighlights(): void {
  if (!gs.gridEl) return;
  clearTrackingClasses();

  const ct = gs.candidateTracking;
  const digit = ct.digit;

  // Compute strong link partners of the last selected node
  const lastNode = ct.nodes.length > 0 ? ct.nodes[ct.nodes.length - 1] : null;
  const strongPartners = lastNode ? new Set(getStrongLinkPartners(digit, lastNode.cellIdx)) : new Set<number>();

  for (let i = 0; i < 81; i++) {
    const cell = gs.cellsData[i];
    if (cell.value !== 0 || !cell.notes.includes(digit)) continue;

    const el = gs.gridEl.children[i] as HTMLElement;
    el.classList.add('tracking-available');

    const node = ct.nodes.find((n) => n.cellIdx === i);
    if (node) {
      const cls =
        node.linkType === 'strong'
          ? 'tracking-selected-strong'
          : node.linkType === 'weak'
            ? 'tracking-selected-weak'
            : 'tracking-selected';
      el.classList.add(cls);
      const noteSpan = el.querySelector(`.note-num[data-digit="${digit}"]`) as HTMLElement | null;
      noteSpan?.classList.add('tracking-note-lit');
    } else if (strongPartners.has(i)) {
      el.classList.add('tracking-strong-partner');
    }
  }

  // When no nodes selected yet: highlight cells that have at least one strong link (anchor points)
  if (ct.nodes.length === 0) {
    for (let i = 0; i < 81; i++) {
      const cell = gs.cellsData[i];
      if (cell.value !== 0 || !cell.notes.includes(digit)) continue;
      if (getStrongLinkPartners(digit, i).length > 0) {
        (gs.gridEl.children[i] as HTMLElement).classList.add('tracking-strong-anchor');
      }
    }
  }
}

function showTrackingReject(cellIdx: number): void {
  if (!gs.gridEl) return;
  const el = gs.gridEl.children[cellIdx] as HTMLElement | undefined;
  if (!el) return;
  el.classList.add('tracking-reject');
  setTimeout(() => el.classList.remove('tracking-reject'), 200);
}

// ── Panel UI ─────────────────────────────────────────────────────────

function getTrackingPanel(): HTMLElement | null {
  return document.getElementById('tracking-panel');
}

function getNumpad(): HTMLElement | null {
  return document.getElementById('numpad');
}

export function showTrackingPanel(): void {
  const numpad = getNumpad();
  const panel = getTrackingPanel();
  if (numpad) numpad.style.visibility = 'hidden';
  if (panel) panel.classList.remove('hidden');
  updateTrackingPanelUI();
}

export function hideTrackingPanel(): void {
  const numpad = getNumpad();
  const panel = getTrackingPanel();
  if (numpad) numpad.style.visibility = '';
  if (panel) panel.classList.add('hidden');
}

function updateTrackingPanelUI(): void {
  const ct = gs.candidateTracking;

  const digitEl = document.getElementById('tracking-digit-value');
  const countEl = document.getElementById('tracking-nodes-count');
  const listEl = document.getElementById('tracking-nodes-list');
  const castBtn = document.getElementById('tracking-cast-btn') as HTMLButtonElement | null;

  if (digitEl) digitEl.textContent = String(ct.digit);
  if (countEl) countEl.textContent = String(ct.nodes.length);

  if (listEl) {
    listEl.innerHTML = ct.nodes
      .map((n, idx) => {
        const label = cellLabel(n.cellIdx);
        const nextType = ct.nodes[idx + 1]?.linkType;
        const linkLabel =
          idx < ct.nodes.length - 1
            ? nextType === 'strong'
              ? '──強──'
              : nextType === 'weak'
                ? '──弱──'
                : '──?──'
            : '';
        return `<span class="tracking-node-item">${label}${linkLabel}</span>`;
      })
      .join('');
  }

  if (castBtn) {
    if (_preview?.valid) {
      castBtn.disabled = false;
      castBtn.textContent = `${_preview.skillName}（-${_preview.targets.length}）`;
    } else {
      castBtn.disabled = true;
      castBtn.textContent = '施放';
    }
  }
}

// ── Completion detection ──────────────────────────────────────────────

function checkForCompletion(): void {
  const ct = gs.candidateTracking;
  if (ct.nodes.length < 2) {
    _preview = null;
    clearChainPreview();
    // Remove tracking-ready from all cells
    if (gs.gridEl) {
      Array.from(gs.gridEl.children).forEach((el) => el.classList.remove('tracking-ready'));
    }
    updateTrackingPanelUI();
    return;
  }

  const selectedCells = ct.nodes.map((n) => n.cellIdx);
  _preview = evaluateAllSkills(selectedCells, gs.cellsData);

  if (gs.gridEl) {
    Array.from(gs.gridEl.children).forEach((el) => el.classList.remove('tracking-ready'));
    if (_preview.valid) {
      selectedCells.forEach((idx) => {
        (gs.gridEl!.children[idx] as HTMLElement)?.classList.add('tracking-ready');
      });
      if (_preview.chainPath && _preview.chainPath.length >= 2) {
        showChainPreview(gs.gridEl, _preview.chainPath);
      } else {
        clearChainPreview();
      }
    } else {
      clearChainPreview();
    }
  }

  updateTrackingPanelUI();
}

// ── Public API ────────────────────────────────────────────────────────

/** Enter CTM for a specific digit. Called by numpad long-press. */
export function enterCandidateTracking(digit: number): void {
  const isWild = !!(gs.currentLevel && gs.currentLevel.id < 0 && gs.currentLevel.source === 'wild');
  if (!isWild || !gs.candidateTrackingEnabled) return;
  if (gs.candidateTracking.active) return; // already tracking — ignore

  _preview = null;
  gs.candidateTracking = { active: true, digit, nodes: [] };

  // Remove CTM intro pulse if still active
  document
    .getElementById('numpad')
    ?.querySelectorAll<HTMLElement>('.ctm-intro-pulse')
    .forEach((el) => el.classList.remove('ctm-intro-pulse'));

  vibrate(15);
  refreshTrackingHighlights();
  showTrackingPanel();
}

/** Called when the user taps a cell while CTM is active. */
export function tapCellInTracking(cellIdx: number): void {
  const ct = gs.candidateTracking;
  if (!ct.active) return;

  const cell = gs.cellsData[cellIdx];

  // Cell doesn't have this candidate → reject flash
  if (!cell || cell.value !== 0 || !cell.notes.includes(ct.digit)) {
    showTrackingReject(cellIdx);
    return;
  }

  const existingIdx = ct.nodes.findIndex((n) => n.cellIdx === cellIdx);
  if (existingIdx !== -1) {
    // Tap again = deselect
    ct.nodes.splice(existingIdx, 1);
  } else if (ct.nodes.length === 0) {
    // First node: pending until a link is confirmed
    ct.nodes.push({ cellIdx, linkType: 'pending' });
  } else {
    // Check if new cell forms a strong link with the last node
    const lastNode = ct.nodes[ct.nodes.length - 1];
    const partners = getStrongLinkPartners(ct.digit, lastNode.cellIdx);
    const isStrong = partners.includes(cellIdx);

    if (isStrong && lastNode.linkType === 'pending') {
      // Retroactively confirm the last node as strong
      lastNode.linkType = 'strong';
    }
    ct.nodes.push({ cellIdx, linkType: isStrong ? 'strong' : 'weak' });
  }

  vibrate(8);
  refreshTrackingHighlights();
  checkForCompletion();
}

/** Cast the detected skill from CTM. Called by tracking panel cast button. */
export async function castFromTracking(): Promise<void> {
  if (_casting || !_preview?.valid) {
    showFeedback(_preview?.reason || t('skills.conditionNotMet'), 'error');
    return;
  }

  const detector = getSkillById(_preview.skillId);
  if (!detector) return;

  const result = detector.execute(gs.cellsData, _preview);
  if (!result.valid || !result.targets.length) {
    showFeedback(result.reason || t('skills.noElimTargets'), 'error');
    exitCandidateTracking();
    return;
  }

  _casting = true;
  try {
    const choreography = getChoreography(result.skillId);
    if (gs.gridEl) {
      await choreography({
        gridEl: gs.gridEl,
        result,
        findNoteSpan,
        wait,
        recordAction,
        recordElimination,
        cellLabel,
      });
    }

    // Redraw affected cells
    const affected = new Set(result.targets.map((lc) => lc.cell));
    for (const cellIdx of affected) {
      const cellEl = gs.gridEl?.children[cellIdx] as HTMLElement | undefined;
      if (cellEl) updateCellDisplay(cellEl, gs.cellsData[cellIdx]);
    }

    // Check for first-discovery: if this is the current encounter's technique and player's first kill.
    // _firstDiscoveryShown prevents duplicate toasts when CTM fires the same technique multiple times
    // in a single encounter (kills only increments in onWildComplete, not here).
    let isFirstDiscovery = false;
    if (!_firstDiscoveryShown) {
      try {
        const { getCurrentEncounter, getWildProfile } = await import('../wild/wildController');
        const enc = getCurrentEncounter();
        const prof = getWildProfile();
        if (enc && result.skillId === enc.technique) {
          const entry = prof.bestiary[enc.technique];
          if (entry && entry.kills === 0) {
            isFirstDiscovery = true;
            _firstDiscoveryShown = true;
          }
        }
      } catch {
        /* not in wild mode — safe to ignore */
      }
    }

    if (isFirstDiscovery) {
      showFeedback(
        t('wildRuntime.firstDiscovery', { name: result.skillName, count: String(result.targets.length) }),
        'success',
      );
    } else {
      showFeedback(t('skills.elimCount', { count: String(result.targets.length) }), 'success');
    }
    exitCandidateTracking();
    saveGameStatus();
  } finally {
    _casting = false;
  }
}

/** Exit CTM and restore numpad. */
export function exitCandidateTracking(): void {
  gs.candidateTracking = { active: false, digit: 0, nodes: [] };
  _preview = null;
  clearTrackingClasses();
  clearChainPreview();
  hideTrackingPanel();
}

/** Reset per-encounter transient flags. Call when a new wild encounter starts. */
export function resetTrackingEncounterState(): void {
  _firstDiscoveryShown = false;
}

/** Refresh constraint map: apply/remove data-ccount and constraint-map-on class across all cells. */
export function refreshConstraintMap(): void {
  if (!gs.gridEl) return;
  const active = gs.constraintMapEnabled;
  gs.gridEl.classList.toggle('constraint-map-on', active);
  for (let i = 0; i < 81; i++) {
    const cell = gs.cellsData[i];
    const el = gs.gridEl.children[i] as HTMLElement;
    if (!el) continue;
    if (!active || cell.value !== 0) {
      el.removeAttribute('data-ccount');
    } else {
      el.setAttribute('data-ccount', String(Math.min(cell.notes.length, 5)));
    }
  }
}
