export function showConfirm(message: string, confirmLabel = 'OK', cancelLabel = 'Cancel'): Promise<boolean> {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'zen-dialog-overlay';

    const panel = document.createElement('div');
    panel.className = 'zen-dialog-panel';

    const msg = document.createElement('p');
    msg.className = 'zen-dialog-message';
    msg.textContent = message;

    const actions = document.createElement('div');
    actions.className = 'zen-dialog-actions';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'zen-dialog-btn zen-dialog-btn--cancel';
    cancelBtn.textContent = cancelLabel;

    const confirmBtn = document.createElement('button');
    confirmBtn.className = 'zen-dialog-btn zen-dialog-btn--confirm';
    confirmBtn.textContent = confirmLabel;

    actions.appendChild(cancelBtn);
    actions.appendChild(confirmBtn);
    panel.appendChild(msg);
    panel.appendChild(actions);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    const cleanup = (result: boolean) => {
      overlay.remove();
      resolve(result);
    };

    confirmBtn.addEventListener('click', () => cleanup(true));
    cancelBtn.addEventListener('click', () => cleanup(false));
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) cleanup(false);
    });
  });
}

export function showAlert(message: string, dismissLabel = 'OK'): Promise<void> {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'zen-dialog-overlay';

    const panel = document.createElement('div');
    panel.className = 'zen-dialog-panel';

    const msg = document.createElement('p');
    msg.className = 'zen-dialog-message';
    msg.textContent = message;

    const actions = document.createElement('div');
    actions.className = 'zen-dialog-actions';

    const dismissBtn = document.createElement('button');
    dismissBtn.className = 'zen-dialog-btn zen-dialog-btn--confirm';
    dismissBtn.textContent = dismissLabel;

    actions.appendChild(dismissBtn);
    panel.appendChild(msg);
    panel.appendChild(actions);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    const cleanup = () => {
      overlay.remove();
      resolve();
    };

    dismissBtn.addEventListener('click', cleanup);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) cleanup();
    });
  });
}
