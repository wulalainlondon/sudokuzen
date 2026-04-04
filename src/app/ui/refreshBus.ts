export type RefreshChannel = 'normal-level-list';

type RefreshListener = () => void;

interface RefreshChannelState {
  queued: boolean;
  listeners: Set<RefreshListener>;
}

const channels: Record<RefreshChannel, RefreshChannelState> = {
  'normal-level-list': {
    queued: false,
    listeners: new Set<RefreshListener>(),
  },
};

export function requestRefresh(channel: RefreshChannel): void {
  const state = channels[channel];
  if (state.queued) return;
  state.queued = true;

  requestAnimationFrame(() => {
    state.queued = false;
    if (state.listeners.size === 0) return;
    state.listeners.forEach((listener) => listener());
  });
}

export function subscribeRefresh(channel: RefreshChannel, listener: RefreshListener): () => void {
  const state = channels[channel];
  state.listeners.add(listener);
  return () => {
    state.listeners.delete(listener);
  };
}

export function __resetRefreshBusForTests(): void {
  (Object.keys(channels) as RefreshChannel[]).forEach((channel) => {
    channels[channel].queued = false;
    channels[channel].listeners.clear();
  });
}
