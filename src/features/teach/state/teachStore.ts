import { create } from 'zustand';
import type {
  PracticeResultTone,
  PracticeSessionState,
  TeachFlowState,
  TeachLaunchSource,
  TeachModuleModel,
} from '../../../entities/teach';
import { fetchTeachModule } from '../lib/teachDataAdapter';

type TeachStore = {
  flow: TeachFlowState;
  open: boolean;
  stars: number | null;
  launchSource: TeachLaunchSource;
  module: TeachModuleModel | null;
  stepIndex: number;
  practiceIndex: number;
  practice: PracticeSessionState;
  openTeach: (stars: string | number, source?: TeachLaunchSource) => Promise<boolean>;
  closeTeach: () => void;
  startStepping: () => void;
  nextStep: () => void;
  prevStep: () => void;
  startPractice: () => void;
  toggleSelection: (cell: number, digit: number) => void;
  submitPractice: () => void;
  revealPractice: () => void;
  showHint: () => void;
  retryPractice: () => void;
  backToSteps: () => void;
};

function createPracticeState(overrides?: Partial<PracticeSessionState>): PracticeSessionState {
  return {
    selected: new Set(),
    revealed: false,
    message: '',
    success: false,
    tone: 'neutral',
    hintLevel: 0,
    ...overrides,
  };
}

function formatPracticeExplanation(answer: { description: string; aicChain: string[]; proof: string[] }): string {
  const lines: string[] = [];
  if (answer.description) lines.push(answer.description);
  if (answer.aicChain.length) {
    lines.push('');
    lines.push('推理節點鏈：');
    answer.aicChain.forEach((line, i) => lines.push(`${i + 1}. ${line}`));
  }
  if (answer.proof.length) {
    lines.push('');
    lines.push('推理鏈：');
    answer.proof.forEach((line, i) => lines.push(`${i + 1}. ${line}`));
  }
  return lines.join('\n');
}

function markTeachRead(stars: number | null): void {
  if (stars === null || !Number.isFinite(stars)) return;
  const read = JSON.parse(localStorage.getItem('sudoku_teach_read') || '{}');
  read[String(stars)] = true;
  localStorage.setItem('sudoku_teach_read', JSON.stringify(read));
}

function markPracticeDone(stars: number | null): void {
  if (stars === null || !Number.isFinite(stars)) return;
  const done = JSON.parse(localStorage.getItem('sudoku_practice_done') || '{}');
  done[String(stars)] = true;
  localStorage.setItem('sudoku_practice_done', JSON.stringify(done));
}

function maybeRestoreLibrary(source: TeachLaunchSource): void {
  if (source !== 'library') return;
  const w = window as Window & { openLibraryOverlay?: () => void; renderLibraryCards?: () => void };
  w.renderLibraryCards?.();
  w.openLibraryOverlay?.();
}

