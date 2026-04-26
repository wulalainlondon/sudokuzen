// Shared types for the skill system.

import type { CellData } from '../../game/state';
import { t } from '../../i18n/t';

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
  // Ordered node sequence for AIC-type skills.
  // Link between chainPath[i] and chainPath[i+1] is STRONG when i is even, WEAK when i is odd.
  chainPath?: { cell: number; digit: number }[];
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
export function makeEmptyPreview(
  detector: { id: string; name: string; subtitle: string; sweepDirection: 'outward' | 'inward' },
  reason: string,
): SkillPreview {
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
export function getSharedUnits(
  a: number,
  b: number,
): { unitIndex: number; unitType: 'row' | 'col' | 'box'; label: string }[] {
  const rowA = Math.floor(a / 9),
    colA = a % 9;
  const rowB = Math.floor(b / 9),
    colB = b % 9;
  const boxA = Math.floor(rowA / 3) * 3 + Math.floor(colA / 3);
  const boxB = Math.floor(rowB / 3) * 3 + Math.floor(colB / 3);
  const shared: { unitIndex: number; unitType: 'row' | 'col' | 'box'; label: string }[] = [];
  if (rowA === rowB)
    shared.push({ unitIndex: rowA, unitType: 'row', label: t('skills.unitRow', { n: String(rowA + 1) }) });
  if (colA === colB)
    shared.push({ unitIndex: colA, unitType: 'col', label: t('skills.unitCol', { n: String(colA + 1) }) });
  if (boxA === boxB)
    shared.push({ unitIndex: boxA, unitType: 'box', label: t('skills.unitBox', { n: String(boxA + 1) }) });
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

/** Check if cell A can see cell B (same row, col, or box). */
export function cellsSeeEachOther(a: number, b: number): boolean {
  const rowA = Math.floor(a / 9),
    colA = a % 9;
  const rowB = Math.floor(b / 9),
    colB = b % 9;
  if (rowA === rowB || colA === colB) return true;
  const boxA = Math.floor(rowA / 3) * 3 + Math.floor(colA / 3);
  const boxB = Math.floor(rowB / 3) * 3 + Math.floor(colB / 3);
  return boxA === boxB;
}

/** Get all peers (cells that can see this cell). */
export function getCellPeers(idx: number): number[] {
  const row = Math.floor(idx / 9),
    col = idx % 9;
  const peers = new Set<number>();
  for (let c = 0; c < 9; c++) peers.add(row * 9 + c);
  for (let r = 0; r < 9; r++) peers.add(r * 9 + col);
  const br = Math.floor(row / 3) * 3,
    bc = Math.floor(col / 3) * 3;
  for (let r = br; r < br + 3; r++) for (let c = bc; c < bc + 3; c++) peers.add(r * 9 + c);
  peers.delete(idx);
  return [...peers];
}

/** Get common peers of multiple cells. */
export function getCommonPeers(cells: number[]): number[] {
  if (cells.length === 0) return [];
  const sets = cells.map((c) => new Set(getCellPeers(c)));
  return [...sets[0]].filter((p) => sets.every((s) => s.has(p)));
}
