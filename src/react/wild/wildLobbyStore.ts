import { create } from 'zustand';

export type EnterButtonState = 'idle' | 'resume_saved' | 'session_continue' | 'session_new' | 'loading';
export type BestiaryFilter = 'all' | 'discovered' | 'conquered';
export type RarityFilter = 'all' | 'common' | 'rare' | 'legendary' | 'mythic';

export interface WildLobbyViewModel {
  iqLevel: number;
  levelTitle: string;
  equippedTitle: string;
  expFillPct: number;
  expText: string;
  completed: number;
  discovered: number;
  encounters: number;
  sessionRoundText: string;
  sessionFillPct: number;
  sessionMetaText: string;
  sessionTechText: string;
  enterChip: string;
  enterText: string;
  enterSub: string;
  enterState: EnterButtonState;
  hasSavedEncounter: boolean;
  autoCastVisible: boolean;
  autoCastEnabled: boolean;
  autoCastHint: string;
  autoCastTitle: string;
  bestiaryDiscovered: number;
  bestiaryTotal: number;
  bestiaryFilter: BestiaryFilter;
  rarityFilter: RarityFilter;
}

export interface WildMentorNote {
  title: string;
  body: string;
}

export interface WildLobbyState {
  visible: boolean;
  vm: WildLobbyViewModel | null;
  mentorNote: WildMentorNote | null;
  loading: boolean;
  onlineCount: number;
  setVisible: (visible: boolean) => void;
  setViewModel: (vm: WildLobbyViewModel) => void;
  setLoading: (loading: boolean) => void;
  setOnlineCount: (count: number) => void;
  openMentorNote: (note: WildMentorNote) => void;
  closeMentorNote: () => void;
}

export const useWildLobbyStore = create<WildLobbyState>((set) => ({
  visible: false,
  vm: null,
  mentorNote: null,
  loading: false,
  onlineCount: 0,
  setVisible: (visible) => set({ visible }),
  setViewModel: (vm) => set({ vm }),
  setLoading: (loading) => set({ loading }),
  setOnlineCount: (count) => set({ onlineCount: Math.max(0, Math.floor(count)) }),
  openMentorNote: (note) => set({ mentorNote: note }),
  closeMentorNote: () => set({ mentorNote: null }),
}));
