// Chain Trace Panel — V3 Phase 1
// Text-based chain building + rule validation (Mode 3A).
// No SVG overlay yet — that's Phase 2.
//
// Interaction: tap a note-digit on grid → adds (cell, digit) node to chain.
// Chain alternates strong → weak → strong links (validated via buildLinkGraph).
// Mode 3A: verify button confirms alternation correctness, no eliminations shown.

import { gs } from '../game/state';
import { SK } from '../storage/keys';
import { SolverBoard } from '../solver/board';
import { buildLinkGraph, encodeNode, decodeNode } from '../solver/helpers/links';
import type { LinkGraph } from '../solver/helpers/links';

// ── Module-level graph cache ───────────────────────────────────────────

let _graph: LinkGraph | null = null;

function getGraph(): LinkGraph {
  if (!_graph && gs.cellsData.length > 0) {
    const board = SolverBoard.fromGameState(gs.cellsData);
    _graph = buildLinkGraph(board);
  }
  return _graph ?? { strong: new Map(), weak: new Map() };
}

function invalidateGraph(): void {
  _graph = null;
}

// ── Settings ──────────────────────────────────────────────────────────

export function isChainTracePanelEnabled(): boolean {
  return localStorage.getItem(SK.CHAIN_TRACE_PANEL) === '1';
}

export function setChainTracePanelEnabled(enabled: boolean): void {
  localStorage.setItem(SK.CHAIN_TRACE_PANEL, enabled ? '1' : '0');
  document.getElementById('chain-trace-handle')?.classList.toggle('hidden', !enabled);
  if (!enabled && gs.chainTracePanelOpen) closeChainTracePanel();
}

// ── Open / Close ──────────────────────────────────────────────────────

export function openChainTracePanel(): void {
  if (!isChainTracePanelEnabled() || gs.chainTracePanelOpen) return;
  // Mutual exclusion: close SL panel if open
  if (gs.strongLinkPanelOpen) {
    gs.strongLinkPanelOpen = false;
    document.getElementById('sl-panel')?.classList.add('hidden');
  }
  gs.chainTracePanelOpen = true;
  gs.chainTraceNodes = [];
  invalidateGraph();

  document.getElementById('numpad')?.classList.add('hidden');
  document.getElementById('chain-trace-handle')?.classList.add('hidden');
  document.getElementById('sl-swipe-handle')?.classList.add('hidden');
  document.getElementById('chain-trace-panel')?.classList.remove('hidden');

  resetPanelUI();
}

export function closeChainTracePanel(): void {
  if (!gs.chainTracePanelOpen) return;
  gs.chainTracePanelOpen = false;
  gs.chainTraceNodes = [];

  document.getElementById('numpad')?.classList.remove('hidden');
  document.getElementById('chain-trace-panel')?.classList.add('hidden');

  // Restore handles
  const slEnabled = localStorage.getItem(SK.STRONG_LINK_PANEL) === '1';
  if (slEnabled) document.getElementById('sl-swipe-handle')?.classList.remove('hidden');
  if (isChainTracePanelEnabled()) document.getElementById('chain-trace-handle')?.classList.remove('hidden');

  clearChainHighlights();
}

// ── Chain Building ────────────────────────────────────────────────────

