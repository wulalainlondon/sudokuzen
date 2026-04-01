// Wild Lobby UI — profile display, bestiary grid, entry point.

import { loadWildProfile, saveWildProfile } from './wildState';
import { TECHNIQUE_TABLE, getAutoCastKeys, type Rarity } from './techniqueMeta';
import { expForLevel } from './expSystem';
import { getMentorNote } from './mentorController';
import { showFeedback } from '../../ui/feedback';
import { getOnlineCount } from '../../firebase/client';
import { t } from '../../i18n/t';
import { getEquippedTitleDisplay } from '../titles';

// ── Level titles by IQ level range ───────────────────────────────────

const LEVEL_TITLES: [number, string][] = [
  [1, t('wild.levelTitle1')],
  [5, t('wild.levelTitle5')],
  [11, t('wild.levelTitle11')],
  [21, t('wild.levelTitle21')],
  [31, t('wild.levelTitle31')],
  [41, t('wild.levelTitle41')],
  [51, t('wild.levelTitle51')],
  [61, t('wild.levelTitle61')],
  [71, t('wild.levelTitle71')],
  [80, t('wild.levelTitle80')],
];

function getLevelTitle(level: number): string {
  let title = LEVEL_TITLES[0][1];
  for (const [gate, name] of LEVEL_TITLES) {
    if (level >= gate) title = name;
  }
  return title;
}

type BestiaryFilter = 'all' | 'discovered' | 'conquered';
type RarityFilter = 'all' | Rarity;

let _bestiaryFilter: BestiaryFilter = 'all';
let _rarityFilter: RarityFilter = 'all';

const RARITY_LABEL: Record<Rarity, string> = {
  common: t('wild.rarityCommon'),
  rare: t('wild.rarityRare'),
  legendary: t('wild.rarityLegendary'),
  mythic: t('wild.rarityMythic'),
};

function getEnterChip(level: number): string {
  if (level >= 71) return t('wild.poolHighRisk');
  if (level >= 41) return t('wild.poolElite');
  if (level >= 21) return t('wild.poolAdvanced');
  return t('wild.poolStable');
}

function getSessionSummary(profile: ReturnType<typeof loadWildProfile>): {
  roundText: string;
  fillPct: number;
  metaText: string;
  techText: string;
  enterText: string;
  enterSub: string;
} {
  const SESSION_LEVEL_GATE = 21;
  const canSession = profile.iqLevel >= SESSION_LEVEL_GATE;
  const session = profile.currentSession;

  if (!canSession) {
    // 新手村: free roam
    return {
      roundText: t('wild.freeExplore'),
      fillPct: 0,
      metaText: t('wild.sessionUnlock', { level: String(SESSION_LEVEL_GATE) }),
      techText: t('wild.techEncountered', { count: String(Object.keys(profile.bestiary).length) }),
      enterText: t('wild.enterWorld'),
      enterSub: t('wild.enterSub'),
    };
  }

  if (!session || session.round <= 0) {
    return {
      roundText: t('wild.newSession'),
      fillPct: 0,
      metaText: t('wild.sessionStart'),
      techText: t('wild.noTechThisRound'),
      enterText: t('wild.enterWorld'),
      enterSub: t('wild.roundSub', { round: '1' }),
    };
  }

  const fillPct = Math.max(0, Math.min(100, (session.round / 10) * 100));
  const techniques = session.techniques.length > 0 ? session.techniques.length : 0;
  const pace = session.round >= 10 ? t('wild.bossComplete') : t('wild.roundProgress', { round: String(session.round) });
  const enterText = session.round >= 10 ? t('wild.startNewSession') : t('wild.continueSession');
  const enterSub =
    session.round >= 10
      ? t('wild.lastRoundSub', { wins: String(session.wins), exp: String(session.totalExp) })
      : t('wildLobby.nextRoundSub', { next: String(session.round + 1), wins: String(session.wins), round: String(session.round) });
  return {
    roundText: pace,
    fillPct,
    metaText: t('wild.sessionMeta', { exp: String(session.totalExp), wins: String(session.wins), round: String(Math.max(1, session.round)) }),
    techText: techniques > 0 ? t('wild.sessionTechs', { count: String(techniques) }) : t('wild.noTechThisRound'),
    enterText,
    enterSub,
  };
}

