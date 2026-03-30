// Cast choreography system — per-skill visual sequences during cast.
// Each skill can register a custom choreography; unregistered skills use the default.

import type { SkillPreview } from './types';

// ── Types ────────────────────────────────────────────────────────────

export type CastContext = {
  gridEl: HTMLElement;
  result: SkillPreview;
  findNoteSpan: (cellEl: HTMLElement, digit: number) => HTMLElement | null;
  wait: (ms: number) => Promise<void>;
  recordAction: (type: string, detail: string, idx: number | null, val: number | null, notes: number[] | null) => void;
  recordElimination: () => void;
  cellLabel: (idx: number) => string;
};

export type CastChoreography = (ctx: CastContext) => Promise<void>;

// ── Registry ─────────────────────────────────────────────────────────

const choreographyMap = new Map<string, CastChoreography>();

export function registerChoreography(skillId: string, fn: CastChoreography): void {
  choreographyMap.set(skillId, fn);
}

export function getChoreography(skillId: string): CastChoreography {
  return choreographyMap.get(skillId) ?? defaultChoreography;
}

// ── SVG helpers ──────────────────────────────────────────────────────

function getCellCenter(gridEl: HTMLElement, cellIdx: number): { x: number; y: number } | null {
  const el = gridEl.children[cellIdx] as HTMLElement | undefined;
  if (!el) return null;
  const gr = gridEl.getBoundingClientRect();
  const cr = el.getBoundingClientRect();
  return { x: cr.left + cr.width / 2 - gr.left, y: cr.top + cr.height / 2 - gr.top };
}

function createCastSVG(gridEl: HTMLElement): SVGSVGElement {
  // Remove any existing cast SVG
  document.getElementById('skill-cast-svg')?.remove();
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.id = 'skill-cast-svg';
  svg.setAttribute('class', 'skill-connection-svg');
  const gr = gridEl.getBoundingClientRect();
  svg.setAttribute('width', String(gr.width));
  svg.setAttribute('height', String(gr.height));
  gridEl.style.position = 'relative';
  gridEl.appendChild(svg);
  return svg;
}

function addSVGLine(
  svg: SVGSVGElement,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  cls: string,
  delay = 0,
): SVGLineElement {
  const l = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  l.setAttribute('x1', String(x1));
  l.setAttribute('y1', String(y1));
  l.setAttribute('x2', String(x2));
  l.setAttribute('y2', String(y2));
  l.setAttribute('class', cls);
  if (delay > 0) l.style.animationDelay = `${delay}ms`;
  svg.appendChild(l);
  return l;
}

function removeCastSVG(): void {
  document.getElementById('skill-cast-svg')?.remove();
}

function centroid(gridEl: HTMLElement, cells: number[]): { x: number; y: number } {
  let sx = 0,
    sy = 0,
    n = 0;
  for (const c of cells) {
    const p = getCellCenter(gridEl, c);
    if (p) {
      sx += p.x;
      sy += p.y;
      n++;
    }
  }
  return n > 0 ? { x: sx / n, y: sy / n } : { x: 0, y: 0 };
}

// ── Shared: record + strike targets ──────────────────────────────────

function recordTargets(ctx: CastContext): void {
  const { result, cellLabel: cl, recordAction, recordElimination } = ctx;
  for (const t of result.targets) {
    recordAction('skill_eliminate', `${cl(t.cell)} ${result.skillName}消去候選 ${t.digit}`, t.cell, t.digit, null);
    recordElimination();
  }
}

async function strikeTargets(ctx: CastContext, stagger: number, strikeClass: string, elimClass: string): Promise<void> {
  const { gridEl, result, findNoteSpan, wait } = ctx;
  for (let i = 0; i < result.targets.length; i++) {
    const t = result.targets[i];
    const cellEl = gridEl.children[t.cell] as HTMLElement | undefined;
    if (!cellEl) continue;
    cellEl.classList.add(strikeClass);
    const noteSpan = findNoteSpan(cellEl, t.digit);
    if (noteSpan) noteSpan.classList.add(elimClass);
    if (i < result.targets.length - 1) await wait(stagger);
  }
}

