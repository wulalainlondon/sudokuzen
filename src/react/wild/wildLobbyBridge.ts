import { useWildLobbyStore, type WildLobbyViewModel } from './wildLobbyStore';

export function bridgeSetWildLobbyVisible(visible: boolean): void {
  useWildLobbyStore.getState().setVisible(visible);
}

export function bridgeSetWildLobbyViewModel(vm: WildLobbyViewModel): void {
  useWildLobbyStore.getState().setViewModel(vm);
}

export function bridgeSetWildLobbyLoading(loading: boolean): void {
  useWildLobbyStore.getState().setLoading(loading);
}

export function bridgeOpenWildMentorNote(title: string, body: string): void {
  useWildLobbyStore.getState().openMentorNote({ title, body });
}

export function bridgeCloseWildMentorNote(): void {
  useWildLobbyStore.getState().closeMentorNote();
}

export function bridgeHasWildMentorNoteOpen(): boolean {
  return !!useWildLobbyStore.getState().mentorNote;
}
