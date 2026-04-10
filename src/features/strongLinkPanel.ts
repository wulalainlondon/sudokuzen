// Strong Link Explorer panel — V1
// Pause-screen opt-in (default OFF). When enabled, a swipe handle appears above
// the numpad. Tapping it (or swiping up) opens the SL panel over the numpad.
// Tapping a grid cell shows that cell's conjugate pair partners highlighted.

import { gs } from '../game/state';
import { SK } from '../storage/keys';
import { SolverBoard } from '../solver/board';
import { getConjugatePartnersForCell } from '../solver/helpers/links';

// ── Settings ─────────────────────────────────────────────────────────

export function isSlPanelEnabled(): boolean {
  return localStorage.getItem(SK.STRONG_LINK_PANEL) === '1';
}

export function setSlPanelEnabled(enabled: boolean): void {
  localStorage.setItem(SK.STRONG_LINK_PANEL, enabled ? '1' : '0');
  if (!enabled && gs.strongLinkPanelOpen) closeSlPanel();
}

// ── Open / Close ─────────────────────────────────────────────────────

export function openSlPanel(): void {
  if (!isSlPanelEnabled() || gs.strongLinkPanelOpen) return;
  // Mutual exclusion: close chain trace panel if open
  if (gs.chainTracePanelOpen) {
    gs.chainTracePanelOpen = false;
    gs.chainTraceNodes = [];
    document.getElementById('chain-trace-panel')?.classList.add('hidden');
  }
  // Mutual exclusion: close chain map panel if open
  if (gs.chainMapPanelOpen) {
    gs.chainMapPanelOpen = false;
    document.getElementById('chain-map-panel')?.classList.add('hidden');
    document.getElementById('chain-link-svg')?.remove();
  }
  gs.strongLinkPanelOpen = true;
  gs.strongLinkToolUsed = true;

  document.getElementById('numpad')?.classList.add('hidden');
  const panel = document.getElementById('sl-panel');
  if (panel) panel.classList.remove('hidden');

  // Reset panel state
  const instructionEl = document.getElementById('sl-instruction');
  const feedbackEl = document.getElementById('sl-feedback');
  if (instructionEl) instructionEl.textContent = '點擊格子查看強鏈伴侶';
  if (feedbackEl) feedbackEl.textContent = '';
}

export function closeSlPanel(): void {
  if (!gs.strongLinkPanelOpen) return;
  gs.strongLinkPanelOpen = false;
  gs.slFocusCell = null;

  document.getElementById('numpad')?.classList.remove('hidden');
  document.getElementById('sl-panel')?.classList.add('hidden');
  clearSlHighlights();
}

// ── Cell Focus ────────────────────────────────────────────────────────

export function onSlCellFocus(cellIdx: number): void {
  if (!gs.strongLinkPanelOpen) return;
  gs.slFocusCell = cellIdx;
  clearSlHighlights();

  const board = SolverBoard.fromGameState(gs.cellsData);
  const partners = getConjugatePartnersForCell(cellIdx, board);

  const instructionEl = document.getElementById('sl-instruction');
  const feedbackEl = document.getElementById('sl-feedback');

  if (partners.length === 0) {
    if (instructionEl) instructionEl.textContent = '此格無強鏈候選';
    if (feedbackEl) feedbackEl.textContent = '選擇有候選數字的空格';
    return;
  }

  // Highlight partner cells and matching note digits
  if (gs.gridEl) {
    Array.from(gs.gridEl.children).forEach((c, i) => {
      const matchingPartners = partners.filter((p) => p.partnerCell === i);
      if (matchingPartners.length > 0) {
        c.classList.add('sl-partner');
        for (const p of matchingPartners) {
          c.querySelector(`.note-num:nth-child(${p.digit})`)?.classList.add('sl-digit-highlight');
        }
      }
      // Highlight the contributing digits in the focused cell too
      if (i === cellIdx) {
        for (const p of partners) {
          c.querySelector(`.note-num:nth-child(${p.digit})`)?.classList.add('sl-digit-highlight');
        }
      }
    });
  }

  // Build feedback text grouped by digit
  const unitLabel: Record<string, string> = { row: '行', col: '列', box: '宮' };
  const byDigit = new Map<number, string[]>();
  for (const p of partners) {
    if (!byDigit.has(p.digit)) byDigit.set(p.digit, []);
    byDigit.get(p.digit)!.push(unitLabel[p.unitType]);
  }

  const descriptions: string[] = [];
  byDigit.forEach((units, digit) => {
    descriptions.push(`${digit}：${units.join('+')} 強鏈`);
  });

  if (instructionEl) instructionEl.textContent = `找到 ${partners.length} 條強鏈`;
  if (feedbackEl) feedbackEl.textContent = descriptions.join('　');
}

// ── Helpers ───────────────────────────────────────────────────────────

export function clearSlHighlights(): void {
  if (!gs.gridEl) return;
  Array.from(gs.gridEl.children).forEach((c) => {
    c.classList.remove('sl-partner');
    c.querySelectorAll('.sl-digit-highlight').forEach((n) => n.classList.remove('sl-digit-highlight'));
  });
}

// ── Init (called once at boot) ────────────────────────────────────────

export function initSlPanel(): void {
  // Swipe gesture on numpad-skill-wrapper
  const wrapper = document.querySelector('.numpad-skill-wrapper') as HTMLElement | null;
  if (!wrapper) return;

  let touchStartY = 0;
  wrapper.addEventListener(
    'touchstart',
    (e) => {
      touchStartY = (e as TouchEvent).touches[0].clientY;
    },
    { passive: true },
  );
  wrapper.addEventListener(
    'touchend',
    (e) => {
      const deltaY = (e as TouchEvent).changedTouches[0].clientY - touchStartY;
      if (deltaY < -40 && isSlPanelEnabled() && !gs.strongLinkPanelOpen) {
        openSlPanel();
      } else if (deltaY > 40 && gs.strongLinkPanelOpen) {
        closeSlPanel();
      }
    },
    { passive: true },
  );
}
