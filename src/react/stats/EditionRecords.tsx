import { useEffect, useReducer } from 'react';
import { ACTIVE_EDITION } from '../../platform/appEdition';
import { getLegacyHistory } from '../../platform/editionMigration';
import { getLifetimeDuoProfile } from '../../features/duo/duoProfile';
import { t } from '../../i18n/t';

export function EditionRecords() {
  const [, refresh] = useReducer((revision: number) => revision + 1, 0);
  useEffect(() => {
    window.addEventListener('sudoku:profile-hydrated', refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener('sudoku:profile-hydrated', refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);
  if (ACTIVE_EDITION === 'legacy') return null;
  const history = getLegacyHistory();
  const profile = getLifetimeDuoProfile();
  const old = history.duoProfile as Record<string, unknown> | undefined;
  const count = (value: unknown) => String(Math.max(0, Math.floor(Number(value) || 0)));
  const edition = t(ACTIVE_EDITION === 'ios' ? 'edition.ios' : 'edition.pwa');
  const exportHistory = () => {
    const blob = new Blob([JSON.stringify(history, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `SudokuZen-${ACTIVE_EDITION}-legacy-duo-history.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <div className="stats-section" data-testid="edition-records">
      <h3 className="stats-section-title">{t('edition.currentStats', { edition })}</h3>
      <p>
        {t('edition.score', { wins: count(profile.wins), losses: count(profile.losses), draws: count(profile.draws) })}
      </p>
      <p style={{ fontSize: 13, color: 'var(--text-light)', margin: '8px 0 16px' }}>
        {t(ACTIVE_EDITION === 'pwa' ? 'edition.pwaContinues' : 'edition.separate')}
      </p>
      <h3 className="stats-section-title">{t('edition.legacyHistory')}</h3>
      <p>{t('edition.score', { wins: count(old?.wins), losses: count(old?.losses), draws: count(old?.draws) })}</p>
      <p style={{ fontSize: 13, color: 'var(--text-light)', margin: '8px 0' }}>
        {t(ACTIVE_EDITION === 'pwa' ? 'edition.pwaHistoryIncluded' : 'edition.preserved')}
      </p>
      <button className="stats-tab-btn" onClick={exportHistory}>
        {t('edition.exportHistory')}
      </button>
    </div>
  );
}
