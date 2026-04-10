import { createPortal } from 'react-dom';
import { useCallback, useEffect, type ReactElement } from 'react';
import { t } from '../../i18n/t';
import { subscribeOnlineCount } from '../../firebase/client';
import { useWildLobbyStore } from './wildLobbyStore';
import type { SudokuWindow } from '../../facade/windowTypes';
import {
  renderWildLobby,
  setWildBestiaryFilter,
  setWildRarityFilter,
  toggleWildAutoCast,
} from '../../features/wild/wildLobby';
import { showFeedback } from '../../ui/feedback';

function host(sel: string): HTMLElement | null {
  return document.querySelector(sel);
}

export function WildProfileCard(): ReactElement | null {
  const vm = useWildLobbyStore((s) => s.vm);
  const onlineCount = useWildLobbyStore((s) => s.onlineCount);
  const setOnlineCount = useWildLobbyStore((s) => s.setOnlineCount);
  const visible = useWildLobbyStore((s) => s.visible);
  const el = host('.wild-profile-card');

  useEffect(() => {
    const profileHost = host('.wild-profile-card');
    if (!profileHost) return;
    document.body.dataset.reactWildLobby = '1';
    profileHost.innerHTML = '';
    return () => {
      delete document.body.dataset.reactWildLobby;
    };
  }, []);

  useEffect(() => {
    if (!visible) return;
    return subscribeOnlineCount((count) => setOnlineCount(count));
  }, [visible, setOnlineCount]);

  if (!el || !vm || !visible) return null;
  return createPortal(
    <>
      {onlineCount > 0 && (
        <div
          className="wild-online-indicator"
          id="wild-online-count"
        >{`\u{1F7E2} ${t('wild.online', { count: String(onlineCount) })}`}</div>
      )}
      <div className="wild-profile-level">
        <span className="wild-level-badge" id="wild-level">{`Lv.${vm.iqLevel}`}</span>
        <span className="wild-level-title" id="wild-level-title">
          {vm.levelTitle}
        </span>
        <div className="wild-title-display" id="wild-title" style={{ display: vm.equippedTitle ? '' : 'none' }}>
          {vm.equippedTitle}
        </div>
      </div>
      <div className="wild-exp-bar-wrap">
        <div
          className={`wild-exp-fill${vm.expFillPct > 88 ? ' wild-exp-fill--full' : ''}`}
          id="wild-exp-fill"
          style={{ width: `${vm.expFillPct.toFixed(1)}%` }}
        />
      </div>
      <div className="wild-exp-text" id="wild-exp-text">
        {vm.expText}
      </div>
      <div className="wild-profile-stats">
        <div className="wild-stat">
          <span className="wild-stat-num" id="wild-completed">
            {vm.completed}
          </span>
          <span className="wild-stat-label">{t('wild.hunts')}</span>
        </div>
        <div className="wild-stat">
          <span className="wild-stat-num" id="wild-discovered">
            {vm.discovered}
          </span>
          <span className="wild-stat-label">{t('wild.bestiary')}</span>
        </div>
        <div className="wild-stat">
          <span className="wild-stat-num" id="wild-encounters">
            {vm.encounters}
          </span>
          <span className="wild-stat-label">{t('wild.encounters')}</span>
        </div>
      </div>
    </>,
    el,
  );
}

