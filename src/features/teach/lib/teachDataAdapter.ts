import type {
  PracticeItemModel,
  TeachEliminateTarget,
  TeachExampleModel,
  TeachModuleModel,
  TeachStepModel,
} from '../../../entities/teach';
import { getTeachData, getTeachShard } from '../../../data/dataRegistry';
import { t } from '../../../i18n/t';

function normalizeIntArray(raw: unknown): number[] {
  return Array.isArray(raw) ? raw.map(Number).filter((x) => Number.isFinite(x)) : [];
}

function normalizeEliminateCells(raw: unknown): TeachEliminateTarget[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      const obj = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
      return { cell: Number(obj.cell), digit: Number(obj.digit) };
    })
    .filter((item) => Number.isFinite(item.cell) && Number.isFinite(item.digit));
}

function normalizeHighlightDigits(raw: unknown): Record<string, number[]> {
  if (!raw || typeof raw !== 'object') return {};
  const out: Record<string, number[]> = {};
  for (const [k, v] of Object.entries(raw)) {
    out[k] = normalizeIntArray(v);
  }
  return out;
}

function normalizeStep(step: unknown): TeachStepModel {
  const raw = (step && typeof step === 'object' ? step : {}) as Record<string, unknown>;
  const visibleCells = normalizeIntArray(raw.visibleCells);
  const showChain = typeof raw.showChain === 'boolean' ? raw.showChain : undefined;
  const chainMode = raw.chainMode === 'sequential' || raw.chainMode === 'cross' ? raw.chainMode : undefined;
  return {
    text: String(raw.text ?? ''),
    focusCells: normalizeIntArray(raw.focusCells),
    chainCells: normalizeIntArray(raw.chainCells),
    visibleCells: visibleCells.length ? visibleCells : undefined,
    highlightDigits: normalizeHighlightDigits(raw.highlightDigits),
    eliminateCells: normalizeEliminateCells(raw.eliminateCells),
    removedCandidates: raw.removedCandidates ? normalizeEliminateCells(raw.removedCandidates) : undefined,
    showChain,
    chainMode,
    warnCells: normalizeIntArray(raw.warnCells),
    warnDigit: Number.isFinite(Number(raw.warnDigit)) ? Number(raw.warnDigit) : null,
  };
}

function normalizeExample(example: unknown): TeachExampleModel | null {
  if (!example) return null;
  const raw = (example && typeof example === 'object' ? example : {}) as Record<string, unknown>;
  const notes = raw.notes && typeof raw.notes === 'object' ? raw.notes : {};
  const normalizedNotes: Record<string, number[]> = {};
  for (const [k, v] of Object.entries(notes)) {
    normalizedNotes[String(k)] = normalizeIntArray(v);
  }

  return {
    board: normalizeIntArray(raw.board),
    given: normalizeIntArray(raw.given),
    notes: normalizedNotes,
    steps: Array.isArray(raw.steps) ? raw.steps.map(normalizeStep) : [],
  };
}

function normalizePracticeItem(item: unknown): PracticeItemModel {
  const raw = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
  const answer = raw.answer && typeof raw.answer === 'object' ? (raw.answer as Record<string, unknown>) : {};
  const notes =
    raw.notes && typeof raw.notes === 'object' && !Array.isArray(raw.notes)
      ? (raw.notes as Record<string, unknown>)
      : {};
  const normalizedNotes: Record<string, number[]> = {};
  for (const [k, v] of Object.entries(notes)) {
    normalizedNotes[k] = normalizeIntArray(v);
  }
  return {
    board: normalizeIntArray(raw.board),
    given: normalizeIntArray(raw.given),
    notes: normalizedNotes,
    answer: {
      eliminates: Array.isArray(answer.eliminates)
        ? answer.eliminates
            .map((x) => {
              if (Array.isArray(x)) return [Number(x[0]), Number(x[1])] as [number, number];
              const pair = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
              return [Number(pair.cell), Number(pair.digit)] as [number, number];
            })
            .filter((pair: [number, number]) => Number.isFinite(pair[0]) && Number.isFinite(pair[1]))
        : [],
      fills: Array.isArray(answer.fills)
        ? answer.fills
            .map((x) => {
              if (Array.isArray(x)) return [Number(x[0]), Number(x[1])] as [number, number];
              const pair = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
              return [Number(pair.cell), Number(pair.digit)] as [number, number];
            })
            .filter((pair: [number, number]) => Number.isFinite(pair[0]) && Number.isFinite(pair[1]))
        : [],
      patternCells: normalizeIntArray(answer.patternCells),
      description: String(answer.description ?? ''),
      proof: Array.isArray(answer.proof) ? answer.proof.map(String) : [],
      aicChain: Array.isArray(answer.aicChain) ? answer.aicChain.map(String) : [],
    },
    solution: normalizeIntArray(raw.solution),
  };
}

function normalizeModule(key: string, raw: unknown): TeachModuleModel {
  const data = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    stars: Number(key),
    technique: String(data.technique ?? ''),
    name: String(data.name ?? t('miscRuntime.defaultBookName', { key })),
    subtitle: String(data.subtitle ?? ''),
    explanation: Array.isArray(data.explanation) ? data.explanation.map(String) : [],
    example: normalizeExample(data.example),
    demoStory:
      data.demoStory && typeof data.demoStory === 'object' && !Array.isArray(data.demoStory)
        ? (data.demoStory as TeachModuleModel['demoStory'])
        : undefined,
    practice: Array.isArray(data.practice) ? data.practice.map(normalizePracticeItem) : [],
  };
}

function hasUsableTeachPayload(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object') return false;
  const data = raw as Record<string, unknown>;
  const hasName = typeof data.name === 'string' && data.name.trim().length > 0;
  const hasTechnique = typeof data.technique === 'string' && data.technique.trim().length > 0;
  const hasExample = !!(data.example && typeof data.example === 'object');
  return hasName || hasTechnique || hasExample;
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
  if (hasUsableTeachPayload(shard)) return normalizeModule(key, shard);

  // Fall back to full blob (e.g. if shards aren't deployed yet)
  return getTeachModuleByStars(stars);
}
