import type {
  PracticeItemModel,
  TeachEliminateTarget,
  TeachExampleModel,
  TeachModuleModel,
  TeachStepModel,
} from '../../../entities/teach';
import { getTeachData, getTeachShard } from '../../../data/dataRegistry';

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
    removedCandidates: step?.removedCandidates ? normalizeEliminateCells(step.removedCandidates) : undefined,
    showChain: step?.showChain ?? undefined,
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

function normalizeModule(key: string, raw: any): TeachModuleModel {
  return {
    stars: Number(key),
    technique: String(raw.technique ?? ''),
    name: String(raw.name ?? `第 ${key} 秘笈`),
    subtitle: String(raw.subtitle ?? ''),
    explanation: Array.isArray(raw.explanation) ? raw.explanation.map(String) : [],
    example: normalizeExample(raw.example),
    demoStory: raw.demoStory ?? undefined,
    practice: Array.isArray(raw.practice) ? raw.practice.map(normalizePracticeItem) : [],
  };
}

/**
 * Synchronous accessor — uses full TEACH_DATA blob (legacy compat).
 * Prefer fetchTeachModule() for lazy loading.
 */
export function getTeachModuleByStars(stars: string | number): TeachModuleModel | null {
  const key = String(stars);
  const teachData = getTeachData();
  const raw = teachData?.[key];
  if (!raw) return null;
  return normalizeModule(key, raw);
}

/**
 * Async accessor — fetches individual shard on demand (Phase 3).
 * Falls back to sync blob if shard fetch fails.
 */
export async function fetchTeachModule(stars: string | number): Promise<TeachModuleModel | null> {
  const key = String(stars);

  // Try lazy shard first
  const shard = await getTeachShard(key);
  if (shard) return normalizeModule(key, shard);

  // Fall back to full blob (e.g. if shards aren't deployed yet)
  return getTeachModuleByStars(stars);
}