function ensureWildFilterBindings(): void {
  const controls = document.getElementById('wild-bestiary-controls');
  if (controls && controls.getAttribute('data-bound') !== '1') {
    controls.setAttribute('data-bound', '1');
    controls.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest('button[data-filter]') as HTMLButtonElement | null;
      if (!btn) return;
      const filter = btn.dataset.filter as BestiaryFilter | undefined;
      if (!filter) return;
      _bestiaryFilter = filter;
      renderWildLobby();
    });
  }

  const rarityControls = document.getElementById('wild-rarity-controls');
  if (rarityControls && rarityControls.getAttribute('data-bound') !== '1') {
    rarityControls.setAttribute('data-bound', '1');
    rarityControls.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest('button[data-rarity]') as HTMLButtonElement | null;
      if (!btn) return;
      const rarity = btn.dataset.rarity as RarityFilter | undefined;
      if (!rarity) return;
      _rarityFilter = rarity;
      renderWildLobby();
    });
  }
}

// ── Study skill (fragment system) ────────────────────────────────────

// Technique key → teach star ID mapping
const TECH_TO_STAR: Record<string, number> = {
  naked_single: 1, hidden_single: 2, locked_candidates: 3,
  naked_pair: 4, hidden_pair: 5, naked_triple: 6, hidden_triple: 7,
};

async function studySkill(techKey: string): Promise<void> {
  const profile = loadWildProfile();
  if (!profile.studiedSkills) profile.studiedSkills = [];
  if (profile.studiedSkills.includes(techKey)) return;

  const meta = TECHNIQUE_TABLE.find(t => t.key === techKey);
  if (!meta) return;

  const starId = TECH_TO_STAR[techKey];
  if (starId) {
    // Open teach module — player must read the lesson
    const { openTeachFromLibrary } = await import('../teach-legacy');
    openTeachFromLibrary(starId);

    // Wait for teach modal to close, then mark as studied
    await waitForTeachClose();
  }

  // Mark as studied
  profile.studiedSkills.push(techKey);
  saveWildProfile(profile);

  showFeedback(t('wild.studyComplete', { name: meta.name, subtitle: meta.subtitle }), 'success');

  // Check if this unlocks Lv.21
  const requiredSkills = TECHNIQUE_TABLE.filter(t => t.fragmentsRequired > 0).map(t => t.key);
  const allStudied = requiredSkills.every(k => profile.studiedSkills.includes(k));
  if (allStudied) {
    setTimeout(() => {
      showFeedback(t('wild.allBasicsComplete'), 'success');
    }, 1500);
  }

  // If this is locked_candidates, hint about long-press
  if (techKey === 'locked_candidates') {
    setTimeout(() => {
      showFeedback(t('wild.longPressHint'), 'success');
    }, 3000);
  }

  renderWildLobby();
}

/** Wait for the teach modal to be closed by the player. */
function waitForTeachClose(): Promise<void> {
  return new Promise(resolve => {
    // Wait a moment for the modal to actually open first
    setTimeout(() => {
      const check = setInterval(() => {
        const modal = document.getElementById('teach-modal');
        // Teach modal uses .show class to toggle visibility
        if (!modal || !modal.classList.contains('show')) {
          clearInterval(check);
          resolve();
        }
      }, 300);
      // Safety timeout
      setTimeout(() => { clearInterval(check); resolve(); }, 120000);
    }, 500);
  });
}

// ── Render lobby ─────────────────────────────────────────────────────

