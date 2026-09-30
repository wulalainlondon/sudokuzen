import { useState } from 'react';
import { ACTIVE_EDITION } from '../../platform/appEdition';
import { loadLegacyLeaderboard, type LeaderboardRow } from '../../firebase/client';
import { formatSeconds } from '../../game/utils';
import { t } from '../../i18n/t';

export function LegacyLeaderboard({ levelId }: { levelId: number }) {
  const [rows, setRows] = useState<LeaderboardRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  if (ACTIVE_EDITION !== 'ios') return null;
  return (
    <details
      style={{ fontSize: 13, marginTop: 8 }}
      onToggle={(event) => {
        if (!event.currentTarget.open || rows) return;
        setFailed(false);
        void loadLegacyLeaderboard(levelId)
          .then(setRows)
          .catch(() => setFailed(true));
      }}
    >
      <summary style={{ cursor: 'pointer' }}>{t('edition.legacyBoard')}</summary>
      <p style={{ color: 'var(--text-light)', margin: '8px 0' }}>{t('edition.legacyBoardNote')}</p>
      {failed
        ? t('firebase.loadFailed')
        : rows === null
          ? t('miscRuntime.preLevelLoading')
          : rows.length === 0
            ? t('firebase.noRecords')
            : rows.map((row, index) => (
                <div key={row.playerId}>
                  {index + 1}. {row.alias} · {formatSeconds(row.firstTimeSec)} · {'★'.repeat(row.firstStars)}
                </div>
              ))}
    </details>
  );
}
