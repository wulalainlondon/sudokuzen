// Skill panel UI — show/hide/render the skill panel and numpad swap.

import type { SkillModeState } from '../../game/state';
import type { SkillPreview } from './types';
import { t } from '../../i18n/t';

// ── UI refs ──────────────────────────────────────────────────────────

export function getNumpad(): HTMLElement | null {
  return document.getElementById('numpad');
}

export function getSkillPanel(): HTMLElement | null {
  return document.getElementById('skill-panel');
}

// ── Panel swap (numpad ↔ skill panel) ────────────────────────────────

export function showSkillPanel(): void {
  const numpad = getNumpad();
  const panel = getSkillPanel();
  if (numpad) numpad.style.visibility = 'hidden';
  if (panel) panel.classList.remove('hidden');
}

export function hideSkillPanel(): void {
  const numpad = getNumpad();
  const panel = getSkillPanel();
  if (numpad) numpad.style.visibility = '';
  if (panel) panel.classList.add('hidden');
}

// ── Skill panel UI ──────────────────────────────────────────────────

export function updatePanelUI(skill: SkillModeState, preview: SkillPreview | null): void {
  const castBtn = document.getElementById('skill-cast-btn') as HTMLButtonElement | null;
  const fillBtn = document.getElementById('skill-fill-btn') as HTMLButtonElement | null;
  const subtitle = document.getElementById('skill-subtitle');
  const status = document.getElementById('skill-status');
  if (!castBtn || !fillBtn || !subtitle || !status) return;

  const p = preview;

  if (skill.casting && p) {
    subtitle.textContent = `${p.skillName} · {${p.digits?.join(',') ?? '-'}}`;
    status.textContent = skill.castMessage || t('skills.computing');
    castBtn.disabled = true;
    fillBtn.disabled = true;
    castBtn.textContent = t('skills.casting');
    return;
  }

  fillBtn.disabled = false;
  if (p?.valid) {
    subtitle.textContent = `${p.skillName} · {${p.digits?.join(',') ?? ''}}`;
    status.textContent = t('skills.canCast', { unit: p.unitLabel ?? '', count: String(p.targets.length) });
    castBtn.disabled = false;
    castBtn.textContent = `${p.skillName}（-${p.targets.length}）`;
  } else {
    subtitle.textContent = p?.reason || t('skills.noSkillFormed');
    status.textContent = t('skills.selectedCount', { count: String(skill.selectedCells.length) });
    castBtn.disabled = true;
    castBtn.textContent = t('skills.castLabel');
  }
}