export function renderWildLobby(): void {
  ensureWildFilterBindings();

  const profile = loadWildProfile();
  // expForLevel(n) = cumulative EXP to reach level n.
  // Progress within current level = totalExp - floor, where floor = expForLevel(currentLevel).
  // But at Lv.1 (starting), floor should be 0 since expForLevel(1)=15 but players start at 0.
  const floorExp = profile.iqLevel <= 1 ? 0 : expForLevel(profile.iqLevel);
  const ceilExp = expForLevel(profile.iqLevel + 1);
  const expInLevel = Math.max(0, profile.totalExp - floorExp);
  const expNeeded = ceilExp - floorExp;
  const progress = expNeeded > 0 ? Math.min(1, expInLevel / expNeeded) : 0;

  // Profile card
  const levelEl = document.getElementById('wild-level');
  const titleEl = document.getElementById('wild-level-title');
  const expFill = document.getElementById('wild-exp-fill') as HTMLElement | null;
  const expText = document.getElementById('wild-exp-text');
  const completedEl = document.getElementById('wild-completed');
  const discoveredEl = document.getElementById('wild-discovered');
  const encountersEl = document.getElementById('wild-encounters');
  const sessionRoundEl = document.getElementById('wild-session-round');
  const sessionFillEl = document.getElementById('wild-session-fill') as HTMLElement | null;
  const sessionMetaEl = document.getElementById('wild-session-meta');
  const sessionTechEl = document.getElementById('wild-session-tech');
  const enterBtn = document.getElementById('wild-enter-btn');
  const enterChipEl = document.getElementById('wild-enter-chip');
  const enterTextEl = enterBtn?.querySelector('.wild-enter-text');
  const enterSubEl = document.getElementById('wild-enter-sub');

  const discovered = Object.keys(profile.bestiary).length;
  const conquered = Object.values(profile.bestiary).filter((entry) => entry.kills > 0).length;
  const autoKeys = getAutoCastKeys(profile.iqLevel);
  const sessionSummary = getSessionSummary(profile);

  // Online presence indicator
  const onlineEl = document.getElementById('wild-online-count');
  if (onlineEl) {
    void getOnlineCount().then((count) => {
      if (count > 0) {
        onlineEl.textContent = `\u{1F7E2} ${t('wild.online', { count: String(count) })}`;
        onlineEl.style.display = '';
      } else {
        onlineEl.style.display = 'none';
      }
    });
  }

  if (levelEl) levelEl.textContent = `Lv.${profile.iqLevel}`;
  if (titleEl) titleEl.textContent = getLevelTitle(profile.iqLevel);

  // Player title (稱號)
  const playerTitleEl = document.getElementById('wild-title');
  if (playerTitleEl) {
    const display = getEquippedTitleDisplay();
    playerTitleEl.textContent = display;
    playerTitleEl.style.display = display ? '' : 'none';
  }
  if (expFill) expFill.style.width = `${(progress * 100).toFixed(1)}%`;
  if (expText) expText.textContent = `${expInLevel} / ${expNeeded} EXP`;
  if (completedEl) completedEl.textContent = String(profile.puzzlesCompleted);
  if (discoveredEl) discoveredEl.textContent = String(discovered);
  if (encountersEl) encountersEl.textContent = String(profile.totalEncounters);
  if (sessionRoundEl) sessionRoundEl.textContent = sessionSummary.roundText;
  if (sessionFillEl) sessionFillEl.style.width = `${sessionSummary.fillPct.toFixed(1)}%`;
  if (sessionMetaEl) sessionMetaEl.textContent = sessionSummary.metaText;
  if (sessionTechEl) sessionTechEl.textContent = sessionSummary.techText;
  if (enterChipEl) enterChipEl.textContent = getEnterChip(profile.iqLevel);
  if (enterTextEl) enterTextEl.textContent = sessionSummary.enterText;
  if (enterSubEl) enterSubEl.textContent = sessionSummary.enterSub;

  // Auto-cast toggle (hidden in newbie zone)
  const autocastRow = document.querySelector('.wild-autocast-row') as HTMLElement | null;
  if (autocastRow) autocastRow.style.display = profile.iqLevel >= 21 ? '' : 'none';
  const toggleBtn = document.getElementById('wild-autocast-toggle');
  const hintEl = document.getElementById('wild-autocast-hint');
  if (toggleBtn) {
    toggleBtn.classList.toggle('active', profile.autoCastEnabled);
    toggleBtn.setAttribute('aria-checked', String(profile.autoCastEnabled));
  }
  if (hintEl) {
    if (profile.autoCastEnabled) {
      if (autoKeys.size > 0) {
        const names = TECHNIQUE_TABLE.filter((t) => autoKeys.has(t.key)).map((t) => t.name);
        hintEl.textContent = t('wild.autoCastMastered', { count: String(names.length), conquered: String(conquered), total: String(TECHNIQUE_TABLE.length) });
        if (toggleBtn) toggleBtn.title = names.join('、');
      } else {
        hintEl.textContent = t('wild.autoCastNone');
        if (toggleBtn) toggleBtn.removeAttribute('title');
      }
    } else {
      hintEl.textContent = t('wild.autoCastOff');
      if (toggleBtn) toggleBtn.removeAttribute('title');
    }
  }

  // Bestiary count
  const countEl = document.getElementById('wild-bestiary-count');
  if (countEl) countEl.textContent = t('wild.bestiaryCount', { discovered: String(discovered), total: String(TECHNIQUE_TABLE.length) });

  // Bestiary grid
  const grid = document.getElementById('wild-bestiary-grid');
  if (!grid) return;
  grid.innerHTML = '';

  const filterButtons = document.querySelectorAll('#wild-bestiary-controls .wild-filter-btn');
  filterButtons.forEach((btn) => {
    const filter = (btn as HTMLElement).getAttribute('data-filter');
    btn.classList.toggle('active', filter === _bestiaryFilter);
  });
  const rarityButtons = document.querySelectorAll('#wild-rarity-controls .wild-rarity-btn');
  rarityButtons.forEach((btn) => {
    const rarity = (btn as HTMLElement).getAttribute('data-rarity');
    btn.classList.toggle('active', rarity === _rarityFilter);
  });

  // ── Phase-based bestiary display ──
  const PHASES: { name: string; minGate: number; keys: string[] }[] = [
    { name: t('wildLobby.phaseFundamentals'), minGate: 1, keys: ['naked_single','hidden_single','locked_candidates','naked_pair','hidden_pair','naked_triple','hidden_triple'] },
    { name: t('wildLobby.phaseMidIntuitive'), minGate: 21, keys: ['x_wing','unique_rectangle','bug_plus_one'] },
    { name: t('wildLobby.phaseMidDeductive'), minGate: 31, keys: ['skyscraper','two_string_kite','empty_rectangle','finned_x_wing','xy_wing','xyz_wing','w_wing','remote_pairs'] },
    { name: t('wildLobby.phaseAdvanced'), minGate: 41, keys: ['swordfish','x_cycle_simple_coloring','finned_swordfish','jellyfish','finned_jellyfish'] },
    { name: t('wildLobby.phaseChains'), minGate: 61, keys: ['aic','aic_mid_chain','aic_long_chain','grouped_aic_nice_loop','discontinuous_nice_loop','xy_chain'] },
    { name: t('wildLobby.phaseALSForcing'), minGate: 71, keys: ['als_xz','als_xy','als_w_wing','als_chain','forcing_chain_net','cell_forcing_chain','region_forcing_chain'] },
    { name: t('wildLobby.phaseUltimate'), minGate: 80, keys: ['sue_de_coq','template','death_blossom','exocet_death_blossom'] },
  ];

  const techByKey = new Map(TECHNIQUE_TABLE.map(t => [t.key, t]));
  let shownAnyPhase = false;

  for (const phase of PHASES) {
    const isUnlocked = profile.iqLevel >= phase.minGate;
    const isPreviousPhase = shownAnyPhase;

    // Current phase: show all techniques (discovered or "?")
    // Next phase (first locked): show as locked teaser
    // Phases 2+ away: hide completely
    if (!isUnlocked && isPreviousPhase) {
      // Show locked teaser for the NEXT phase only
      const nextHint = document.createElement('div');
      nextHint.className = 'wild-bestiary-locked';
      nextHint.textContent = t('wild.phaseLock', { level: String(phase.minGate), name: phase.name });
      grid.appendChild(nextHint);
      break; // Don't show phases beyond the next
    }

    if (!isUnlocked) continue;
    shownAnyPhase = true;

    // Phase header
    const phaseHeader = document.createElement('div');
    phaseHeader.className = 'wild-bestiary-phase';
    const phaseDiscovered = phase.keys.filter(k => profile.bestiary[k]).length;
    phaseHeader.textContent = t('wild.phaseHeader', { name: phase.name, discovered: String(phaseDiscovered), total: String(phase.keys.length) });
    grid.appendChild(phaseHeader);

    // Filter techniques in this phase
    const phaseTechs = phase.keys
      .map(k => techByKey.get(k)!)
      .filter(t => {
        if (!t) return false;
        const entry = profile.bestiary[t.key];
        if (_bestiaryFilter === 'discovered' && !entry) return false;
        if (_bestiaryFilter === 'conquered' && !(entry && entry.kills > 0)) return false;
        if (_rarityFilter !== 'all' && t.rarity !== _rarityFilter) return false;
        // Only show techniques whose levelGate is <= player level
        return t.levelGate <= profile.iqLevel;
      });

    if (phaseTechs.length === 0 && _bestiaryFilter === 'all') {
      // Show placeholder for techniques not yet unlocked within this phase
      const pending = phase.keys.filter(k => {
        const t = techByKey.get(k);
        return t && t.levelGate > profile.iqLevel;
      });
      if (pending.length > 0) {
        const hint = document.createElement('div');
        hint.className = 'wild-bestiary-hint';
        const nextGate = Math.min(...pending.map(k => techByKey.get(k)!.levelGate));
        hint.textContent = t('wild.unlockMore', { level: String(nextGate) });
        grid.appendChild(hint);
      }
    }

    for (const tech of phaseTechs) {
    const entry = profile.bestiary[tech.key];
    const card = document.createElement('div');
    card.className = `wild-beast-card rarity-${tech.rarity}`;
    if (!entry) card.classList.add('undiscovered');

    const nameSpan = document.createElement('div');
    nameSpan.className = 'wild-beast-name';
    nameSpan.textContent = entry ? tech.name : t('wild.unknown');

    const subSpan = document.createElement('div');
    subSpan.className = 'wild-beast-sub';
    subSpan.textContent = entry ? `${tech.subtitle} · ${RARITY_LABEL[tech.rarity]}` : t('wild.undiscovered');

    card.appendChild(nameSpan);
    card.appendChild(subSpan);

    if (entry) {
      const killsSpan = document.createElement('div');
      killsSpan.className = 'wild-beast-kills';
      killsSpan.textContent = t('wild.kills', { kills: String(entry.kills), encounters: String(entry.encounters) });
      card.appendChild(killsSpan);

      if (entry.kills > 0) {
        const modesCleared = entry.modesCleared || [];
        const allModes = ['standard', 'blind', 'ironman', 'noNotes'];
        const modeLabels: Record<string, string> = { standard: t('wildLobby.modeBadgeStandard'), blind: t('wildLobby.modeBadgeBlind'), ironman: t('wildLobby.modeBadgeIronman'), noNotes: t('wildLobby.modeBadgeNoNotes') };
        const badgesHtml = allModes.map(m => {
          const cleared = modesCleared.includes(m);
          return `<span class="mode-badge ${cleared ? 'cleared' : ''}">${modeLabels[m]}</span>`;
        }).join('');

        const badgeRow = document.createElement('div');
        badgeRow.className = 'wild-beast-modes';
        badgeRow.innerHTML = badgesHtml;
        card.appendChild(badgeRow);
      }
    }

    // Fragment display for T0-T1 techniques
    if (tech.fragmentsRequired > 0) {
      if (!profile.fragments) profile.fragments = {};
      if (!profile.studiedSkills) profile.studiedSkills = [];
      const frags = profile.fragments[tech.key] || 0;
      const isStudied = profile.studiedSkills.includes(tech.key);
      const isReady = frags >= tech.fragmentsRequired;

      if (isStudied) {
        const badge = document.createElement('div');
        badge.className = 'wild-beast-studied';
        badge.textContent = t('wild.studied');
        card.appendChild(badge);
      } else if (isReady) {
        const studyBtn = document.createElement('button');
        studyBtn.className = 'wild-beast-study-btn';
        studyBtn.textContent = t('wild.study');
        studyBtn.onclick = (e) => {
          e.stopPropagation();
          studySkill(tech.key);
        };
        card.appendChild(studyBtn);
      } else {
        const fragBar = document.createElement('div');
        fragBar.className = 'wild-beast-frag';
        fragBar.textContent = t('wild.fragments', { current: String(frags), required: String(tech.fragmentsRequired) });
        card.appendChild(fragBar);
      }
    }

    // Mentor note tooltip on tap
    const conquered = entry ? entry.kills > 0 : false;
    const note = getMentorNote(tech.key, conquered);
    if (note && entry) {
      card.title = note;
      card.style.cursor = 'pointer';
      card.addEventListener('click', () => {
        const existing = document.getElementById('beast-note-popup');
        if (existing) existing.remove();
        const popup = document.createElement('div');
        popup.id = 'beast-note-popup';
        popup.className = 'beast-note-popup';
        popup.innerHTML = `<div class="beast-note-title">${conquered ? tech.name + ' · ' + tech.subtitle : '？？？'}</div>
          <div class="beast-note-body">${note}</div>
          <div class="beast-note-attr">${t('wildLobby.mentorAttr')}</div>`;
        popup.addEventListener('click', () => popup.remove());
        document.body.appendChild(popup);
      });
    }

    grid.appendChild(card);
  }
  } // end phase loop

  // Total discovered footer
  const footer = document.createElement('div');
  footer.className = 'wild-bestiary-footer';
  footer.textContent = t('wild.bestiaryFooter', { discovered: String(discovered), total: String(TECHNIQUE_TABLE.length) });
  grid.appendChild(footer);
}

