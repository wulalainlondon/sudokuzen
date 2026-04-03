import { createPortal } from 'react-dom';
import { useEffect, useState, type ReactElement } from 'react';
import { getMentorNote } from '../../features/wild/mentorController';
import { TECHNIQUE_TABLE, type Rarity } from '../../features/wild/techniqueMeta';
import {
  getWildBestiaryFilters,
  studyWildSkill,
} from '../../features/wild/wildLobby';
import { loadWildProfile } from '../../features/wild/wildState';
import { t } from '../../i18n/t';
import { bridgeOpenWildMentorNote } from './wildLobbyBridge';
import { useWildLobbyStore } from './wildLobbyStore';

const RARITY_LABEL: Record<Rarity, string> = {
  common: t('wild.rarityCommon'),
  rare: t('wild.rarityRare'),
  legendary: t('wild.rarityLegendary'),
  mythic: t('wild.rarityMythic'),
};

const ALL_MODES = ['standard', 'blind', 'ironman', 'noNotes'] as const;
const MODE_LABELS: Record<(typeof ALL_MODES)[number], string> = {
  standard: t('wildLobby.modeBadgeStandard'),
  blind: t('wildLobby.modeBadgeBlind'),
  ironman: t('wildLobby.modeBadgeIronman'),
  noNotes: t('wildLobby.modeBadgeNoNotes'),
};

const PHASES: Array<{ name: string; minGate: number; keys: string[] }> = [
  { name: t('wildLobby.phaseFundamentals'), minGate: 1, keys: ['naked_single', 'hidden_single', 'locked_candidates', 'naked_pair', 'hidden_pair', 'naked_triple', 'hidden_triple'] },
  { name: t('wildLobby.phaseMidIntuitive'), minGate: 21, keys: ['x_wing', 'unique_rectangle', 'bug_plus_one'] },
  { name: t('wildLobby.phaseMidDeductive'), minGate: 31, keys: ['skyscraper', 'two_string_kite', 'empty_rectangle', 'finned_x_wing', 'xy_wing', 'xyz_wing', 'w_wing', 'remote_pairs'] },
  { name: t('wildLobby.phaseAdvanced'), minGate: 41, keys: ['swordfish', 'x_cycle_simple_coloring', 'finned_swordfish', 'jellyfish', 'finned_jellyfish'] },
  { name: t('wildLobby.phaseChains'), minGate: 61, keys: ['aic', 'aic_mid_chain', 'aic_long_chain', 'grouped_aic_nice_loop', 'discontinuous_nice_loop', 'xy_chain'] },
  { name: t('wildLobby.phaseALSForcing'), minGate: 71, keys: ['als_xz', 'als_xy', 'als_w_wing', 'als_chain', 'forcing_chain_net', 'cell_forcing_chain', 'region_forcing_chain'] },
  { name: t('wildLobby.phaseUltimate'), minGate: 80, keys: ['sue_de_coq', 'template', 'death_blossom', 'exocet_death_blossom'] },
];

