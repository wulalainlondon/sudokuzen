// Shared types for the skill system.

import type { CellData } from '../../game/state';

export type LitCandidate = { cell: number; digit: number };

export interface SkillPreview {
  valid: boolean;
  reason?: string;
  skillId: string;
  skillName: string;
  skillSubtitle: string;
  sourceCells: number[];
  targets: LitCandidate[];
  digits?: number[];
  unitLabel?: string;
  sweepDirection: 'outward' | 'inward';
}

export interface SkillDetector {
  id: string;
  name: string;
  subtitle: string;
  sweepDirection: 'outward' | 'inward';
  /** Evaluate whether selectedCells form this skill's pattern. */
  evaluate(selectedCells: number[], cells: CellData[]): SkillPreview;
  /** Execute the elimination. Mutates cells in place. */
  execute(cells: CellData[], preview: SkillPreview): SkillPreview;
}

/** Build a default "not valid" preview for a skill. */
export function makeEmptyPreview(detector: { id: string; name: string; subtitle: string; sweepDirection: 'outward' | 'inward' }, reason: string): SkillPreview {
  return {
    valid: false,
    reason,
    skillId: detector.id,
    skillName: detector.name,
    skillSubtitle: detector.subtitle,
    sourceCells: [],
    targets: [],
    sweepDirection: detector.sweepDirection,
  };
}

/** Get shared units (row/col/box) between two cells. */
export function getSharedUnits(a: number, b: number): { unitIndex: number; unitType: 'row' | 'col' | 'box'; label: string }[] {
  const rowA = Math.floor(a / 9), colA = a % 9;
  const rowB = Math.floor(b / 9), colB = b % 9;
  const boxA = Math.floor(rowA / 3) * 3 + Math.floor(colA / 3);
  const boxB = Math.floor(rowB / 3) * 3 + Math.floor(colB / 3);
  const shared: { unitIndex: number; unitType: 'row' | 'col' | 'box'; label: string }[] = [];
  if (rowA === rowB) shared.push({ unitIndex: rowA, unitType: 'row', label: `第 ${rowA + 1} 列` });
  if (colA === colB) shared.push({ unitIndex: colA, unitType: 'col', label: `第 ${colA + 1} 欄` });
  if (boxA === boxB) shared.push({ unitIndex: boxA, unitType: 'box', label: `第 ${boxA + 1} 宮` });
  return shared;
}

/** Get all cell indices in a unit. */
export function getUnitCells(unitType: 'row' | 'col' | 'box', unitIndex: number): number[] {
  const cells: number[] = [];
  if (unitType === 'row') {
    for (let c = 0; c < 9; c++) cells.push(unitIndex * 9 + c);
  } else if (unitType === 'col') {
    for (let r = 0; r < 9; r++) cells.push(r * 9 + unitIndex);
  } else {
    const br = Math.floor(unitIndex / 3) * 3;
    const bc = (unitIndex % 3) * 3;
    for (let r = br; r < br + 3; r++) {
      for (let c = bc; c < bc + 3; c++) cells.push(r * 9 + c);
    }
  }
  return cells;
}