// ── Toggle auto-cast ─────────────────────────────────────────────────

export function toggleWildAutoCast(): void {
  const profile = loadWildProfile();
  profile.autoCastEnabled = !profile.autoCastEnabled;
  saveWildProfile(profile);
  renderWildLobby();
}

// ── Open / Close ─────────────────────────────────────────────────────

function setWorldViewActive(active: boolean): void {
  const levelScreen = document.getElementById('level-screen');
  const levelTitle = document.getElementById('level-title');
  const levelModeChip = document.getElementById('level-mode-chip');
  const aliasConfig = document.querySelector('.alias-config') as HTMLElement | null;
  const stageView = document.getElementById('stage-view');
  const tierView = document.getElementById('tier-view');
  const lobby = document.getElementById('wild-lobby');
  const libraryBtn = document.getElementById('library-btn');
  if (levelScreen) levelScreen.classList.toggle('world-view-active', active);
  if (levelTitle) levelTitle.textContent = active ? t('wild.lobbyTitle') : 'SUDOKU ZEN';
  if (levelModeChip) levelModeChip.textContent = t('mode.world');
  if (levelModeChip) levelModeChip.classList.toggle('hidden', !active);
  if (aliasConfig) aliasConfig.style.display = active ? 'none' : '';
  if (stageView) stageView.style.display = active ? 'none' : 'flex';
  if (tierView) tierView.classList.toggle('hidden', true);
  if (lobby) lobby.classList.toggle('hidden', !active);
  // Hide library button in world view — teach is accessed via bestiary study
  if (libraryBtn) libraryBtn.style.display = active ? 'none' : '';
}

export function openWildLobby(): void {
  renderWildLobby();
  setWorldViewActive(true);
}

export function closeWildLobby(): void {
  setWorldViewActive(false);
}

export function isWorldLobbyOpen(): boolean {
  const lobby = document.getElementById('wild-lobby');
  if (!lobby) return false;
  return !lobby.classList.contains('hidden');
}
