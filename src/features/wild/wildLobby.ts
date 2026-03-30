// Wild Lobby UI — profile display, bestiary grid, entry point.

import { loadWildProfile, saveWildProfile } from './wildState';
import { TECHNIQUE_TABLE, getAutoCastKeys, type Rarity } from './techniqueMeta';
import { expForLevel } from './expSystem';
import { getMentorNote } from './mentorController';

// ── Level titles by IQ level range ───────────────────────────────────

const LEVEL_TITLES: [number, string][] = [
  [1, '見習修士'],
  [5, '初階修士'],
  [11, '中階修士'],
  [21, '高階修士'],
  [31, '精銳修士'],
  [41, '煉獄修士'],
  [51, '超凡修士'],
  [61, '鏈術大師'],
  [71, '殘集宗師'],
  [80, '不朽真仙'],
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
  common: '常見',
  rare: '稀有',
  legendary: '傳說',
  mythic: '神話',
};

function getEnterChip(level: number): string {
  if (level >= 71) return '高風險遭遇池';
  if (level >= 41) return '菁英遭遇池';
  if (level >= 21) return '進階遭遇池';
  return '穩定遭遇池';
}

function getSessionSummary(profile: ReturnType<typeof loadWildProfile>): {
  roundText: string;
  fillPct: number;
  metaText: string;
  techText: string;
  enterText: string;
  enterSub: string;
} {
  const session = profile.currentSession;
  if (!session || session.round <= 0) {
    return {
      roundText: '新修行輪',
      fillPct: 0,
      metaText: '啟動後將進入 10 輪連續遭遇',
      techText: '本輪尚未遭遇任何技巧',
      enterText: '進入世界',
      enterSub: '第 1/10 輪 · 隨機遭遇 · 技巧修煉',
    };
  }

  const fillPct = Math.max(0, Math.min(100, (session.round / 10) * 100));
  const techniques = session.techniques.length > 0 ? session.techniques.length : 0;
  const pace = session.round >= 10 ? 'Boss 輪完成' : `目前第 ${session.round}/10 輪`;
  const enterText = session.round >= 10 ? '開啟新修行輪' : '繼續修行';
  const enterSub =
    session.round >= 10
      ? `上一輪勝場 ${session.wins}/10 · 總 EXP ${session.totalExp}`
      : `下一輪 ${session.round + 1}/10 · 目前勝場 ${session.wins}/${session.round}`;
  return {
    roundText: pace,
    fillPct,
    metaText: `本輪累積 EXP ${session.totalExp} · 勝場 ${session.wins}/${Math.max(1, session.round)}`,
    techText: techniques > 0 ? `本輪已遭遇 ${techniques} 種技巧` : '本輪尚未遭遇任何技巧',
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

// ── Render lobby ─────────────────────────────────────────────────────

export function renderWildLobby(): void {
  ensureWildFilterBindings();

  const profile = loadWildProfile();
  const currentThreshold = expForLevel(profile.iqLevel);
  const nextThreshold = expForLevel(profile.iqLevel + 1);
  const expInLevel = profile.totalExp - currentThreshold;
  const expNeeded = nextThreshold - currentThreshold;
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

  if (levelEl) levelEl.textContent = `Lv.${profile.iqLevel}`;
  if (titleEl) titleEl.textContent = getLevelTitle(profile.iqLevel);
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

  // Auto-cast toggle
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
        hintEl.textContent = `已精通 ${names.length} 項（已討伐 ${conquered}/${TECHNIQUE_TABLE.length}）`;
        if (toggleBtn) toggleBtn.title = names.join('、');
      } else {
        hintEl.textContent = '尚未精通任何技巧';
        if (toggleBtn) toggleBtn.removeAttribute('title');
      }
    } else {
      hintEl.textContent = '所有技巧皆需手動施放';
      if (toggleBtn) toggleBtn.removeAttribute('title');
    }
  }

  // Bestiary count
  const countEl = document.getElementById('wild-bestiary-count');
  if (countEl) countEl.textContent = `${discovered} / ${TECHNIQUE_TABLE.length}`;

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

  const visibleTechniques = TECHNIQUE_TABLE.filter((tech) => {
    const entry = profile.bestiary[tech.key];
    if (_bestiaryFilter === 'discovered' && !entry) return false;
    if (_bestiaryFilter === 'conquered' && !(entry && entry.kills > 0)) return false;
    if (_rarityFilter !== 'all' && tech.rarity !== _rarityFilter) return false;
    return true;
  }).sort((a, b) => {
    const aEntry = profile.bestiary[a.key];
    const bEntry = profile.bestiary[b.key];
    if (!!aEntry !== !!bEntry) return aEntry ? -1 : 1;
    const aKills = aEntry?.kills ?? 0;
    const bKills = bEntry?.kills ?? 0;
    if (aKills !== bKills) return bKills - aKills;
    return a.weight - b.weight;
  });

  if (visibleTechniques.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'wild-bestiary-empty';
    empty.textContent = '目前篩選下沒有符合的妖獸';
    grid.appendChild(empty);
    return;
  }

  for (const tech of visibleTechniques) {
    const entry = profile.bestiary[tech.key];
    const card = document.createElement('div');
    card.className = `wild-beast-card rarity-${tech.rarity}`;
    if (!entry) card.classList.add('undiscovered');

    const nameSpan = document.createElement('div');
    nameSpan.className = 'wild-beast-name';
    nameSpan.textContent = entry ? tech.name : '？';

    const subSpan = document.createElement('div');
    subSpan.className = 'wild-beast-sub';
    subSpan.textContent = entry ? `${tech.subtitle} · ${RARITY_LABEL[tech.rarity]}` : '未發現';

    card.appendChild(nameSpan);
    card.appendChild(subSpan);

    if (entry) {
      const killsSpan = document.createElement('div');
      killsSpan.className = 'wild-beast-kills';
      killsSpan.textContent = `討伐 ${entry.kills} · 遭遇 ${entry.encounters}`;
      card.appendChild(killsSpan);
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
          <div class="beast-note-attr">—— 弈塵《殘篇》</div>`;
        popup.addEventListener('click', () => popup.remove());
        document.body.appendChild(popup);
      });
    }

    grid.appendChild(card);
  }
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
  if (levelScreen) levelScreen.classList.toggle('world-view-active', active);
  if (levelTitle) levelTitle.textContent = active ? 'WORLD REALM' : 'SUDOKU ZEN';
  if (levelModeChip) levelModeChip.classList.toggle('hidden', !active);
  if (aliasConfig) aliasConfig.style.display = active ? 'none' : '';
  if (stageView) stageView.style.display = active ? 'none' : 'flex';
  if (tierView) tierView.classList.toggle('hidden', true);
  if (lobby) lobby.classList.toggle('hidden', !active);
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