export function onChainDigitTap(cell: number, digit: number): void {
  if (!gs.chainTracePanelOpen) return;
  const nodes = gs.chainTraceNodes;
  const graph = getGraph();
  const newNode = encodeNode(cell, digit);

  // Repeated node guard
  if (nodes.some((n) => n.cell === cell && n.digit === digit)) {
    setInstruction('此節點已在鏈中（不可重複）');
    return;
  }

  if (nodes.length === 0) {
    // Start node: must have at least one strong link to be a valid chain start
    if ((graph.strong.get(newNode)?.size ?? 0) === 0) {
      setInstruction('此候選無強鏈，無法作為起點');
      return;
    }
    nodes.push({ cell, digit });
    setInstruction('繼續點擊下一節點（強鏈）');
  } else {
    const last = nodes[nodes.length - 1];
    const lastNode = encodeNode(last.cell, last.digit);
    // Hop index 0 (1st→2nd) is strong, 1 (2nd→3rd) is weak, alternating
    const expectStrong = (nodes.length % 2) === 1;
    const linkMap = expectStrong ? graph.strong : graph.weak;

    if (!linkMap.get(lastNode)?.has(newNode)) {
      const needed = expectStrong ? '強鏈' : '弱鏈';
      setInstruction(`此節點與前節點無${needed}連接`);
      return;
    }
    nodes.push({ cell, digit });
    const nextExpectStrong = (nodes.length % 2) === 1;
    const nextType = nextExpectStrong ? '強鏈' : '弱鏈';
    const hint = nodes.length >= 3 ? `或按驗證` : '';
    setInstruction(`繼續選節點（${nextType}）${hint}`);
  }

  renderChainText();
  highlightValidNextNodes();
  syncVerifyButton();
}

export function undoChainTrace(): void {
  const nodes = gs.chainTraceNodes;
  if (nodes.length === 0) return;
  nodes.pop();
  if (nodes.length === 0) {
    resetPanelUI();
  } else {
    const nextExpectStrong = (nodes.length % 2) === 1;
    setInstruction(`已撤回 — 繼續選節點（${nextExpectStrong ? '強鏈' : '弱鏈'}）`);
    renderChainText();
    highlightValidNextNodes();
    syncVerifyButton();
  }
}

export function clearChainTrace(): void {
  gs.chainTraceNodes = [];
  invalidateGraph();
  clearChainHighlights();
  resetPanelUI();
}

// ── Mode 3A Validation ────────────────────────────────────────────────

export function verifyChainTrace(): void {
  const nodes = gs.chainTraceNodes;
  if (nodes.length < 3) {
    setInstruction('鏈至少需要 3 個節點才能驗證');
    return;
  }

  const graph = getGraph();
  for (let i = 0; i < nodes.length - 1; i++) {
    const a = encodeNode(nodes[i].cell, nodes[i].digit);
    const b = encodeNode(nodes[i + 1].cell, nodes[i + 1].digit);
    const isStrongHop = i % 2 === 0;
    if (!((isStrongHop ? graph.strong : graph.weak).get(a)?.has(b) ?? false)) {
      setInstruction(`✗ 第 ${i + 1}→${i + 2} 節點：應為${isStrongHop ? '強' : '弱'}鏈但連接不存在`);
      syncStats('');
      return;
    }
  }

  // Check ends on strong link (valid AIC: length of links = odd count, last hop index = even → strong)
  const lastHopIdx = nodes.length - 2;
  const endsOnStrong = lastHopIdx % 2 === 0;
  const chainType = resolveChainType(nodes);

  if (!endsOnStrong) {
    setInstruction(`鏈以弱鏈結尾 — 再加一強鏈節點完成 AIC`);
    syncStats(`鏈長 ${nodes.length} · ${chainType} · 未完成`);
    return;
  }

  const strongCount = Math.ceil((nodes.length - 1) / 2);
  const weakCount = Math.floor((nodes.length - 1) / 2);
  setInstruction(`✓ 合法鏈結！鏈長 ${nodes.length} · ${chainType}`);
  syncStats(`強鏈 ${strongCount} 條 · 弱鏈 ${weakCount} 條`);
}

function resolveChainType(nodes: Array<{ cell: number; digit: number }>): string {
  const digits = new Set(nodes.map((n) => n.digit));
  if (digits.size === 1) return `X-Chain（數字 ${[...digits][0]}）`;
  // Check bivalue bridge: same cell, different digits between consecutive nodes
  const hasBridge = nodes.some(
    (n, i) => i > 0 && i < nodes.length - 1 && nodes[i - 1].cell === n.cell && nodes[i + 1].cell === n.cell
  );
  return hasBridge ? 'AIC（含雙值橋）' : 'AIC';
}

// ── Grid Highlighting ─────────────────────────────────────────────────