export function WildBestiaryGrid(): ReactElement | null {
  const [, setTick] = useState(0);
  const [visibleCards, setVisibleCards] = useState(72);
  const host = document.getElementById('wild-bestiary-grid');
  const visible = useWildLobbyStore((s) => s.visible);

  useEffect(() => {
    const gridHost = document.getElementById('wild-bestiary-grid');
    if (!gridHost) return;
    document.body.dataset.reactWildBestiary = '1';
    gridHost.innerHTML = '';

    const onRefresh = () => {
      setVisibleCards(72);
      setTick((v) => v + 1);
    };
    window.addEventListener('wild-bestiary-refresh', onRefresh);
    return () => {
      window.removeEventListener('wild-bestiary-refresh', onRefresh);
      delete document.body.dataset.reactWildBestiary;
    };
  }, []);

  useEffect(() => {
    const scroller = document.querySelector('.wild-lobby-body') as HTMLElement | null;
    if (!scroller) return;
    const onScroll = () => {
      const nearBottom = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 260;
      if (!nearBottom) return;
      setVisibleCards((v) => v + 48);
    };
    scroller.addEventListener('scroll', onScroll, { passive: true });
    return () => scroller.removeEventListener('scroll', onScroll);
  }, []);

  const profile = loadWildProfile();
  const { bestiaryFilter, rarityFilter } = getWildBestiaryFilters();
  const techByKey = new Map(TECHNIQUE_TABLE.map((tt) => [tt.key, tt]));
  const discoveredTotal = Object.keys(profile.bestiary).length;

  let shownAnyPhase = false;
  let renderedCards = 0;
  let hasMore = false;
  let renderedAnything = false;

  const rows: ReactElement[] = [];
  for (const phase of PHASES) {
    const isUnlocked = profile.iqLevel >= phase.minGate;
    const isPreviousPhase = shownAnyPhase;
    if (!isUnlocked && isPreviousPhase) {
      rows.push(
        <div key={`locked-${phase.name}`} className="wild-bestiary-locked">
          {t('wild.phaseLock', { level: String(phase.minGate), name: phase.name })}
        </div>,
      );
      break;
    }
    if (!isUnlocked) continue;
    shownAnyPhase = true;

    const phaseDiscovered = phase.keys.filter((k) => profile.bestiary[k]).length;
    rows.push(
      <div key={`phase-${phase.name}`} className="wild-bestiary-phase">
        {t('wild.phaseHeader', { name: phase.name, discovered: String(phaseDiscovered), total: String(phase.keys.length) })}
      </div>,
    );

    const phaseTechs = phase.keys
      .map((k) => techByKey.get(k))
      .filter((tt): tt is NonNullable<typeof tt> => Boolean(tt))
      .filter((tt) => {
        const entry = profile.bestiary[tt.key];
        if (bestiaryFilter === 'discovered' && !entry) return false;
        if (bestiaryFilter === 'conquered' && !(entry && entry.kills > 0)) return false;
        if (rarityFilter !== 'all' && tt.rarity !== rarityFilter) return false;
        return tt.levelGate <= profile.iqLevel;
      });

    if (phaseTechs.length === 0 && bestiaryFilter === 'all') {
      const pending = phase.keys.filter((k) => {
        const tt = techByKey.get(k);
        return tt && tt.levelGate > profile.iqLevel;
      });
      if (pending.length > 0) {
        const nextGate = Math.min(...pending.map((k) => techByKey.get(k)!.levelGate));
        rows.push(
          <div key={`hint-${phase.name}`} className="wild-bestiary-hint">
            {t('wild.unlockMore', { level: String(nextGate) })}
          </div>,
        );
      }
    }

    for (const tech of phaseTechs) {
      if (renderedCards >= visibleCards) {
        hasMore = true;
        continue;
      }
      renderedCards += 1;
      renderedAnything = true;
      const cardOrder = renderedCards;
      const entry = profile.bestiary[tech.key];
      const isUndiscovered = !entry;
      const isConquered = !!entry && entry.kills > 0;
      const modesCleared = entry?.modesCleared || [];
      const note = getMentorNote(tech.key, isConquered);

      rows.push(
        <div
          key={`card-${tech.key}`}
          className={`wild-beast-card wild-beast-card-enter rarity-${tech.rarity}${isUndiscovered ? ' undiscovered' : ''}`}
          style={{ animationDelay: `${Math.min(cardOrder * 14, 280)}ms` }}
          title={note && entry ? note : undefined}
          onClick={() => {
            if (!note || !entry) return;
            bridgeOpenWildMentorNote(isConquered ? `${tech.name} · ${tech.subtitle}` : '？？？', note);
          }}
        >
          <div className="wild-beast-name">{entry ? tech.name : t('wild.unknown')}</div>
          <div className="wild-beast-sub">{entry ? `${tech.subtitle} · ${RARITY_LABEL[tech.rarity]}` : t('wild.undiscovered')}</div>
          {entry && (
            <div className="wild-beast-kills">
              {t('wild.kills', { kills: String(entry.kills), encounters: String(entry.encounters) })}
            </div>
          )}
          {entry && isConquered && (
            <div className="wild-beast-modes">
              {ALL_MODES.map((m) => (
                <span key={`${tech.key}-${m}`} className={`mode-badge ${modesCleared.includes(m) ? 'cleared' : ''}`}>
                  {MODE_LABELS[m]}
                </span>
              ))}
            </div>
          )}
          {tech.fragmentsRequired > 0 && (() => {
            const frags = profile.fragments?.[tech.key] || 0;
            const isStudied = !!profile.studiedSkills?.includes(tech.key);
            const isReady = frags >= tech.fragmentsRequired;
            if (isStudied) return <div className="wild-beast-studied">{t('wild.studied')}</div>;
            if (isReady) {
              return (
                <button
                  className="wild-beast-study-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    void studyWildSkill(tech.key);
                  }}
                >
                  {t('wild.study')}
                </button>
              );
            }
            return (
              <div className="wild-beast-frag">
                {t('wild.fragments', { current: String(frags), required: String(tech.fragmentsRequired) })}
              </div>
            );
          })()}
        </div>,
      );
    }
  }

  if (!renderedAnything) {
    rows.push(
      <div key="empty" className="wild-bestiary-empty">{t('wildLobby.emptyByFilter')}</div>,
    );
  }
  if (hasMore) {
    rows.push(
      <div key="more" className="wild-bestiary-hint">{t('wildLobby.scrollForMore')}</div>,
    );
  }
  rows.push(
    <div key="footer" className="wild-bestiary-footer">
      {t('wild.bestiaryFooter', { discovered: String(discoveredTotal), total: String(TECHNIQUE_TABLE.length) })}
    </div>,
  );
  const view = rows;

  if (!host || !visible) return null;
  return createPortal(<>{view}</>, host);
}
