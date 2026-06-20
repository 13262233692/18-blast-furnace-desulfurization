import { create } from 'zustand';
import type { AppState, DesulfurizationData } from '@/data/types';

export const useStore = create<AppState>((set, get) => ({
  currentIndex: 0,
  playbackState: 'paused',
  playbackSpeed: 1,
  data: null,

  setCurrentIndex: (index: number) => set({ currentIndex: index }),
  setPlaybackState: (state) => set({ playbackState: state }),
  setPlaybackSpeed: (speed: number) => set({ playbackSpeed: speed }),
  setData: (data: DesulfurizationData) => set({ data }),
  incrementIndex: () => {
    const { currentIndex, data, playbackState } = get();
    if (!data || playbackState !== 'playing') return;
    const next = currentIndex + 1;
    if (next >= data.frameCount) {
      set({ playbackState: 'paused', currentIndex: 0 });
    } else {
      set({ currentIndex: next });
    }
  },
}));
