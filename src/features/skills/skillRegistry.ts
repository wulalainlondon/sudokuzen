import type { CellData } from '../../game/state';
import type { SkillDetector, SkillPreview } from './types';

const registry: SkillDetector[] = [];

export function registerSkill(detector: SkillDetector): void {
  registry.push(detector);
}

/** Evaluate selectedCells against all registered skills. Returns first valid match or best miss. */
export function evaluateAllSkills(selectedCells: number[], cells: CellData[]): SkillPreview {
  let bestMiss: SkillPreview | null = null;

  for (const skill of registry) {
    const result = skill.evaluate(selectedCells, cells);
    if (result.valid) return result;
    if (!bestMiss || (result.reason && result.reason.length > (bestMiss.reason?.length ?? 0))) {
      bestMiss = result;
    }
  }

  return bestMiss ?? {
    valid: false,
    reason: '未構成任何招式',
    skillId: '',
    skillName: '',
    skillSubtitle: '',
    sourceCells: [],
    targets: [],
    sweepDirection: 'outward',
  };
}

export function getSkillById(id: string): SkillDetector | undefined {
  return registry.find((s) => s.id === id);
}
