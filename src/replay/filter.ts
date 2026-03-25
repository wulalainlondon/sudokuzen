export type ReplayAction = { type: string };

export function filterReplayActions(actions: ReplayAction[], filter: 'all' | 'mistake' | 'key'): ReplayAction[] {
  if (filter === 'mistake') return actions.filter((a) => a.type === 'mistake');
  if (filter === 'key') return actions.filter((a) => ['fill', 'mistake', 'quick_note'].includes(a.type));
  return actions;
}