function highlightValidNextNodes(): void {
  clearChainHighlights();
  const nodes = gs.chainTraceNodes;
  if (nodes.length === 0 || !gs.gridEl) return;

  // Mark current chain nodes
  nodes.forEach(({ cell, digit }) => {
    const cellEl = gs.gridEl!.children[cell] as HTMLElement | undefined;
    if (!cellEl) return;
    cellEl.classList.add('chain-node');
    cellEl.querySelector(`.note-num:nth-child(${digit})`)?.classList.add('chain-node-digit');
  });

  // Mark valid next nodes
  const last = nodes[nodes.length - 1];
  const lastCode = encodeNode(last.cell, last.digit);
  const graph = getGraph();
  const expectStrong = (nodes.length % 2) === 1;
  const nextSet = (expectStrong ? graph.strong : graph.weak).get(lastCode) ?? new Set<number>();
  const validCssClass = expectStrong ? 'chain-valid-strong' : 'chain-valid-weak';

  // Group by cell
  const byCellDigit = new Map<number, number[]>();
  nextSet.forEach((nodeCode) => {
    const { cell, digit } = decodeNode(nodeCode);
    // Skip cells already in chain
    if (nodes.some((n) => n.cell === cell && n.digit === digit)) return;
    if (!byCellDigit.has(cell)) byCellDigit.set(cell, []);
    byCellDigit.get(cell)!.push(digit);
  });

  byCellDigit.forEach((digits, cell) => {
    const cellEl = gs.gridEl!.children[cell] as HTMLElement | undefined;
    if (!cellEl) return;
    cellEl.classList.add(validCssClass);
    digits.forEach((d) => {
      cellEl.querySelector(`.note-num:nth-child(${d})`)?.classList.add('chain-valid-digit');
    });
  });
}

export function clearChainHighlights(): void {
  if (!gs.gridEl) return;
  Array.from(gs.gridEl.children).forEach((c) => {
    c.classList.remove('chain-node', 'chain-valid-strong', 'chain-valid-weak');
    c.querySelectorAll('.chain-node-digit, .chain-valid-digit').forEach((n) =>
      n.classList.remove('chain-node-digit', 'chain-valid-digit'),
    );
  });
}

// ── UI Helpers ────────────────────────────────────────────────────────

function cellLabel(idx: number): string {
  return `R${Math.floor(idx / 9) + 1}C${(idx % 9) + 1}`;
}

function renderChainText(): void {
  const textEl = document.getElementById('chain-trace-text');
  if (!textEl) return;
  const nodes = gs.chainTraceNodes;
  if (nodes.length === 0) { textEl.innerHTML = ''; return; }

  const parts: string[] = [];
  nodes.forEach(({ cell, digit }, i) => {
    parts.push(`<span class="ct-node">${cellLabel(cell)}(${digit})</span>`);
    if (i < nodes.length - 1) {
      const strong = i % 2 === 0;
      parts.push(strong
        ? '<span class="ct-strong">⟶强</span>'
        : '<span class="ct-weak">⇢弱</span>',
      );
    }
  });
  textEl.innerHTML = parts.join('');
  textEl.scrollLeft = textEl.scrollWidth;
}

function setInstruction(text: string): void {
  const el = document.getElementById('chain-trace-instruction');
  if (el) el.textContent = text;
}

function syncStats(text: string): void {
  const el = document.getElementById('chain-trace-stats');
  if (el) el.textContent = text;
}

function syncVerifyButton(): void {
  const btn = document.getElementById('chain-trace-verify-btn') as HTMLButtonElement | null;
  if (btn) btn.disabled = gs.chainTraceNodes.length < 3;
}

function resetPanelUI(): void {
  setInstruction('點擊格中候選數字開始建鏈');
  const textEl = document.getElementById('chain-trace-text');
  const statsEl = document.getElementById('chain-trace-stats');
  if (textEl) textEl.innerHTML = '';
  if (statsEl) statsEl.textContent = '';
  syncVerifyButton();
}

// ── Init ──────────────────────────────────────────────────────────────

export function initChainTracePanel(): void {
  document.getElementById('chain-trace-handle')?.classList.toggle('hidden', !isChainTracePanelEnabled());
}
