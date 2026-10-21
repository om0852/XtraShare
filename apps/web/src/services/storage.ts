import { get, set, del } from 'idb-keyval';
import { Transfer, MAX_RECENT_TRANSFERS } from '@xtrashare/protocol';

const HISTORY_KEY = 'xtrashare_transfer_history';

export class StorageService {
  private static pendingSaves = new Map<string, Transfer>();
  private static flushTimeout: any = null;

  /**
   * Loads transfer history from IndexedDB, merging in-flight pending saves.
   */
  public static async getHistory(): Promise<Transfer[]> {
    try {
      const history = (await get<Transfer[]>(HISTORY_KEY)) || [];
      if (this.pendingSaves.size === 0) {
        return history;
      }
      const map = new Map(history.map((t) => [t.id, t]));
      for (const t of this.pendingSaves.values()) {
        map.set(t.id, t);
      }
      return Array.from(map.values()).slice(0, MAX_RECENT_TRANSFERS);
    } catch (err) {
      console.warn('Failed to load history from IndexedDB:', err);
      return Array.from(this.pendingSaves.values()).slice(0, MAX_RECENT_TRANSFERS);
    }
  }

  /**
   * Appends or updates a transfer record in history.
   * Batches rapid writes within a 100ms window to prevent saturating IndexedDB transactions.
   */
  public static async saveTransfer(transfer: Transfer): Promise<void> {
    this.pendingSaves.set(transfer.id, transfer);

    if (!this.flushTimeout) {
      this.flushTimeout = setTimeout(() => {
        this.flushTimeout = null;
        this.flushPendingSaves().catch(() => {});
      }, 100);
    }
  }

  /**
   * Forces an immediate commit of all pending transfer history updates.
   */
  public static async flushPendingSaves(): Promise<void> {
    if (this.pendingSaves.size === 0) return;

    const toFlush = Array.from(this.pendingSaves.values());
    this.pendingSaves.clear();

    try {
      const current = (await get<Transfer[]>(HISTORY_KEY)) || [];
      const map = new Map(current.map((t) => [t.id, t]));
      for (const t of toFlush) {
        map.set(t.id, t);
      }
      const updated = Array.from(map.values())
        .sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0))
        .slice(0, MAX_RECENT_TRANSFERS);

      await set(HISTORY_KEY, updated);
    } catch (err) {
      console.warn('Failed to flush transfers to IndexedDB:', err);
    }
  }

  /**
   * Clears transfer history.
   */
  public static async clearHistory(): Promise<void> {
    this.pendingSaves.clear();
    if (this.flushTimeout) {
      clearTimeout(this.flushTimeout);
      this.flushTimeout = null;
    }
    await del(HISTORY_KEY);
  }

  /**
   * Stores a binary chunk array in IndexedDB staging for very large files.
   */
  public static async saveChunk(transferId: string, sequence: number, data: ArrayBuffer): Promise<void> {
    const key = `chunk_${transferId}_${sequence}`;
    await set(key, data);
  }

  public static async getChunk(transferId: string, sequence: number): Promise<ArrayBuffer | undefined> {
    const key = `chunk_${transferId}_${sequence}`;
    return await get<ArrayBuffer>(key);
  }

  public static async cleanupTransferChunks(transferId: string, totalChunks: number): Promise<void> {
    for (let i = 0; i < totalChunks; i++) {
      const key = `chunk_${transferId}_${i}`;
      del(key).catch(() => {});
    }
  }
}
