import { useEffect, useState, type ReactElement } from 'react';
import { createPortal } from 'react-dom';
import { gs } from '../../game/state';
import { getAllLevels } from '../../data/dataRegistry';
import { SK, readJson } from '../../storage/keys';
import {
  enterTier,
  getDifficultyTiers,
  getRealmUnlockState,
  getTierUnlockMessage,
} from '../../features/levels';
import { showFeedback } from '../../ui/feedback';
import { t } from '../../i18n/t';

interface StageNodeViewModel {
  tierName: string;
  total: number;
  cleared: number;
  pct: number;
  isCleared: boolean;
  isPartial: boolean;
  isLocked: boolean;
  lockHint: string;
  progressText: string;
}

function buildStageMapModel(): StageNodeViewModel[] {
  const levels = getAllLevels();
  const recordsKey = gs.isSpeedrunMode ? SK.SPEED_RECORDS : SK.RECORDS;
  const records = readJson<Record<string, unknown>>(recordsKey, {});
  const tiers = getDifficultyTiers();
  const unlockState = getRealmUnlockState();

  return tiers.map((tierName) => {
    const tierLevels = levels.filter((l) => l.difficultyName === tierName && !l.hidden);
    const total = tierLevels.length;
    const cleared = tierLevels.filter((l) => records[l.id]).length;
    const pct = total > 0 ? (cleared / total) * 100 : 0;
    const isCleared = cleared === total && total > 0;
    const isPartial = cleared > 0 && !isCleared;
    const isLocked = !unlockState.unlockedTiers.has(tierName);
    const lockHint = getTierUnlockMessage(tierName, unlockState);
    const progressText = isLocked
      ? lockHint
      : cleared === 0
        ? t('stage.notChallenged')
        : isCleared
          ? t('stage.unlocked')
          : t('stage.inProgress');

    return {
      tierName,
      total,
      cleared,
      pct,
      isCleared,
      isPartial,
      isLocked,
      lockHint,
      progressText,
    };
  });
}

export function NormalStageMap(): ReactElement | null {
  const [, setRevision] = useState(0);
  const host = document.getElementById('stage-map');

  useEffect(() => {
    const stageMapHost = document.getElementById('stage-map');
    if (!stageMapHost) return;
    document.body.dataset.reactNormalStageMap = '1';
    // Remove legacy-rendered children before React takes over.
    stageMapHost.innerHTML = '';

    const onRefresh = () => setRevision((v) => v + 1);
    window.addEventListener('normal-stage-map-refresh', onRefresh);

    return () => {
      window.removeEventListener('normal-stage-map-refresh', onRefresh);
      delete document.body.dataset.reactNormalStageMap;
    };
  }, []);

  const nodes = buildStageMapModel();

  if (!host) return null;

  return createPortal(
    <>
      {nodes.map((node) => (
        <div
          key={node.tierName}
          className={`stage-node${node.isCleared ? ' cleared' : ''}${node.isPartial ? ' partial' : ''}${node.isLocked ? ' locked' : ''}`}
          onClick={() => {
            if (node.isLocked) {
              showFeedback(node.lockHint, 'error');
              return;
            }
            enterTier(node.tierName);
          }}
        >
          <div className="stage-dot">{node.isLocked ? '🔒' : node.isCleared ? '✓' : ''}</div>
          <div className="stage-info">
            <div className="stage-name">{node.tierName}</div>
            <div className="stage-progress">{node.progressText}</div>
          </div>
          <div className="stage-bar-wrap">
            <div className="stage-bar-fill" style={{ width: `${node.pct}%` }} />
          </div>
          <div className="stage-count">{node.cleared}/{node.total}</div>
        </div>
      ))}
    </>,
    host,
  );
}
