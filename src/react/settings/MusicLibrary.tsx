import './musicLibrary.css';
import { useEffect, useState, type ReactElement } from 'react';
import { MUSIC_TRACKS, type MusicMode } from '../../music/catalog';
import {
  getMusicCollection,
  getMusicProgress,
  isMusicUnlocked,
  musicUnlockText,
  selectedMusic,
  selectMusic,
  toggleMusicFavorite,
  unlockedMusicCount,
} from '../../music/collection';
import { getAudioSettings } from '../../game/audioSettings';
import { getBgmPlaybackState, previewBgm, stopBgmPreview } from '../../game/bgm';

const modes: Array<[MusicMode, string]> = [
  ['normal', '一般模式'],
  ['wild', '世界模式'],
  ['duo', '雙人對戰'],
];
export function MusicLibrary(): ReactElement {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<MusicMode>(() => getBgmPlaybackState().mode || 'normal');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [collection, setCollection] = useState(getMusicCollection);
  const [progress, setProgress] = useState(getMusicProgress);
  const [playback, setPlayback] = useState(getBgmPlaybackState);
  const [enabled, setEnabled] = useState(() => getAudioSettings().bgmEnabled);
  useEffect(() => {
    const refresh = () => {
      setCollection(getMusicCollection());
      setProgress(getMusicProgress());
      setEnabled(getAudioSettings().bgmEnabled);
    };
    const sound = () => {
      setPlayback(getBgmPlaybackState());
      setEnabled(getAudioSettings().bgmEnabled);
    };
    for (const event of ['sudoku:music-changed', 'sudoku:progress-changed', 'sudoku:profile-hydrated', 'storage'])
      window.addEventListener(event, refresh);
    window.addEventListener('sudoku:music-playback', sound);
    return () => {
      for (const event of ['sudoku:music-changed', 'sudoku:progress-changed', 'sudoku:profile-hydrated', 'storage'])
        window.removeEventListener(event, refresh);
      window.removeEventListener('sudoku:music-playback', sound);
      stopBgmPreview();
    };
  }, []);
  const sync = () => {
    void import('../../firebase/client').then(({ scheduleProgressSync }) => scheduleProgressSync(200)).catch(() => {});
  };
  const chosen = selectedMusic(mode, progress).id;
  const visible = MUSIC_TRACKS.filter((track) => !favoritesOnly || collection.favorites.includes(track.id));
  return (
    <section className="music-library" aria-label="音樂收藏">
      <button
        type="button"
        className="music-library-toggle"
        aria-expanded={open}
        onClick={() => {
          if (open) stopBgmPreview();
          setOpen(!open);
        }}
      >
        <span>♫ 音樂收藏</span>
        <span>
          {unlockedMusicCount(progress)} / {MUSIC_TRACKS.length} 已解鎖 {open ? '▴' : '▾'}
        </span>
      </button>
      {open && (
        <div className="music-library-body">
          <p className="music-library-help">各模式可自行選曲，收藏喜歡的音樂。既有對戰與世界紀錄會直接計入解鎖。</p>
          <div className="music-mode-tabs" aria-label="音樂使用模式">
            {modes.map(([id, label]) => (
              <button key={id} type="button" aria-pressed={mode === id} onClick={() => setMode(id)}>
                {label}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="music-filter"
            aria-pressed={favoritesOnly}
            onClick={() => setFavoritesOnly(!favoritesOnly)}
          >
            {favoritesOnly ? '♥ 我的收藏' : '♡ 只看收藏'}
          </button>
          <div role="status" aria-live="polite" className="music-playback-status">
            {playback.error ||
              (playback.loadingId
                ? '正在載入音樂…'
                : playback.previewId
                  ? '主題試聽中 · 15 秒'
                  : !enabled
                    ? '開啟背景音樂後即可試聽'
                    : '循環播放 · 切換時平順過渡')}
          </div>
          {visible.length === 0 && <p className="music-library-help">尚未收藏樂曲。解鎖後可按愛心加入收藏。</p>}
          {visible.map((track) => {
            const owned = isMusicUnlocked(track, progress);
            const favorite = collection.favorites.includes(track.id);
            const rule = track.unlock;
            const value = rule.kind === 'free' ? 1 : Math.min(progress[rule.kind], rule.count);
            const max = rule.kind === 'free' ? 1 : rule.count;
            return (
              <article
                key={track.id}
                className={`music-card${chosen === track.id ? ' music-selected' : ''}`}
                data-music-id={track.id}
              >
                <div className="music-card-heading">
                  <div>
                    <strong>{track.title}</strong>
                    <small>
                      {track.bpm} BPM{chosen === track.id ? ' · 已選用' : ''}
                    </small>
                  </div>
                  <button
                    type="button"
                    className="music-favorite"
                    disabled={!owned}
                    aria-label={`${favorite ? '取消收藏' : '收藏'}${track.title}`}
                    aria-pressed={favorite}
                    onClick={() => {
                      if (toggleMusicFavorite(track.id)) sync();
                    }}
                  >
                    {favorite ? '♥' : '♡'}
                  </button>
                </div>
                <p>{track.description}</p>
                <small className="music-unlock">
                  {owned ? '已解鎖 · ' : ''}
                  {musicUnlockText(track, progress)}
                </small>
                {rule.kind !== 'free' && <progress value={value} max={max} aria-label={`${track.title}解鎖進度`} />}
                <div className="music-card-actions">
                  <button
                    type="button"
                    disabled={!owned}
                    onClick={() => {
                      if (selectMusic(mode, track.id)) sync();
                    }}
                  >
                    {owned ? (chosen === track.id ? '已選用' : '選用') : '尚未解鎖'}
                  </button>
                  <button
                    type="button"
                    disabled={!enabled}
                    onClick={() => (playback.previewId === track.id ? stopBgmPreview() : previewBgm(track.id))}
                  >
                    {playback.previewId === track.id ? '停止試聽' : '試聽 15 秒'}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
