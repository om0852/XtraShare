export interface StoredReceiverSession {
  transferId: string;
  roomId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  totalChunks: number;
  senderId: string;
  senderName: string;
  receivedBytes: number;
  receivedCount: number;
  lastSequence: number;
  updatedAt: number;
}

const DB_NAME = 'xtrashare_db';
const DB_VERSION = 1;
const SESSIONS_STORE = 'receiver_sessions';
const CHUNKS_STORE = 'chunks';

class ChunkStorage {
  private dbPromise: Promise<IDBDatabase> | null = null;

  private getDB(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise((resolve, reject) => {
      if (typeof window === 'undefined' || !window.indexedDB) {
        return reject(new Error('IndexedDB not supported in this environment'));
      }

      const request = window.indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(SESSIONS_STORE)) {
          db.createObjectStore(SESSIONS_STORE, { keyPath: 'transferId' });
        }
        if (!db.objectStoreNames.contains(CHUNKS_STORE)) {
          db.createObjectStore(CHUNKS_STORE);
        }
      };

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = () => {
        reject(request.error || new Error('Failed to open IndexedDB'));
      };
    });

    return this.dbPromise;
  }

  public async saveSession(session: StoredReceiverSession): Promise<void> {
    try {
      const db = await this.getDB();
      const tx = db.transaction(SESSIONS_STORE, 'readwrite');
      const store = tx.objectStore(SESSIONS_STORE);
      store.put(session);
      return new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (err) {
      console.warn('[ChunkStorage] Failed to save session:', err);
    }
  }

  public async getSession(transferId: string): Promise<StoredReceiverSession | null> {
    try {
      const db = await this.getDB();
      const tx = db.transaction(SESSIONS_STORE, 'readonly');
      const store = tx.objectStore(SESSIONS_STORE);
      const req = store.get(transferId);
      return new Promise((resolve) => {
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      });
    } catch {
      return null;
    }
  }

  public async getAllActiveSessions(): Promise<StoredReceiverSession[]> {
    try {
      const db = await this.getDB();
      const tx = db.transaction(SESSIONS_STORE, 'readonly');
      const store = tx.objectStore(SESSIONS_STORE);
      const req = store.getAll();
      return new Promise((resolve) => {
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve([]);
      });
    } catch {
      return [];
    }
  }

  public async saveChunk(transferId: string, sequence: number, buffer: ArrayBuffer): Promise<void> {
    try {
      const db = await this.getDB();
      const tx = db.transaction(CHUNKS_STORE, 'readwrite');
      const store = tx.objectStore(CHUNKS_STORE);
      store.put(buffer, `${transferId}_${sequence}`);
      return new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (err) {
      console.warn(`[ChunkStorage] Failed to store chunk ${sequence}:`, err);
    }
  }

  public async getChunk(transferId: string, sequence: number): Promise<ArrayBuffer | null> {
    try {
      const db = await this.getDB();
      const tx = db.transaction(CHUNKS_STORE, 'readonly');
      const store = tx.objectStore(CHUNKS_STORE);
      const req = store.get(`${transferId}_${sequence}`);
      return new Promise((resolve) => {
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      });
    } catch {
      return null;
    }
  }

  public async getAllChunks(transferId: string, totalChunks: number): Promise<(ArrayBuffer | null)[]> {
    const db = await this.getDB();
    const chunks: (ArrayBuffer | null)[] = new Array(totalChunks).fill(null);

    return new Promise((resolve) => {
      const tx = db.transaction(CHUNKS_STORE, 'readonly');
      const store = tx.objectStore(CHUNKS_STORE);

      let pending = totalChunks;
      for (let i = 0; i < totalChunks; i++) {
        const req = store.get(`${transferId}_${i}`);
        const index = i;
        req.onsuccess = () => {
          if (req.result) {
            chunks[index] = req.result;
          }
          pending--;
          if (pending === 0) resolve(chunks);
        };
        req.onerror = () => {
          pending--;
          if (pending === 0) resolve(chunks);
        };
      }
    });
  }

  public async deleteSession(transferId: string): Promise<void> {
    try {
      const db = await this.getDB();
      const tx = db.transaction([SESSIONS_STORE, CHUNKS_STORE], 'readwrite');
      tx.objectStore(SESSIONS_STORE).delete(transferId);

      // Clean all chunk keys starting with transferId
      const chunkStore = tx.objectStore(CHUNKS_STORE);
      const req = chunkStore.openCursor();
      req.onsuccess = (e) => {
        const cursor = (e.target as IDBRequest).result as IDBCursorWithValue;
        if (cursor) {
          if (typeof cursor.key === 'string' && cursor.key.startsWith(`${transferId}_`)) {
            cursor.delete();
          }
          cursor.continue();
        }
      };

      return new Promise((resolve) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
    } catch (err) {
      console.warn('[ChunkStorage] Error deleting session:', err);
    }
  }
}

export const chunkStorage = new ChunkStorage();