export const useTeachStore = create<TeachStore>((set, get) => ({
  flow: 'idle',
  open: false,
  stars: null,
  launchSource: 'tier',
  module: null,
  stepIndex: 0,
  practiceIndex: 0,
  practice: createPracticeState(),

  openTeach: async (stars, source = 'tier') => {
    set({ flow: 'loading', open: true, stars: Number(stars), launchSource: source });
    const module = await fetchTeachModule(stars);
    if (!module) {
      set({ flow: 'idle', open: false, stars: null, module: null, launchSource: 'tier' });
      return false;
    }

    // Start with demo if the technique has elimination steps
    const hasElim = module.example?.steps.some((s) => s.eliminateCells.length > 0) ?? false;
    set({
      flow: hasElim ? 'demo' : 'stepping',
      open: true,
      stars: Number(stars),
      launchSource: source,
      module,
      stepIndex: 0,
      practiceIndex: 0,
      practice: createPracticeState(),
    });
    return true;
  },

  startStepping: () => {
    set({ flow: 'stepping', stepIndex: 0 });
  },

  closeTeach: () => {
    const { stars, launchSource } = get();
    markTeachRead(stars);
    maybeRestoreLibrary(launchSource);

    set({
      flow: 'idle',
      open: false,
      stars: null,
      launchSource: 'tier',
      module: null,
      stepIndex: 0,
      practiceIndex: 0,
      practice: createPracticeState(),
    });
  },

  nextStep: () => {
    const { module, stepIndex } = get();
    const max = Math.max((module?.example?.steps.length ?? 1) - 1, 0);
    set({ stepIndex: Math.min(stepIndex + 1, max) });
  },

  prevStep: () => {
    const { stepIndex } = get();
    set({ stepIndex: Math.max(stepIndex - 1, 0) });
  },

  startPractice: () => {
    const { module } = get();
    const total = module?.practice.length ?? 0;
    if (!total) {
      set({
        flow: 'result',
        practice: createPracticeState({ success: true, tone: 'success', message: '本秘笈目前沒有練習題。' }),
      });
      return;
    }

    const idx = Math.floor(Math.random() * total);
    set({ flow: 'practice', practiceIndex: idx, practice: createPracticeState() });
  },

  toggleSelection: (cell, digit) => {
    const { practice } = get();
    if (practice.revealed) return;

    const key = `${cell}:${digit}`;
    const selected = new Set(practice.selected);
    if (selected.has(key)) selected.delete(key);
    else selected.add(key);

    set({
      practice: {
        ...practice,
        selected,
        message: '',
        tone: 'neutral',
      },
    });
  },

  submitPractice: () => {
    const { module, practiceIndex, practice, stars } = get();
    if (practice.revealed) return;

    const item = module?.practice[practiceIndex];
    if (!item) return;

    const correctSet = new Set(item.answer.eliminates.map(([c, d]) => `${c}:${d}`));
    const selectedSet = new Set(practice.selected);

    let wrongCount = 0;
    let correctCount = 0;

    for (const key of selectedSet) {
      if (correctSet.has(key)) correctCount += 1;
      else wrongCount += 1;
    }

    const missingCount = correctSet.size - correctCount;

    if (wrongCount === 0 && missingCount === 0) {
      markPracticeDone(stars);
      set({
        flow: 'result',
        practice: {
          ...practice,
          revealed: true,
          success: true,
          tone: 'success' satisfies PracticeResultTone,
          message: '太棒了！完全正確！',
        },
      });
      return;
    }

    if (wrongCount === 0 && missingCount > 0) {
      // Partial: tell the user which REGION to look at
      const missingKeys = [...correctSet].filter((k) => !selectedSet.has(k));
      const missingCells = missingKeys.map((k) => parseInt(k.split(':')[0]));
      const regions = new Set<string>();
      for (const c of missingCells) {
        const r = Math.floor(c / 9);
        const col = c % 9;
        const box = Math.floor(r / 3) * 3 + Math.floor(col / 3);
        regions.add(`R${r + 1}`);
        regions.add(`C${col + 1}`);
        regions.add(`Box${box + 1}`);
      }
      const hint = regions.size <= 3 ? `，留意 ${[...regions].slice(0, 2).join('、')} 附近` : '';
      set({
        flow: 'practice',
        practice: {
          ...practice,
          success: false,
          tone: 'partial',
          message: `還有 ${missingCount} 個候選數可以消去${hint}`,
        },
      });
      return;
    }

    // Error: explain which selections were wrong and why
    const wrongKeys = [...selectedSet].filter((k) => !correctSet.has(k));
    const wrongDescs = wrongKeys.slice(0, 2).map((k) => {
      const [c, d] = k.split(':').map(Number);
      return `R${Math.floor(c / 9) + 1}C${(c % 9) + 1} 的 ${d}`;
    });
    const wrongMsg = wrongDescs.join('、') + ' 不應消去 — 該候選仍有存在的可能';

    const cleaned = new Set([...selectedSet].filter((k) => correctSet.has(k)));
    set({
      flow: 'practice',
      practice: {
        ...practice,
        selected: cleaned,
        success: false,
        tone: 'error',
        message: wrongMsg,
      },
    });
  },

  showHint: () => {
    const { module, practiceIndex, practice } = get();
    const item = module?.practice[practiceIndex];
    if (!item) return;

    const nextHint = practice.hintLevel + 1;

    if (nextHint === 1) {
      // Technique-specific hint based on module name
      const { module: mod } = get();
      const techName = mod?.name || '技巧';
      const techHint = mod?.subtitle || '觀察候選數之間的關係';
      set({
        practice: {
          ...practice,
          hintLevel: nextHint,
          message: `提示（${techName}）：${techHint}。留意藍色高亮的關鍵格。`,
          tone: 'neutral',
        },
      });
      return;
    }

    if (nextHint === 2) {
      // Full explanation from answer data
      const explanation = formatPracticeExplanation(item.answer);
      const fallback = item.answer.description || '觀察候選的關係鏈，找到可消去的候選。';
      set({
        practice: {
          ...practice,
          hintLevel: nextHint,
          message: explanation || fallback,
          tone: 'neutral',
        },
      });
      return;
    }

    get().revealPractice();
  },

  revealPractice: () => {
    const { module, practiceIndex, practice } = get();
    const item = module?.practice[practiceIndex];
    if (!item) return;

    const selected = new Set(item.answer.eliminates.map(([c, d]) => `${c}:${d}`));
    set({
      flow: 'result',
      practice: {
        ...practice,
        selected,
        revealed: true,
        success: true,
        tone: 'neutral',
        message: formatPracticeExplanation(item.answer) || '答案已顯示',
      },
    });
  },

  retryPractice: () => {
    const { module } = get();
    const total = module?.practice.length ?? 0;
    if (!total) return;
    // Pick a different random puzzle if possible
    const currentIdx = get().practiceIndex;
    let idx = Math.floor(Math.random() * total);
    if (total > 1 && idx === currentIdx) idx = (idx + 1) % total;
    set({ flow: 'practice', practiceIndex: idx, practice: createPracticeState() });
  },

  backToSteps: () => {
    set({ flow: 'stepping', practice: createPracticeState() });
  },
}));
