import { create } from 'zustand';
import { FileOfferPayload, Transfer } from '@xtrashare/protocol';
import { StorageService } from '../services/storage.js';

export interface PendingOffer {
  transfer: Transfer;
  fileOffer: FileOfferPayload;
}

interface TransferState {
  transfers: Map<string, Transfer>;
  pendingOffer: PendingOffer | null;
  pendingOffers: PendingOffer[];
  history: Transfer[];

  addTransfer: (transfer: Transfer) => void;
  updateTransfer: (id: string, patch: Partial<Transfer>) => void;
  removeTransfer: (id: string) => void;
  addPendingOffer: (offer: PendingOffer) => void;
  removePendingOffer: (transferId: string) => void;
  clearPendingOffers: () => void;
  setPendingOffer: (offer: PendingOffer | null) => void;
  loadHistory: () => Promise<void>;
  clearHistory: () => Promise<void>;
}

export const useTransferStore = create<TransferState>((set, get) => ({
  transfers: new Map(),
  pendingOffer: null,
  pendingOffers: [],
  history: [],

  addTransfer: (transfer) => {
    set((state) => {
      const newMap = new Map(state.transfers);
      newMap.set(transfer.id, transfer);
      return { transfers: newMap };
    });
    // Also save to history
    StorageService.saveTransfer(transfer);
  },

  updateTransfer: (id, patch) => {
    set((state) => {
      const existing = state.transfers.get(id);
      if (!existing) return state;

      const updated = { ...existing, ...patch };
      const newMap = new Map(state.transfers);
      newMap.set(id, updated);

      if (updated.status === 'completed' || updated.status === 'failed' || updated.status === 'rejected') {
        StorageService.saveTransfer(updated);
        // Refresh history list
        get().loadHistory();
      }

      return { transfers: newMap };
    });
  },

  removeTransfer: (id) =>
    set((state) => {
      const newMap = new Map(state.transfers);
      newMap.delete(id);
      return { transfers: newMap };
    }),

  addPendingOffer: (offer) =>
    set((state) => {
      // Don't add duplicate
      if (state.pendingOffers.some((o) => o.transfer.id === offer.transfer.id)) {
        return state;
      }
      const updated = [...state.pendingOffers, offer];
      return {
        pendingOffers: updated,
        pendingOffer: updated[0] || null
      };
    }),

  removePendingOffer: (transferId) =>
    set((state) => {
      const updated = state.pendingOffers.filter((o) => o.transfer.id !== transferId);
      return {
        pendingOffers: updated,
        pendingOffer: updated[0] || null
      };
    }),

  clearPendingOffers: () => set({ pendingOffers: [], pendingOffer: null }),

  setPendingOffer: (pendingOffer) =>
    set({
      pendingOffer,
      pendingOffers: pendingOffer ? [pendingOffer] : []
    }),

  loadHistory: async () => {
    const history = await StorageService.getHistory();
    set({ history });
  },

  clearHistory: async () => {
    await StorageService.clearHistory();
    set({ history: [] });
  }
}));
