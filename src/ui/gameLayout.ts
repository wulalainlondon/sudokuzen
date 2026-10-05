// Fit the square board to its actual flex slot, after HUD and input controls.
let observer: ResizeObserver | undefined;

export function initGameLayout(): void {
  const stage = document.querySelector<HTMLElement>('.board-stage');
  if (!stage || observer) return;
  const fit = () => {
    const size = Math.floor(Math.min(stage.clientWidth, stage.clientHeight, 420));
    if (size <= 0) return; // Hidden game screens will be measured again when shown.
    const value = `${size}px`;
    if (stage.style.getPropertyValue('--game-board-size') !== value) {
      stage.style.setProperty('--game-board-size', value);
    }
  };
  if (typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(fit);
    observer.observe(stage);
  }
  window.addEventListener('resize', fit, { passive: true });
  window.visualViewport?.addEventListener('resize', fit, { passive: true });
  fit();
}
