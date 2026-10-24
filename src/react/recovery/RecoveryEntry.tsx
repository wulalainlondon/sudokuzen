import { lazy, Suspense, useState } from 'react';
import { createPortal } from 'react-dom';
import { t } from '../../i18n/t';

const RecoveryScreen = lazy(() => import('./RecoveryScreen').then((m) => ({ default: m.RecoveryScreen })));

export function RecoveryEntry() {
  const [open, setOpen] = useState(false);
  const target = document.getElementById('recovery-lobby-entry');
  return (
    <>
      {target
        ? createPortal(
            <button className="recovery-entry" onClick={() => setOpen(true)}>
              {t('recovery.entry')}
            </button>,
            target,
          )
        : null}
      <Suspense fallback={null}>{open ? <RecoveryScreen onClose={() => setOpen(false)} /> : null}</Suspense>
    </>
  );
}
