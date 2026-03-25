import type {
  PracticeItemModel,
  TeachEliminateTarget,
  TeachExampleModel,
  TeachModuleModel,
  TeachStepModel,
} from '../../../entities/teach';

function normalizeIntArray(raw: any): number[] {
  return Array.isArray(raw) ? raw.map(Number).filter((x) => Number.isFinite(x)) : [];
}

function normalizeEliminateCells(raw: any): TeachEliminateTarget[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => ({ cell: Number(item?.cell), digit: Number(item?.digit) }))
    .filter((item) => Number.isFinite(item.cell) && Number.isFinite(item.digit));
}

function normalizeHighlightDigits(raw: any): Record<string, number[]> {
  if (!raw || typeof raw !== 'object') return {};
  const out: Record<string, number[]> = {};
  for (const [k, v] of Object.entries(raw)) {
    out[k] = normalizeIntArray(v);
  }
  return out;
}

function normalizeStep(step: any): TeachStepModel {
  const visibleCells = normalizeIntArray(step?.visibleCells);
  return {
    text: String(step?.text ?? ''),
    focusCells: normalizeIntArray(step?.focusCells),
    visibleCells: visibleCells.length ? visibleCells : undefined,
    highlightDigits: normalizeHighlightDigits(step?.highlightDigits),
    eliminateCells: normalizeEliminateCells(step?.eliminateCells),
    warnCells: normalizeIntArray(step?.warnCells),
    warnDigit: Number.isFinite(Number(step?.warnDigit)) ? Number(step.warnDigit) : null,
  };
}

function normalizeExample(example: any): TeachExampleModel | null {
  if (!example) return null;
  const notes = example.notes && typeof example.notes === 'object' ? example.notes : {};
  const normalizedNotes: Record<string, number[]> = {};
  for (const [k, v] of Object.entries(notes)) {
    normalizedNotes[String(k)] = normalizeIntArray(v);
  }

  return {
    board: normalizeIntArray(example.board),
    given: normalizeIntArray(example.given),
    notes: normalizedNotes,
    steps: Array.isArray(example.steps) ? example.steps.map(normalizeStep) : [],
  };
}

function normalizePracticeItem(item: any): PracticeItemModel {
  const answer = item?.answer ?? {};
  return {
    board: normalizeIntArray(item?.board),
    given: normalizeIntArray(item?.given),
    notes: item?.notes && typeof item.notes === 'object' ? item.notes : {},
    answer: {
      eliminates: Array.isArray(answer.eliminates)
        ? answer.eliminates
            .map((x: any) => [Number(x?.cell ?? x?.[0]), Number(x?.digit ?? x?.[1])] as [number, number])
            .filter((pair: [number, number]) => Number.isFinite(pair[0]) && Number.isFinite(pair[1]))
        : [],
      patternCells: normalizeIntArray(answer.patternCells),
      description: String(answer.description ?? ''),
      proof: Array.isArray(answer.proof) ? answer.proof.map(String) : [],
      aicChain: Array.isArray(answer.aicChain) ? answer.aicChain.map(String) : [],
    },
    solution: normalizeIntArray(item?.solution),
  };
}

export function getTeachModuleByStars(stars: string | number): TeachModuleModel | null {
  const key = String(stars);
  const unsafeGlobalTeachData = (globalThis as any)['TEACH_DATA'];
  const teachData =
    (window as any).TEACH_DATA ??
    (globalThis as any).TEACH_DATA ??
    unsafeGlobalTeachData;
  const raw = teachData?.[key];
  if (!raw) return null;

  return {
    stars: Number(key),
    technique: String(raw.technique ?? ''),
    name: String(raw.name ?? `第 ${key} 秘笈`),
    subtitle: String(raw.subtitle ?? ''),
    explanation: Array.isArray(raw.explanation) ? raw.explanation.map(String) : [],
    example: normalizeExample(raw.example),
    practice: Array.isArray(raw.practice) ? raw.practice.map(normalizePracticeItem) : [],
  };
}
