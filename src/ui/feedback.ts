// Toast feedback and visual error effects

import { gs } from '../game/state';

export function showFeedback(msg: string, tone: 'neutral' | 'success' | 'error' = 'neutral'): void {
  if (!gs.feedbackToast) return;
  clearTimeout(gs.feedbackTimer!);
  gs.feedbackToast.textContent = msg;
  gs.feedbackToast.classList.remove('success', 'error');
  if (tone === 'success') gs.feedbackToast.classList.add('success');
  if (tone === 'error') gs.feedbackToast.classList.add('error');
  gs.feedbackToast.classList.add('show');
  gs.feedbackTimer = setTimeout(() => {
    gs.feedbackToast!.classList.remove('show');
  }, 900);
}

export function markErrorArea(idx: number): void {
  if (!gs.gridEl) return;
  const row = Math.floor(idx / 9);
  const col = idx % 9;
  const box = Math.floor(row / 3) * 3 + Math.floor(col / 3);
  Array.from(gs.gridEl.children).forEach((c, i) => {
    const r = Math.floor(i / 9);
    const cc = i % 9;
    const b = Math.floor(r / 3) * 3 + Math.floor(cc / 3);
    if (i === idx) {
      c.classList.add('error-strong');
      return;
    }
    if (r === row || cc === col || b === box) {
      c.classList.add('error-peer');
    }
  });
  gs.livesEl?.classList.remove('hit');
  void gs.livesEl?.offsetWidth;
  gs.livesEl?.classList.add('hit');
  setTimeout(() => {
    Array.from(gs.gridEl!.children).forEach((c) => c.classList.remove('error-strong', 'error-peer'));
    gs.livesEl?.classList.remove('hit');
  }, 650);
}
