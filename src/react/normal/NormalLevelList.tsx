import { useEffect, useRef, useState, type ReactElement } from 'react';
import { createPortal } from 'react-dom';
import { gs } from '../../game/state';
import { SK, readJson } from '../../storage/keys';
import { syncLevelCardSize } from '../../game/board';
import { getPlayerIdentity } from '../../firebase/client';
import {
  canAccessLevel,
  getFilteredLevels,
  getRealmUnlockState,
  getTierUnlockMessage,
  showPreLevelModal,
} from '../../features/levels';
import { showFeedback } from '../../ui/feedback';
import { t } from '../../i18n/t';

interface LevelCardModel {
  id: number;
  displayName: string;
  isLocked: boolean;
  isCurrent: boolean;
  isCompleted: boolean;
  isDuoGlow: boolean;
  timeText: string;
  submissions: number;
  stars: number;
}

function hasActiveSave(levelId: number): boolean {
  const saveKey = SK.save(levelId, gs.isSpeedrunMode);
  return localStorage.getItem(saveKey) !== null;
}

function buildLevelCards(): LevelCardModel[] {
  const recordsKey = gs.isSpeedrunMode ? SK.SPEED_RECORDS : SK.RECORDS;
  const records = readJson<Record<string, any>>(recordsKey, {});
  const unlockState = getRealmUnlockState();
  const filtered = getFilteredLevels().filter((l) => !l.hidden);

  let waitingLevelId: number | null = null;
  const roomData = gs.duoRoomData;
  if (roomData && roomData.status === 'waiting' && roomData.levelId) {
    const { playerId } = getPlayerIdentity();
    if (roomData.hostId !== playerId) waitingLevelId = roomData.levelId;
  }

  return filtered.map((l) => {
    const record = records[l.id];
    const isLocked = !canAccessLevel(l, unlockState);
    let bestTime: number | null = null;
    let bestStars = 0;
    let submissions = 0;

    if (record) {
      if (typeof record === 'number') {
        bestTime = record;
        bestStars = 1;
      } else {
        bestTime = record.time;
        bestStars = record.stars || 1;
        if (gs.isSpeedrunMode) submissions = record.submissions || 1;
      }
    }

    const isCurrent = gs.currentLevel?.id === l.id && hasActiveSave(l.id);
    const timeText = bestTime !== null
      ? `${Math.floor(bestTime / 60)}:${(bestTime % 60).toString().padStart(2, '0')}`
      : '--:--';

    return {
      id: l.id,
      displayName: l.displayName,
      isLocked,
      isCurrent,
      isCompleted: bestTime !== null,
      isDuoGlow: waitingLevelId === l.id,
      timeText,
      submissions,
      stars: bestStars,
    };
  });
}

function starsView(stars: number): ReactElement {
  if (stars <= 0) return <span>☆☆☆</span>;
  return (
    <span>
      {'★'.repeat(stars)}
      <span className="empty-star">{'☆'.repeat(3 - stars)}</span>
    </span>
  );
}

function buildCardsSignature(cards: LevelCardModel[]): string {
  return cards
    .map((c) => `${c.id}:${Number(c.isLocked)}:${Number(c.isCurrent)}:${Number(c.isCompleted)}:${Number(c.isDuoGlow)}:${c.timeText}:${c.submissions}:${c.stars}`)
    .join('|');
}

export function NormalLevelList(): ReactElement | null {
  const [revision, setRevision] = useState(0);
  const [visibleCount, setVisibleCount] = useState(180);
  const refreshRafRef = useRef<number | null>(null);
  const lastCardsSigRef = useRef<string>('');
  const lastTierRef = useRef<string | null>(null);
  const host = document.getElementById('level-list');
  const cards = buildLevelCards();
  const cardsSig = buildCardsSignature(cards);

  useEffect(() => {
    const levelListHost = document.getElementById('level-list');
    if (!levelListHost) return;
    document.body.dataset.reactNormalLevelList = '1';
    levelListHost.innerHTML = '';

    const onRefresh = () => {
      if (refreshRafRef.current !== null) return;
      refreshRafRef.current = requestAnimationFrame(() => {
        refreshRafRef.current = null;
        const nextCards = buildLevelCards();
        const nextSig = buildCardsSignature(nextCards);
        const tierChanged = lastTierRef.current !== gs.currentTab;
        if (!tierChanged && nextSig === lastCardsSigRef.current) return;
        if (tierChanged) setVisibleCount(180);
        setRevision((v) => v + 1);
      });
    };
    window.addEventListener('normal-level-list-refresh', onRefresh);
    return () => {
      window.removeEventListener('normal-level-list-refresh', onRefresh);
      delete document.body.dataset.reactNormalLevelList;
      if (refreshRafRef.current !== null) cancelAnimationFrame(refreshRafRef.current);
    };
  }, []);

  useEffect(() => {
    requestAnimationFrame(syncLevelCardSize);
  }, [revision, visibleCount]);

  useEffect(() => {
    lastCardsSigRef.current = cardsSig;
    lastTierRef.current = gs.currentTab;
  }, [cardsSig]);

  useEffect(() => {
    if (!host) return;
    const onScroll = () => {
      const nearBottom = host.scrollTop + host.clientHeight >= host.scrollHeight - 320;
      if (!nearBottom) return;
      setVisibleCount((v) => Math.min(cards.length, v + 120));
    };
    host.addEventListener('scroll', onScroll, { passive: true });
    return () => host.removeEventListener('scroll', onScroll);
  }, [cards.length, host]);

  if (!host) return null;
  const renderedCards = cards.slice(0, visibleCount);
  return createPortal(
    <>
      {renderedCards.map((card) => {
        const itemClass = `level-item ${card.isCompleted ? 'completed' : ''}${card.isLocked ? ' locked' : ''}${card.isCurrent ? ' level-item--current' : ''}${card.isDuoGlow ? ' duo-glow' : ''}`;
        if (card.isLocked) {
          return (
            <div
              key={card.id}
              className={itemClass}
              onClick={() => {
                const unlockState = getRealmUnlockState();
                const level = getFilteredLevels().find((l) => l.id === card.id);
                if (!level) return;
                showFeedback(getTierUnlockMessage(level.difficultyName, unlockState), 'error');
              }}
            >
              <div className="level-num">{card.displayName}</div>
              <div className="level-lock">{t('stage.locked')}</div>
              <div className="level-lock-hint">{t('stage.lockHint')}</div>
            </div>
          );
        }

        const hasRecord = card.isCompleted;
        const statsClass = hasRecord ? 'level-stats' : 'level-stats is-empty';
        const starsClass = gs.isSpeedrunMode
          ? hasRecord ? 'level-stars speedrun-stars' : 'level-stars is-empty'
          : card.stars > 0 ? 'level-stars' : 'level-stars is-empty';
        const starsContent = gs.isSpeedrunMode
          ? hasRecord ? t('levelGrid.speedrunSubmissions', { submissions: String(card.submissions) }) : t('levelGrid.speedrunNotCleared')
          : starsView(card.stars);

        return (
          <div
            key={card.id}
            className={itemClass}
            onClick={() => showPreLevelModal(card.id)}
          >
            {card.isCurrent && <div className="level-current-badge">{t('stage.inProgress')}</div>}
            <div className="level-num">{card.displayName}</div>
            <div className={starsClass}>{starsContent}</div>
            <div className={statsClass}>{card.timeText}</div>
          </div>
        );
      })}
    </>,
    host,
  );
}