function cleanupAll(gridEl: HTMLElement, extraClasses: string[] = []): void {
  const allClasses = [
    'skill-strike',
    'skill-strike-inward',
    'skill-source-pulse',
    'skill-pair-bond',
    'skill-lock-digit-ring',
    'skill-weave-anchor',
    'skill-weave-anchor-1',
    'skill-weave-anchor-2',
    'skill-reveal-digit',
    'skill-noise-digit',
    'skill-purify-pulse',
    ...extraClasses,
  ];
  Array.from(gridEl.children).forEach((c) => {
    for (const cls of allClasses) c.classList.remove(cls);
  });
  // Also clean up note-num highlights
  gridEl.querySelectorAll('.skill-lock-digit-ring, .skill-reveal-digit, .skill-noise-digit').forEach((el) => {
    for (const cls of allClasses) el.classList.remove(cls);
  });
  removeCastSVG();
}

// ── Default choreography (current generic animation) ─────────────────

export const defaultChoreography: CastChoreography = async (ctx) => {
  const { gridEl, result, wait } = ctx;

  // Phase 1: Source cells pulse
  for (const src of result.sourceCells) {
    gridEl.children[src]?.classList.add('skill-source-pulse');
  }
  const svgLines = document.querySelectorAll('.skill-line');
  svgLines.forEach((l) => l.classList.add('skill-line-flash'));
  await wait(200);

  // Phase 2: Staggered digit-level strike
  document.getElementById('skill-connection-svg')?.remove();
  recordTargets(ctx);
  await strikeTargets(ctx, 100, 'skill-strike', 'skill-elim-digit');

  // Wait for vanish
  await wait(650);
  cleanupAll(gridEl);
};

// ── Naked Pair: "Twin Lock" (雙契鎖定) ──────────────────────────────

const nakedPairChoreography: CastChoreography = async (ctx) => {
  const { gridEl, result, wait, findNoteSpan } = ctx;
  const [a, b] = result.sourceCells;

  // Phase 1: Bond pulse between the two cells (synchronized)
  gridEl.children[a]?.classList.add('skill-pair-bond');
  gridEl.children[b]?.classList.add('skill-pair-bond');

  // Highlight the locked digits inside source cells
  for (const src of [a, b]) {
    const cellEl = gridEl.children[src] as HTMLElement | undefined;
    if (!cellEl) continue;
    for (const d of result.digits ?? []) {
      const span = findNoteSpan(cellEl, d);
      if (span) span.classList.add('skill-lock-digit-ring');
    }
  }

  // Bond connection line
  const svg = createCastSVG(gridEl);
  const pA = getCellCenter(gridEl, a);
  const pB = getCellCenter(gridEl, b);
  if (pA && pB) {
    addSVGLine(svg, pA.x, pA.y, pB.x, pB.y, 'skill-line skill-line-bond');
  }
  await wait(400);

  // Phase 2: Sweep lines from midpoint to targets
  const mid = centroid(gridEl, [a, b]);
  for (let i = 0; i < result.targets.length; i++) {
    const t = result.targets[i];
    const pt = getCellCenter(gridEl, t.cell);
    if (pt) addSVGLine(svg, mid.x, mid.y, pt.x, pt.y, 'skill-line skill-line-sweep', i * 60);
  }
  await wait(200);

  // Phase 3: Strike targets
  recordTargets(ctx);
  await strikeTargets(ctx, 80, 'skill-strike', 'skill-elim-digit');

  await wait(650);
  cleanupAll(gridEl);
};

// ── Naked Triple: "Weave" (編織) ────────────────────────────────────