export function WildSessionCard(): ReactElement | null {
  const vm = useWildLobbyStore((s) => s.vm);
  const visible = useWildLobbyStore((s) => s.visible);
  const el = host('.wild-session-card');
  useEffect(() => {
    const sessionHost = host('.wild-session-card');
    if (sessionHost) sessionHost.innerHTML = '';
  }, []);
  if (!el || !vm || !visible) return null;
  return createPortal(
    <>
      <div className="wild-session-head">
        <div className="wild-session-title">{t('wild.sessionTitle')}</div>
        <div className="wild-session-round" id="wild-session-round">
          {vm.sessionRoundText}
        </div>
      </div>
      <div className="wild-session-bar-wrap">
        <div
          className="wild-session-bar-fill"
          id="wild-session-fill"
          style={{ width: `${vm.sessionFillPct.toFixed(1)}%` }}
        />
      </div>
      {vm.sessionRound > 0 && (
        <div className="wild-session-dots">
          {Array.from({ length: 10 }, (_, i) => {
            const dotNum = i + 1;
            const isBoss = dotNum === 10;
            const isCompleted = dotNum < vm.sessionRound;
            const isCurrent = dotNum === vm.sessionRound;
            let cls = 'wild-session-dot';
            if (isBoss) cls += ' boss';
            if (isCompleted) cls += ' completed';
            else if (isCurrent) cls += ' current';
            return <span key={dotNum} className={cls} />;
          })}
        </div>
      )}
      <div className="wild-session-meta" id="wild-session-meta">
        {vm.sessionMetaText}
      </div>
      <div className="wild-session-tech" id="wild-session-tech">
        {vm.sessionTechText}
      </div>
      {vm.showIntroButton && (
        <button
          className="wild-intro-btn"
          onClick={async () => {
            const { startMentorIntroNow } = await import('../../features/wild/mentorController');
            await startMentorIntroNow();
            renderWildLobby();
            showFeedback(t('wild.introWatched'), 'success');
          }}
        >
          {t('wild.watchIntro')}
        </button>
      )}
    </>,
    el,
  );
}

export function WildAutoCastRow(): ReactElement | null {
  const vm = useWildLobbyStore((s) => s.vm);
  const visible = useWildLobbyStore((s) => s.visible);
  const el = host('.wild-autocast-row');
  useEffect(() => {
    const autoHost = host('.wild-autocast-row');
    if (autoHost) autoHost.innerHTML = '';
  }, []);
  if (!el || !vm || !visible) return null;
  return createPortal(
    <div style={{ display: vm.autoCastVisible ? '' : 'none', width: '100%' }}>
      <label className="wild-autocast-label" htmlFor="wild-autocast-toggle">
        <span className="wild-autocast-text">{t('wild.autoCastLabel')}</span>
        <span className="wild-autocast-hint" id="wild-autocast-hint">
          {vm.autoCastHint}
        </span>
      </label>
      <button
        className={`wild-toggle-btn${vm.autoCastEnabled ? ' active' : ''}`}
        id="wild-autocast-toggle"
        onClick={() => toggleWildAutoCast()}
        role="switch"
        aria-checked={vm.autoCastEnabled ? 'true' : 'false'}
        title={vm.autoCastTitle || undefined}
      >
        <span className="wild-toggle-knob" />
      </button>
    </div>,
    el,
  );
}

export function WildEnterButton(): ReactElement | null {
  const vm = useWildLobbyStore((s) => s.vm);
  const visible = useWildLobbyStore((s) => s.visible);
  const loading = useWildLobbyStore((s) => s.loading);
  const setLoading = useWildLobbyStore((s) => s.setLoading);
  const el = document.getElementById('wild-enter-btn');
  const parent = el?.parentElement ?? null;
  useEffect(() => {
    const enterHost = document.getElementById('wild-enter-btn');
    if (enterHost) enterHost.innerHTML = '';
  }, []);

  const onStart = useCallback(async () => {
    const win = window as unknown as SudokuWindow;
    if (!win.startPoolRandom || loading) return;
    setLoading(true);
    try {
      await win.startPoolRandom();
    } finally {
      setLoading(false);
    }
  }, [loading, setLoading]);

  useEffect(() => {
    if (!el) return;
    const btn = el as HTMLButtonElement;
    const prevOnClick = btn.onclick;
    btn.onclick = (ev: MouseEvent) => {
      ev.preventDefault();
      ev.stopPropagation();
      void onStart();
      return false;
    };
    btn.classList.toggle('is-loading', loading);
    btn.setAttribute('aria-busy', loading ? 'true' : 'false');
    btn.disabled = loading;
    return () => {
      btn.onclick = prevOnClick;
      btn.classList.remove('is-loading');
      btn.removeAttribute('aria-busy');
      btn.disabled = false;
    };
  }, [el, loading, onStart]);

  if (!el || !vm || !visible) return null;
  return (
    <>
      {createPortal(
        <>
          <span className="wild-enter-chip" id="wild-enter-chip">
            {vm.enterChip}
          </span>
          <span className="wild-enter-text">{vm.enterText}</span>
          <span className="wild-enter-sub" id="wild-enter-sub">
            {vm.enterSub}
          </span>
          <span style={{ display: 'none' }}>{vm.enterState}</span>
        </>,
        el,
      )}
      {parent &&
        vm.hasSavedEncounter &&
        createPortal(
          <button
            id="wild-abandon-btn"
            className="wild-abandon-btn"
            onClick={async (e) => {
              e.stopPropagation();
              if (!confirm(t('wild.abandonConfirm'))) return;
              const { abandonWildEncounter } = await import('../../features/wild/wildController');
              abandonWildEncounter();
              renderWildLobby();
              showFeedback(t('wild.abandonEncounter'), 'success');
            }}
          >
            {t('wild.abandonEncounter')}
          </button>,
          parent,
        )}
    </>
  );
}

