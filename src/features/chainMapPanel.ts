// Chain Map Panel — V3 Phase 2A
// SVG overlay on #grid showing strong/weak link network for selected digits.
// Digit filter chips [1-9] (max 3 simultaneous) + link type toggles.
// Uses percentage-based viewBox (0-100) so SVG auto-scales with grid — no ResizeObserver needed.

import { gs } from '../game/state';
import { SK } from '../storage/keys';
import { SolverBoard } from '../solver/board';
import { buildLinkGraph, decodeNode } from '../solver/helpers/links';
import type { LinkGraph } from '../solver/helpers/links';

// ── Module state ──────────────────────────────────────────────────────

let _mapGraph: LinkGraph | null = null;
let _svgEl: SVGSVGElement | null = null;
let _selectedDigits = new Set<number>();
let _showStrong = true;
let _showWeak = false;

const MAX_SIMULTANEOUS_DIGITS = 3;

function getMapGraph(): LinkGraph {
  if (!_mapGraph && gs.cellsData.length > 0) {
    const board = SolverBoard.fromGameState(gs.cellsData);
    _mapGraph = buildLinkGraph(board);
  }
  return _mapGraph ?? { strong: new Map(), weak: new Map() };
}

// ── Settings ──────────────────────────────────────────────────────────

export function isChainMapPanelEnabled(): boolean {
  return localStorage.getItem(SK.CHAIN_MAP_PANEL) === '1';
}

export function setChainMapPanelEnabled(enabled: boolean): void {
  localStorage.setItem(SK.CHAIN_MAP_PANEL, enabled ? '1' : '0');
  if (!enabled && gs.chainMapPanelOpen) closeChainMapPanel();
}

// ── Open / Close ──────────────────────────────────────────────────────

export function openChainMapPanel(): void {
  if (!isChainMapPanelEnabled() || gs.chainMapPanelOpen) return;

  // Mutual exclusion: close any open sibling panels
  if (gs.strongLinkPanelOpen) {
    gs.strongLinkPanelOpen = false;
    gs.slFocusCell = null;
    document.getElementById('sl-panel')?.classList.add('hidden');
    clearGridClasses(['sl-partner'], ['sl-digit-highlight']);
  }
  if (gs.chainTracePanelOpen) {
    gs.chainTracePanelOpen = false;
    gs.chainTraceNodes = [];
    document.getElementById('chain-trace-panel')?.classList.add('hidden');
    clearGridClasses(
      ['chain-node', 'chain-valid-strong', 'chain-valid-weak', 'chain-elim'],
      ['chain-node-digit', 'chain-valid-digit', 'chain-elim-digit'],
    );
  }

  gs.chainMapPanelOpen = true;
  _selectedDigits = new Set();
  _showStrong = true;
  _showWeak = false;
  _mapGraph = null; // fresh graph on open

  document.getElementById('numpad')?.classList.add('hidden');
  document.getElementById('chain-map-panel')?.classList.remove('hidden');

  ensureSvgOverlay();
  syncChipStates();
  syncLinkTypeButtons();
  syncStats();
}

export function closeChainMapPanel(): void {
  if (!gs.chainMapPanelOpen) return;
  gs.chainMapPanelOpen = false;

  document.getElementById('numpad')?.classList.remove('hidden');
  document.getElementById('chain-map-panel')?.classList.add('hidden');
  removeSvgOverlay();
}

// ── SVG Overlay ───────────────────────────────────────────────────────

function ensureSvgOverlay(): void {
  const gridEl = gs.gridEl;
  if (!gridEl) return;
  removeSvgOverlay();
  gridEl.style.position = 'relative';
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.id = 'chain-link-svg';
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:3;overflow:visible';
  gridEl.appendChild(svg);
  _svgEl = svg;
}

function removeSvgOverlay(): void {
  document.getElementById('chain-link-svg')?.remove();
  _svgEl = null;
}

/** Cell center in viewBox (0-100) percentage space — works for equal-size 9×9 grid */
function cellPct(idx: number): { x: number; y: number } {
  return {
    x: (((idx % 9) + 0.5) / 9) * 100,
    y: ((Math.floor(idx / 9) + 0.5) / 9) * 100,
  };
}

// ── Digit chip interaction ────────────────────────────────────────────

export function toggleMapDigit(digit: number): void {
  if (_selectedDigits.has(digit)) {
    _selectedDigits.delete(digit);
  } else {
    if (_selectedDigits.size >= MAX_SIMULTANEOUS_DIGITS) {
      // Evict the oldest (first inserted) digit
      const first = _selectedDigits.values().next().value as number;
      _selectedDigits.delete(first);
    }
    _selectedDigits.add(digit);
  }
  syncChipStates();
  redrawLinks();
  syncStats();
}

export function toggleMapLinkType(type: 'strong' | 'weak'): void {
  if (type === 'strong') _showStrong = !_showStrong;
  else _showWeak = !_showWeak;
  syncLinkTypeButtons();
  redrawLinks();
  syncStats();
}

// ── Link Drawing ──────────────────────────────────────────────────────

