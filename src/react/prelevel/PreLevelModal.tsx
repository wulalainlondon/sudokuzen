import { useCallback, useEffect, useRef, type ReactElement } from 'react';
import { usePreLevelStore } from './preLevelStore';

export function PreLevelModal(): ReactElement | null {
  const {
    visible, displayName, techName, techTier, bestRecord, hasRecord,
    hasReplay, leaderboardHtml, isPractice, isSpeedrun,
  } = usePreLevelStore();
  const close = usePreLevelStore((s) => s.close);
  const duoZoneRef = useRef<HTMLDivElement>(null);

  // Move legacy duo-ready-zone DOM into our container when visible
  useEffect(() => {
    if (!visible || !duoZoneRef.current) return;
    const legacyDuoZone = document.getElementById('duo-ready-zone');
    if (legacyDuoZone && !duoZoneRef.current.contains(legacyDuoZone)) {
      duoZoneRef.current.appendChild(legacyDuoZone);
    }
  }, [visible]);

  const handleBackdrop = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) close();
  }, [close]);

  const handleStart = useCallback(() => {
    import('../../features/levels').then((m) => m.startLevelFromModal(true, false, null));
  }, []);

  const handleGhost = useCallback(() => {
    import('../../features/levels').then((m) => m.startLevelFromModal(true, true, null));
  }, []);

  const handleReplay = useCallback(async () => {
    const levelId = usePreLevelStore.getState().levelId;
    if (!levelId) return;
    // Get replay data from the record
    const { SK, readJson } = await import('../../storage/keys');
    const isPrac = usePreLevelStore.getState().isPractice;
    const isSp = usePreLevelStore.getState().isSpeedrun;
    const recKey = isPrac ? SK.PRACTICE_RECORDS : isSp ? SK.SPEED_RECORDS : SK.RECORDS;
    const records = readJson<Record<string, any>>(recKey, {});
    const record = records[levelId];
    if (record?.replayHistory) {
      const { openHistoricalReplay } = await import('../../features/replay');
      openHistoricalReplay(levelId, record.replayHistory);
    }
  }, []);

  const handleGhostWithData = useCallback(async () => {
    const levelId = usePreLevelStore.getState().levelId;
    if (!levelId) return;
    const { SK, readJson } = await import('../../storage/keys');
    const isPrac = usePreLevelStore.getState().isPractice;
    const isSp = usePreLevelStore.getState().isSpeedrun;
    const recKey = isPrac ? SK.PRACTICE_RECORDS : isSp ? SK.SPEED_RECORDS : SK.RECORDS;
    const records = readJson<Record<string, any>>(recKey, {});
    const record = records[levelId];
    if (record?.replayHistory) {
      import('../../features/levels').then((m) => m.startLevelFromModal(true, true, record.replayHistory));
    }
  }, []);

  if (!visible) return null;

  const techDisplay = techTier ? `💡 核心技巧: ${techName} (${techTier})` : `💡 核心技巧: ${techName}`;

  return (
    <div id="pre-level-modal" style={{ display: 'flex' }} onClick={handleBackdrop}>
      <div className="pre-level-panel">
        <h2>{displayName}</h2>
        <p className={`pre-level-record${hasRecord ? ' has-record' : ''}`}>{bestRecord}</p>
        <p className="pre-level-tech">{techDisplay}</p>

        <div className="leaderboard-card">
          <div className="leaderboard-title">首通榜 TOP 3</div>
          <div
            className="leaderboard-list"
            id="pre-level-leaderboard"
            dangerouslySetInnerHTML={{ __html: leaderboardHtml }}
          />
        </div>

        {/* Legacy Duo Ready Zone — mounted here by useEffect */}
        <div ref={duoZoneRef} />

        <button className="resume-btn" onClick={handleStart}>開始挑戰</button>
        {hasReplay && (
          <button className="resume-btn btn-ghost" onClick={handleGhostWithData}>
            👻 挑戰本局幽靈
          </button>
        )}
        {hasReplay && (
          <button className="resume-btn btn-replay" onClick={handleReplay}>
            🎬 觀看最佳通關回放
          </button>
        )}
        <button className="back-btn-light" onClick={close}>選擇其他關卡</button>
      </div>
    </div>
  );
}