export function WildBestiaryControls(): ReactElement | null {
  const vm = useWildLobbyStore((s) => s.vm);
  const visible = useWildLobbyStore((s) => s.visible);
  const titleEl = host('.wild-bestiary-title');
  const filterEl = document.getElementById('wild-bestiary-controls');
  const rarityEl = document.getElementById('wild-rarity-controls');
  useEffect(() => {
    const titleHost = host('.wild-bestiary-title');
    const filterHost = document.getElementById('wild-bestiary-controls');
    const rarityHost = document.getElementById('wild-rarity-controls');
    if (titleHost) titleHost.innerHTML = '';
    if (filterHost) filterHost.innerHTML = '';
    if (rarityHost) rarityHost.innerHTML = '';
  }, []);
  if (!vm || !visible || !titleEl || !filterEl || !rarityEl) return null;

  return (
    <>
      {createPortal(
        <>
          {t('wild.bestiaryTitle')}{' '}
          <span id="wild-bestiary-count">
            {t('wild.bestiaryCount', { discovered: String(vm.bestiaryDiscovered), total: String(vm.bestiaryTotal) })}
          </span>
        </>,
        titleEl,
      )}
      {createPortal(
        <>
          <button
            className={`wild-filter-btn${vm.bestiaryFilter === 'all' ? ' active' : ''}`}
            data-filter="all"
            onClick={() => setWildBestiaryFilter('all')}
          >
            {t('wild.filterAll')}
          </button>
          <button
            className={`wild-filter-btn${vm.bestiaryFilter === 'discovered' ? ' active' : ''}`}
            data-filter="discovered"
            onClick={() => setWildBestiaryFilter('discovered')}
          >
            {t('wild.filterDiscovered')}
          </button>
          <button
            className={`wild-filter-btn${vm.bestiaryFilter === 'conquered' ? ' active' : ''}`}
            data-filter="conquered"
            onClick={() => setWildBestiaryFilter('conquered')}
          >
            {t('wild.filterConquered')}
          </button>
        </>,
        filterEl,
      )}
      {createPortal(
        <>
          <button
            className={`wild-rarity-btn${vm.rarityFilter === 'all' ? ' active' : ''}`}
            data-rarity="all"
            onClick={() => setWildRarityFilter('all')}
          >
            {t('wild.rarityAll')}
          </button>
          <button
            className={`wild-rarity-btn${vm.rarityFilter === 'common' ? ' active' : ''}`}
            data-rarity="common"
            onClick={() => setWildRarityFilter('common')}
          >
            {t('wild.rarityCommon')}
          </button>
          <button
            className={`wild-rarity-btn${vm.rarityFilter === 'rare' ? ' active' : ''}`}
            data-rarity="rare"
            onClick={() => setWildRarityFilter('rare')}
          >
            {t('wild.rarityRare')}
          </button>
          <button
            className={`wild-rarity-btn${vm.rarityFilter === 'legendary' ? ' active' : ''}`}
            data-rarity="legendary"
            onClick={() => setWildRarityFilter('legendary')}
          >
            {t('wild.rarityLegendary')}
          </button>
          <button
            className={`wild-rarity-btn${vm.rarityFilter === 'mythic' ? ' active' : ''}`}
            data-rarity="mythic"
            onClick={() => setWildRarityFilter('mythic')}
          >
            {t('wild.rarityMythic')}
          </button>
        </>,
        rarityEl,
      )}
    </>
  );
}
