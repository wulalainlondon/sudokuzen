import type { CastChoreography } from './castChoreography';

let runtime: typeof import('./castChoreography') | null = null;
let loading: Promise<void> | null = null;

export function isSkillRuntimeReady(): boolean {
  return runtime !== null;
}

export function loadSkillRuntime(): Promise<void> {
  if (runtime) return Promise.resolve();
  if (loading) return loading;
  loading = Promise.all([import('./skillDetectors'), import('./castChoreography')])
    .then(([, choreography]) => {
      runtime = choreography;
    })
    .catch((error) => {
      loading = null;
      throw error;
    });
  return loading;
}

export function getChoreography(skillId: string): CastChoreography {
  if (!runtime) throw new Error('Skill runtime has not loaded');
  return runtime.getChoreography(skillId);
}

export function showChainPreview(grid: HTMLElement, chain: { cell: number; digit: number }[]): void {
  runtime?.showChainPreview(grid, chain);
}

export function clearChainPreview(): void {
  runtime?.clearChainPreview();
}