const nakedTripleChoreography: CastChoreography = async (ctx) => {
  const { gridEl, result, wait, findNoteSpan } = ctx;
  const [a, b, c] = result.sourceCells;

  // Phase 1: Sequential anchor lighting (1-2-3 count-in)
  gridEl.children[a]?.classList.add('skill-weave-anchor');
  await wait(100);
  gridEl.children[b]?.classList.add('skill-weave-anchor', 'skill-weave-anchor-1');
  await wait(100);
  gridEl.children[c]?.classList.add('skill-weave-anchor', 'skill-weave-anchor-2');

  // Phase 2: Triangle connection lines draw in
  const svg = createCastSVG(gridEl);
  const pA = getCellCenter(gridEl, a);
  const pB = getCellCenter(gridEl, b);
  const pC = getCellCenter(gridEl, c);
  if (pA && pB && pC) {
    addSVGLine(svg, pA.x, pA.y, pB.x, pB.y, 'skill-line skill-line-weave', 0);
    addSVGLine(svg, pB.x, pB.y, pC.x, pC.y, 'skill-line skill-line-weave', 80);
    addSVGLine(svg, pC.x, pC.y, pA.x, pA.y, 'skill-line skill-line-weave', 160);
  }
  await wait(350);

  // Phase 3: Highlight union digits in all 3 source cells
  for (const src of [a, b, c]) {
    const cellEl = gridEl.children[src] as HTMLElement | undefined;
    if (!cellEl) continue;
    for (const d of result.digits ?? []) {
      const span = findNoteSpan(cellEl, d);
      if (span) span.classList.add('skill-lock-digit-ring');
    }
  }
  await wait(300);

  // Phase 4: Sweep from triangle centroid to targets
  const center = centroid(gridEl, [a, b, c]);
  for (let i = 0; i < result.targets.length; i++) {
    const t = result.targets[i];
    const pt = getCellCenter(gridEl, t.cell);
    if (pt) addSVGLine(svg, center.x, center.y, pt.x, pt.y, 'skill-line skill-line-sweep', i * 50);
  }
  await wait(200);

  // Phase 5: Strike targets
  recordTargets(ctx);
  await strikeTargets(ctx, 80, 'skill-strike', 'skill-elim-digit');

  await wait(650);
  cleanupAll(gridEl);
};

// ── Hidden Pair: "Reveal" (藏雙現形) ────────────────────────────────

const hiddenPairChoreography: CastChoreography = async (ctx) => {
  const { gridEl, result, wait, findNoteSpan } = ctx;
  const [a, b] = result.sourceCells;

  // Phase 1: Source cells glow — the hidden pair emerges
  gridEl.children[a]?.classList.add('skill-pair-bond');
  gridEl.children[b]?.classList.add('skill-pair-bond');

  // Reveal the hidden pair digits (they "emerge")
  for (const src of [a, b]) {
    const cellEl = gridEl.children[src] as HTMLElement | undefined;
    if (!cellEl) continue;
    for (const d of result.digits ?? []) {
      const span = findNoteSpan(cellEl, d);
      if (span) span.classList.add('skill-reveal-digit');
    }
  }
  await wait(400);

  // Phase 2: Mark noise digits (amber warning)
  for (const t of result.targets) {
    const cellEl = gridEl.children[t.cell] as HTMLElement | undefined;
    if (!cellEl) continue;
    const span = findNoteSpan(cellEl, t.digit);
    if (span) span.classList.add('skill-noise-digit');
  }
  await wait(300);

  // Phase 3: Inward strike — remove noise
  recordTargets(ctx);
  await strikeTargets(ctx, 80, 'skill-strike-inward', 'skill-elim-digit');

  await wait(650);

  // Phase 4: Purify pulse — source cells glow to show only pair remains
  gridEl.children[a]?.classList.add('skill-purify-pulse');
  gridEl.children[b]?.classList.add('skill-purify-pulse');
  await wait(400);

  cleanupAll(gridEl);
};

// ── Hidden Triple: "Undercurrent" (隱流浮現) ────────────────────────