function redrawLinks(): void {
  if (!_svgEl) return;
  _svgEl.innerHTML = '';
  if (_selectedDigits.size === 0) return;

  const graph = getMapGraph();
  const drawn = new Set<string>();

  // Strong links: use graph.strong, same-digit pairs only
  if (_showStrong) {
    graph.strong.forEach((targets, nodeA) => {
      const { cell: cA, digit: dA } = decodeNode(nodeA);
      if (!_selectedDigits.has(dA)) return;
      targets.forEach((nodeB) => {
        const { cell: cB, digit: dB } = decodeNode(nodeB);
        if (dB !== dA) return; // same-digit only for Phase 2A
        const key = `${Math.min(cA, cB)}-${Math.max(cA, cB)}-${dA}-s`;
        if (drawn.has(key)) return;
        drawn.add(key);
        drawLine(cA, cB, 'strong');
      });
    });
  }

  // Weak links: same-digit only
  if (_showWeak) {
    graph.weak.forEach((targets, nodeA) => {
      const { cell: cA, digit: dA } = decodeNode(nodeA);
      if (!_selectedDigits.has(dA)) return;
      targets.forEach((nodeB) => {
        const { cell: cB, digit: dB } = decodeNode(nodeB);
        if (dB !== dA) return;
        const key = `${Math.min(cA, cB)}-${Math.max(cA, cB)}-${dA}-w`;
        if (drawn.has(key)) return;
        drawn.add(key);
        drawLine(cA, cB, 'weak');
      });
    });
  }
}

function drawLine(cA: number, cB: number, type: 'strong' | 'weak'): void {
  if (!_svgEl) return;
  const a = cellPct(cA);
  const b = cellPct(cB);
  const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  line.setAttribute('x1', a.x.toFixed(2));
  line.setAttribute('y1', a.y.toFixed(2));
  line.setAttribute('x2', b.x.toFixed(2));
  line.setAttribute('y2', b.y.toFixed(2));
  if (type === 'strong') {
    line.setAttribute('stroke', 'var(--accent-strong, #0984E3)');
    line.setAttribute('stroke-width', '1.8');
    line.setAttribute('opacity', '0.7');
    line.setAttribute('stroke-linecap', 'round');
  } else {
    line.setAttribute('stroke', '#a78bfa');
    line.setAttribute('stroke-width', '1.2');
    line.setAttribute('stroke-dasharray', '3 2.5');
    line.setAttribute('opacity', '0.5');
    line.setAttribute('stroke-linecap', 'round');
  }
  _svgEl.appendChild(line);
}

// ── UI Sync ───────────────────────────────────────────────────────────

function syncChipStates(): void {
  document.querySelectorAll('.chain-map-chip').forEach((chip) => {
    const d = Number((chip as HTMLElement).dataset.digit);
    chip.classList.toggle('active', _selectedDigits.has(d));
  });
}

function syncLinkTypeButtons(): void {
  document.getElementById('chain-map-strong-btn')?.classList.toggle('active', _showStrong);
  document.getElementById('chain-map-weak-btn')?.classList.toggle('active', _showWeak);
}

function syncStats(): void {
  const el = document.getElementById('chain-map-stats');
  if (!el) return;
  if (_selectedDigits.size === 0) {
    el.textContent = '點擊數字查看鏈結（最多 3 個）';
    return;
  }
  const graph = getMapGraph();
  let sc = 0,
    wc = 0;
  const counted = new Set<string>();
  graph.strong.forEach((targets, nodeA) => {
    const { cell: cA, digit: dA } = decodeNode(nodeA);
    if (!_selectedDigits.has(dA)) return;
    targets.forEach((nodeB) => {
      const { cell: cB, digit: dB } = decodeNode(nodeB);
      if (dB !== dA) return;
      const k = `${Math.min(cA, cB)}-${Math.max(cA, cB)}-${dA}`;
      if (!counted.has(k)) {
        counted.add(k);
        sc++;
      }
    });
  });
  if (_showWeak) {
    const wCounted = new Set<string>();
    graph.weak.forEach((targets, nodeA) => {
      const { cell: cA, digit: dA } = decodeNode(nodeA);
      if (!_selectedDigits.has(dA)) return;
      targets.forEach((nodeB) => {
        const { cell: cB, digit: dB } = decodeNode(nodeB);
        if (dB !== dA) return;
        const k = `${Math.min(cA, cB)}-${Math.max(cA, cB)}-${dA}`;
        if (!wCounted.has(k)) {
          wCounted.add(k);
          wc++;
        }
      });
    });
  }
  const parts = [`強鏈 ${sc} 條`];
  if (_showWeak) parts.push(`弱鏈 ${wc} 條`);
  el.textContent = `數字 [${[...Array.from(_selectedDigits)].join(' ')}] · ` + parts.join(' · ');
}

// ── Grid class helpers ────────────────────────────────────────────────

function clearGridClasses(cellClasses: string[], noteClasses: string[]): void {
  if (!gs.gridEl) return;
  Array.from(gs.gridEl.children).forEach((c) => {
    c.classList.remove(...cellClasses);
    c.querySelectorAll(noteClasses.map((cls) => `.${cls}`).join(',')).forEach((n) =>
      n.classList.remove(...noteClasses),
    );
  });
}

// ── Init ──────────────────────────────────────────────────────────────

export function initChainMapPanel(): void {
  // no-op: handles removed, swipe gesture is the only entry point
}
