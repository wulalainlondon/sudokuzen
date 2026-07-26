// Toast feedback and visual error effects

import { gs } from '../game/state';

function ensureFeedbackToast(): HTMLDivElement {
  const existing = gs.feedbackToast ?? (document.getElementById('feedback-toast') as HTMLDivElement | null);
  if (existing) {
    gs.feedbackToast = existing;
    return existing;
  }

  const toast = document.createElement('div');
  toast.id = 'feedback-toast';
  document.body.appendChild(toast);
  gs.feedbackToast = toast;
  return toast;
}

export function showFeedback(msg: string, tone: 'neutral' | 'success' | 'error' = 'neutral', durationMs = 900): void {
  const toast = ensureFeedbackToast();
  clearTimeout(gs.feedbackTimer!);
  toast.textContent = msg;
  toast.classList.remove('success', 'error');
  if (tone === 'success') toast.classList.add('success');
  if (tone === 'error') toast.classList.add('error');
  toast.classList.add('show');
  gs.feedbackTimer = setTimeout(
    () => {
      toast.classList.remove('show');
    },
    Math.max(900, durationMs),
  );
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