const hiddenTripleChoreography: CastChoreography = async (ctx) => {
  const { gridEl, result, wait, findNoteSpan } = ctx;
  const [a, b, c] = result.sourceCells;

  // Phase 1: Sequential anchor lighting
  gridEl.children[a]?.classList.add('skill-weave-anchor');
  await wait(100);
  gridEl.children[b]?.classList.add('skill-weave-anchor', 'skill-weave-anchor-1');
  await wait(100);
  gridEl.children[c]?.classList.add('skill-weave-anchor', 'skill-weave-anchor-2');

  // Triangle connection
  const svg = createCastSVG(gridEl);
  const pA = getCellCenter(gridEl, a);
  const pB = getCellCenter(gridEl, b);
  const pC = getCellCenter(gridEl, c);
  if (pA && pB && pC) {
    addSVGLine(svg, pA.x, pA.y, pB.x, pB.y, 'skill-line skill-line-weave', 0);
    addSVGLine(svg, pB.x, pB.y, pC.x, pC.y, 'skill-line skill-line-weave', 80);
    addSVGLine(svg, pC.x, pC.y, pA.x, pA.y, 'skill-line skill-line-weave', 160);
  }
  await wait(350);

  // Phase 2: Reveal hidden digits
  for (const src of [a, b, c]) {
    const cellEl = gridEl.children[src] as HTMLElement | undefined;
    if (!cellEl) continue;
    for (const d of result.digits ?? []) {
      const span = findNoteSpan(cellEl, d);
      if (span) span.classList.add('skill-reveal-digit');
    }
  }
  await wait(400);

  // Phase 3: Mark noise digits
  for (const t of result.targets) {
    const cellEl = gridEl.children[t.cell] as HTMLElement | undefined;
    if (!cellEl) continue;
    const span = findNoteSpan(cellEl, t.digit);
    if (span) span.classList.add('skill-noise-digit');
  }
  await wait(300);

  // Phase 4: Inward strike
  recordTargets(ctx);
  await strikeTargets(ctx, 80, 'skill-strike-inward', 'skill-elim-digit');

  await wait(650);

  // Phase 5: Purify
  for (const src of [a, b, c]) {
    gridEl.children[src]?.classList.add('skill-purify-pulse');
  }
  await wait(400);

  cleanupAll(gridEl);
  removeCastSVG();
};

// ── Naked Single: "Clear Eye" (明眼·快斬) ────────────────────────────

const nakedSingleChoreography: CastChoreography = async (ctx) => {
  const { gridEl, result, wait } = ctx;
  const idx = result.sourceCells[0];
  const cellEl = gridEl.children[idx] as HTMLElement | undefined;
  if (!cellEl) return;

  // Quick flash — the single candidate "crystallises" into the answer
  cellEl.classList.add('skill-quickcast-flash');
  recordTargets(ctx);
  await wait(250);
  cleanupAll(gridEl, ['skill-quickcast-flash']);
};

// ── Hidden Single: "Dark Eye" (暗眼·快斬) ────────────────────────────

const hiddenSingleChoreography: CastChoreography = async (ctx) => {
  const { gridEl, result, wait, findNoteSpan } = ctx;
  const idx = result.sourceCells[0];
  const cellEl = gridEl.children[idx] as HTMLElement | undefined;
  if (!cellEl) return;

  // Phase 1: Reveal — the hidden digit glows to life
  const keepDigit = result.digits?.[0];
  if (keepDigit) {
    const keepSpan = findNoteSpan(cellEl, keepDigit);
    if (keepSpan) keepSpan.classList.add('skill-reveal-digit');
  }
  cellEl.classList.add('skill-source-pulse');
  await wait(300);

  // Phase 2: Mark noise digits (the ones being eliminated)
  for (const t of result.targets) {
    const span = findNoteSpan(cellEl, t.digit);
    if (span) span.classList.add('skill-noise-digit');
  }
  await wait(200);

  // Phase 3: Inward strike — sweep away non-hidden candidates
  recordTargets(ctx);
  await strikeTargets(ctx, 60, 'skill-strike-inward', 'skill-elim-digit');
  await wait(400);

  cleanupAll(gridEl);
};

// ── Register all choreographies ──────────────────────────────────────

registerChoreography('naked_single', nakedSingleChoreography);
registerChoreography('hidden_single', hiddenSingleChoreography);
registerChoreography('naked_pair', nakedPairChoreography);
registerChoreography('naked_triple', nakedTripleChoreography);
registerChoreography('hidden_pair', hiddenPairChoreography);
registerChoreography('hidden_triple', hiddenTripleChoreography);
