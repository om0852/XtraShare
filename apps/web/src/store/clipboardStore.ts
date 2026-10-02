import { create } from 'zustand';
import { ClipboardItemRecord } from '@xtrashare/protocol';

interface ClipboardState {
  items: ClipboardItemRecord[];
  recentHashes: Set<string>;

  addItem: (item: ClipboardItemRecord) => void;
  hasHash: (hash: string) => boolean;
  clearItems: () => void;
}

export const useClipboardStore = create<ClipboardState>((set, get) => ({
  items: [],
  recentHashes: new Set<string>(),

  addItem: (item) => {
    set((state) => {
      const newHashes = new Set(state.recentHashes);
      newHashes.add(item.hash);
      return {
        items: [item, ...state.items].slice(0, 50),
        recentHashes: newHashes
      };
    });
  },

  hasHash: (hash) => get().recentHashes.has(hash),

  clearItems: () => set({ items: [], recentHashes: new Set() })
}));
