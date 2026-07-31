// Immediate, non-blocking feedback for the two moments before a Duo result:
// the local board completes, or the opponent completes while we are still playing.

export type DuoFinishMomentKind = 'local' | 'opponent';

let hideTimer: ReturnType<typeof setTimeout> | null = null;

function clearHideTimer(): void {
  if (hideTimer !== null) {
    clearTimeout(hideTimer);
    hideTimer = null;
  }
}

function ensureMomentElement(): HTMLElement {
  const existing = document.getElementById('duo-finish-moment');
  if (existing) return existing;

  const element = document.createElement('aside');
  element.id = 'duo-finish-moment';
  element.className = 'duo-finish-moment';
  element.setAttribute('role', 'status');
  element.setAttribute('aria-live', 'assertive');
  element.setAttribute('aria-atomic', 'true');
  element.innerHTML = `
    <span class="duo-finish-moment-icon" aria-hidden="true"></span>
    <span class="duo-finish-moment-copy">
      <strong class="duo-finish-moment-title"></strong>
      <span class="duo-finish-moment-detail"></span>
    </span>
  `;
  document.body.appendChild(element);
  return element;
}

function markUxEvent(name: string, detail: Record<string, unknown>): void {
  const timestamp = performance.now();
  performance.mark?.(`duo:${name}`);
  window.dispatchEvent(
    new CustomEvent('duo:ux', {
      detail: { name, timestamp, ...detail },
    }),
  );
}

export function showDuoFinishMoment(
  kind: DuoFinishMomentKind,
  title: string,
  detail: string,
  autoHideMs = kind === 'opponent' ? 3_200 : 0,
): void {
  clearHideTimer();
  const element = ensureMomentElement();
  const titleElement = element.querySelector<HTMLElement>('.duo-finish-moment-title');
  const detailElement = element.querySelector<HTMLElement>('.duo-finish-moment-detail');
  const iconElement = element.querySelector<HTMLElement>('.duo-finish-moment-icon');

  if (titleElement) titleElement.textContent = title;
  if (detailElement) detailElement.textContent = detail;
  if (iconElement) iconElement.textContent = kind === 'local' ? '✓' : '⚡';

  element.dataset.kind = kind;
  element.dataset.shownAt = String(performance.now());
  element.classList.remove('visible', 'local', 'opponent');
  void element.offsetWidth;
  element.classList.add('visible', kind);
  markUxEvent(kind === 'local' ? 'local-finish-feedback' : 'opponent-finish-feedback', { kind });

  if (autoHideMs > 0) {
    hideTimer = setTimeout(() => {
      hideTimer = null;
      element.classList.remove('visible');
    }, autoHideMs);
  }
}

export function clearDuoFinishMoment(): void {
  clearHideTimer();
  const element = document.getElementById('duo-finish-moment');
  if (!element) return;
  element.classList.remove('visible');
  element.remove();
}
