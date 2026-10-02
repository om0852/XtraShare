# XtraShare Low-Level Design (LLD)

## 1. System Layering Contract

To ensure modularity and ease of multi-platform maintenance, the application strictly adheres to three distinct architectural layers:

```
┌────────────────────────────────────────────────────────┐
│ UI Layer (React, Tailwind CSS, Lucide, Canvas/DOM)     │
│ - Components: AirDropRadar, DeviceGrid, DropZone, etc.  │
│ - Zero direct network calls; reads/writes via Zustand  │
└───────────────────────────┬────────────────────────────┘
                            │
┌───────────────────────────▼────────────────────────────┐
│ Application Layer (State & Domain Managers)            │
│ - DeviceStore & DeviceDetector                         │
│ - TransferManager (Chunking, Flow Control, Assembling) │
│ - ClipboardManager (Polling, Deduplication, Sync)      │
│ - StorageService (IndexedDB Persistence)               │
└───────────────────────────┬────────────────────────────┘
                            │
┌───────────────────────────▼────────────────────────────┐
│ Transport Layer (Wire Protocols & Sockets)              │
│ - SocketService (Socket.IO Signaling & Fallback Relay) │
│ - PeerConnectionManager (WebRTC RTCPeerConnection)     │
│ - DataChannelManager (RTCDataChannel lifecycle)        │
└────────────────────────────────────────────────────────┘
```

---

## 2. WebRTC DataChannel Flow & Backpressure Control

### Problem
Transferring large files (e.g., 2GB-10GB) over WebRTC without backpressure causes the browser's internal RTCDataChannel send buffer to saturate rapidly, resulting in tab crashes (`OutOfMemoryError`), dropped packets, or frozen interfaces.

### Solution: High & Low Watermark Regulation
1. **Chunk Sizing**: Files are sliced in chunks of exactly `64 KB` (`CHUNK_SIZE = 65,536 bytes`).
2. **Buffer Monitoring**:
   - `HIGH_WATER_MARK = 1,048,576 bytes` (1 MB)
   - `LOW_WATER_MARK = 262,144 bytes` (256 KB)
3. **Flow Control Loop**:
   ```typescript
   if (channel.bufferedAmount > HIGH_WATER_MARK) {
     await this.waitForDrain(channel);
   }
   ```
4. **Drain Listener**:
   ```typescript
   private waitForDrain(channel: RTCDataChannel): Promise<void> {
     return new Promise((resolve) => {
       channel.bufferedAmountLowThreshold = LOW_WATER_MARK;
       const onLow = () => {
         channel.removeEventListener('bufferedamountlow', onLow);
         resolve();
       };
       channel.addEventListener('bufferedamountlow', onLow);
     });
   }
   ```

---

## 3. RAM Conservation Strategy (Zero Complete File in Memory)

1. **Sender**:
   - The file is never loaded into RAM as an entire `ArrayBuffer`.
   - The loop sequentially slices `file.slice(seq * CHUNK_SIZE, end)`, reads only that 64KB slice into memory, wraps it in the 32-byte header, and invokes `channel.send()`.
   - The temporary slice buffer is immediately eligible for garbage collection.

2. **Receiver**:
   - Incoming binary frames are parsed into chunks and retained in an array indexed by `sequence`.
   - On completion, chunks are combined into a single `Blob` directly before triggering the native browser download (`URL.createObjectURL(blob)`), which delegates disk writing to the browser's download manager.

---

## 4. Transfer State Machine

```
              ┌─────────┐
              │ offered │
              └───┬─┬───┘
        reject    │ │   accept
    ┌─────────────┘ └─────────────┐
    ▼                             ▼
┌──────────┐               ┌──────────┐
│ rejected │               │ accepted │
└──────────┘               └────┬─────┘
                                │
                                ▼
                       ┌──────────────┐
                       │ transferring │◄──── progress updates
                       └────┬───┬───┬─┘
           cancel / error   │   │   │  finish
    ┌───────────────────────┘   │   └───────────────────────┐
    ▼                           │                           ▼
┌───────────┐                   │                   ┌───────────┐
│ cancelled │                   │                   │ completed │
└───────────┘                   ▼                   └───────────┘
                         ┌─────────────┐
                         │   failed    │
                         └─────────────┘
```

---

## 5. Clipboard Synchronization & Deduplication

### Deduplication Strategy:
1. When clipboard text is copied locally, the SHA-256 fingerprint of the trimmed text is generated:
   ```typescript
   const hash = crypto.createHash('sha256').update(content).digest('hex').substring(0, 16);
   ```
2. If `hash === lastKnownHash`, the event is ignored.
3. The server tracks a circular set of the last 200 clipboard hashes to prevent echo loops when multiple clients forward clipboard events back to the room.
4. When writing to the local system clipboard on receiving peers, an `isUpdatingLocally` guard is set for 800ms to prevent the local watcher from treating the received text as a new local copy.
