import { get, set, del } from 'idb-keyval';
import { Transfer } from '@xtrashare/protocol';

const HISTORY_KEY = 'xtrashare_transfer_history';

export class StorageService {
  /**
   * Loads transfer history from IndexedDB.
   */
  public static async getHistory(): Promise<Transfer[]> {
    try {
      const history = await get<Transfer[]>(HISTORY_KEY);
      return history || [];
    } catch (err) {
      console.warn('Failed to load history from IndexedDB:', err);
      return [];
    }
  }

  /**
   * Appends or updates a transfer record in history.
   */
  public static async saveTransfer(transfer: Transfer): Promise<void> {
    try {
      const current = (await this.getHistory()) || [];
      const index = current.findIndex((t) => t.id === transfer.id);
      let updated: Transfer[];
      if (index >= 0) {
        current[index] = transfer;
        updated = [...current];
      } else {
        updated = [transfer, ...current].slice(0, 100); // keep up to 100 recent
      }
      await set(HISTORY_KEY, updated);
    } catch (err) {
      console.warn('Failed to save transfer to IndexedDB:', err);
    }
  }

  /**
   * Clears transfer history.
   */
  public static async clearHistory(): Promise<void> {
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
