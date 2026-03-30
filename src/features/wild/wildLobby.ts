// Wild Lobby UI — profile display, bestiary grid, entry point.

import { loadWildProfile, saveWildProfile } from './wildState';
import { TECHNIQUE_TABLE, getAutoCastKeys } from './techniqueMeta';
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

// ── Render lobby ─────────────────────────────────────────────────────

export function renderWildLobby(): void {
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

  if (levelEl) levelEl.textContent = `Lv.${profile.iqLevel}`;
  if (titleEl) titleEl.textContent = getLevelTitle(profile.iqLevel);
  if (expFill) expFill.style.width = `${(progress * 100).toFixed(1)}%`;
  if (expText) expText.textContent = `${expInLevel} / ${expNeeded} EXP`;
  if (completedEl) completedEl.textContent = String(profile.puzzlesCompleted);
  if (discoveredEl) discoveredEl.textContent = String(Object.keys(profile.bestiary).length);
  if (encountersEl) encountersEl.textContent = String(profile.totalEncounters);

  // Auto-cast toggle
  const toggleBtn = document.getElementById('wild-autocast-toggle');
  const hintEl = document.getElementById('wild-autocast-hint');
  if (toggleBtn) {
    toggleBtn.classList.toggle('active', profile.autoCastEnabled);
    toggleBtn.setAttribute('aria-checked', String(profile.autoCastEnabled));
  }
  if (hintEl) {
    if (profile.autoCastEnabled) {
      const autoKeys = getAutoCastKeys(profile.iqLevel);
      if (autoKeys.size > 0) {
        const names = TECHNIQUE_TABLE
          .filter(t => autoKeys.has(t.key))
          .map(t => t.name);
        hintEl.textContent = `已精通 ${names.length} 項：${names.join('、')}`;
      } else {
        hintEl.textContent = '尚未精通任何技巧';
      }
    } else {
      hintEl.textContent = '所有技巧皆需手動施放';
    }
  }

  // Bestiary count
  const countEl = document.getElementById('wild-bestiary-count');
  const discovered = Object.keys(profile.bestiary).length;
  if (countEl) countEl.textContent = `${discovered} / ${TECHNIQUE_TABLE.length}`;

  // Bestiary grid
  const grid = document.getElementById('wild-bestiary-grid');
  if (!grid) return;
  grid.innerHTML = '';

  for (const tech of TECHNIQUE_TABLE) {
    const entry = profile.bestiary[tech.key];
    const card = document.createElement('div');
    card.className = `wild-beast-card rarity-${tech.rarity}`;
    if (!entry) card.classList.add('undiscovered');

    const nameSpan = document.createElement('div');
    nameSpan.className = 'wild-beast-name';
    nameSpan.textContent = entry ? tech.name : '？';

    const subSpan = document.createElement('div');
    subSpan.className = 'wild-beast-sub';
    subSpan.textContent = entry ? tech.subtitle : '未發現';

    card.appendChild(nameSpan);
    card.appendChild(subSpan);

    if (entry) {
      const killsSpan = document.createElement('div');
      killsSpan.className = 'wild-beast-kills';
      killsSpan.textContent = `${entry.kills}/${entry.encounters}`;
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

export function openWildLobby(): void {
  renderWildLobby();
  const stageView = document.getElementById('stage-view');
  const lobby = document.getElementById('wild-lobby');
  if (stageView) stageView.style.display = 'none';
  if (lobby) lobby.classList.remove('hidden');
}

export function closeWildLobby(): void {
  const stageView = document.getElementById('stage-view');
  const lobby = document.getElementById('wild-lobby');
  if (lobby) lobby.classList.add('hidden');
  if (stageView) stageView.style.display = '';
}
