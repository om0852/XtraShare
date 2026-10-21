import {
  CHUNK_SIZE,
  IDEAL_CHUNK_SIZE,
  FRAME_HEADER_SIZE,
  SEND_SIZE_SAFETY_MARGIN,
  HIGH_WATER_MARK,
  LOW_WATER_MARK,
  FileOfferPayload,
  FileResumePayload,
  PeerMessage,
  sanitizeFilename,
  Transfer,
  TransportMode,
  buildBinaryFrame,
  parseBinaryFrame
} from '@xtrashare/protocol';
import { peerConnectionManager } from './webrtc.js';
import { socketService } from './socket.js';
import { useTransferStore } from '../store/transferStore.js';
import { useDeviceStore } from '../store/deviceStore.js';
import { useUIStore } from '../store/uiStore.js';
import { chunkStorage } from './chunkStorage.js';
import { StreamDownloadWriter, isStreamDownloadSupported } from './streamDownload.js';

interface ActiveReceiverSession {
  transferId: string;
  offer: FileOfferPayload;
  senderId: string;
  chunks: ArrayBuffer[];
  // Contiguous runs of raw chunks are periodically converted into Blob
  // parts and their ArrayBuffers discarded (see flushContiguousChunks) so
  // we never hold the entire file's bytes in JS memory at once — doing
  // that for multi-GB files is what crashed mobile Chrome tabs ("Aw, Snap!")
  // right at 100%, during final assembly.
  blobParts: Blob[];
  flushedUpTo: number;
  receivedBytes: number;
  totalChunks: number;
  receivedCount: number;
  lastSequence: number;
  startTime: number;
  lastProgressUpdate: number;
  lastBytes: number;
  fileCompleteReceived?: boolean;
  completionTimer?: any;
  transportModeResolving?: boolean; // guards against probing getStats() on every single chunk
  lastSessionSaved?: number;
}

interface SendQueueTask {
  targetPeerId: string;
  transferId: string;
  file: File;
  startSeq: number;
}

// How many 256KB chunks to accumulate before converting a contiguous run
// into a Blob and releasing the raw ArrayBuffers. 64 * 256KB = 16MB peak
// per flush, instead of the entire file's size.
const MEMORY_FLUSH_BATCH_SIZE = 64;

export class TransferManager {
  private activeReceivers = new Map<string, ActiveReceiverSession>();
  private activeSenders = new Map<string, { abort: boolean }>();
  private processedOfferIds = new Set<string>();
  private senderFiles = new Map<string, File>();
  private handledControlMessages = new Map<string, number>();
  private sendQueues = new Map<string, SendQueueTask[]>();
  private activeSendsPerPeer = new Map<string, number>();
  private static readonly MAX_CONCURRENT_SENDS_PER_PEER = 1;
  private unsubs: (() => void)[] = [];

  constructor() {
    // 1. WebRTC DataChannel binary & control listener
    this.unsubs.push(
      peerConnectionManager.onMessage((peerId, data) => {
        this.handleIncomingData(peerId, data);
      })
    );

    // 2. Direct reliable control message listener via Socket.IO
    this.unsubs.push(
      socketService.onPeerMessage((peerId, msg) => {
        this.handleControlMessage(peerId, msg);
      })
    );

    // 3. Fallback WebSocket relay chunk listener
    this.unsubs.push(
      socketService.onRelay((chunk) => {
        this.handleRelayChunk(chunk);
      })
    );

    // 4. Peer disconnect event listener for graceful transfer pause
    this.unsubs.push(
      socketService.onPeerLeave((deviceId) => {
        this.handlePeerLeave(deviceId);
      })
    );

    // 5. Peer join & room join event listeners for auto-resumption
    this.unsubs.push(
      socketService.onPeerJoin((_device) => {
        this.restoreInFlightTransfers();
      })
    );

    this.unsubs.push(
      socketService.onRoomJoined((_roomId) => {
        this.restoreInFlightTransfers();
      })
    );
  }

  public destroy(): void {
    for (const unsub of this.unsubs) {
      try {
        unsub();
      } catch {}
    }
    this.unsubs = [];
  }

  /**
   * Generates a transfer ID that is guaranteed to be exactly 16 ASCII
   * characters — the fixed width baked into buildBinaryFrame's header.
   * The previous `tr_<base36 timestamp>_<4 random chars>` scheme could
   * exceed 16 chars (and get silently truncated, risking ID collisions
   * between concurrent transfers) once the base36 timestamp grows a digit.
   */
  private generateTransferId(): string {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID().replace(/-/g, '').substring(0, 16);
    }
    // Fallback: pad/truncate to a hard 16 chars.
    const raw = `${Date.now().toString(36)}${Math.random().toString(36).substring(2)}`;
    return raw.padEnd(16, '0').substring(0, 16);
  }

  /**
   * Picks the per-transfer chunk size, waiting briefly to see if a real
   * WebRTC DataChannel comes up so we can check the connection's actual
   * negotiated SCTP maxMessageSize before deciding.
   *
   * - If a channel is open and reports a concrete maxMessageSize, use the
   *   largest size up to IDEAL_CHUNK_SIZE that still fits with headroom
   *   (this is what fixes the "256KB chunk died at chunk 0" bug precisely —
   *   instead of guessing a fixed safe size for everyone, we measure it).
   * - If a channel is open but doesn't report a usable maxMessageSize,
   *   use IDEAL_CHUNK_SIZE — the per-send guard in startSendingChunks still
   *   catches a genuine mismatch and falls back to relay safely.
   * - If no channel opens within the short wait (relay-bound), use
   *   IDEAL_CHUNK_SIZE too: relay has no SCTP message-size ceiling at all,
   *   so there's no reason to pay the small-chunk overhead tax there.
   *
   * Any transfer still gets CHUNK_SIZE (16KB) as an absolute floor if the
   * measured headroom is smaller than that.
   */
  private async determineChunkSizeForTransfer(targetPeerId: string): Promise<number> {
    try {
      peerConnectionManager.ensureConnection(targetPeerId);
      let channel = peerConnectionManager.getDataChannel(targetPeerId);
      if (!channel || channel.readyState !== 'open') {
        // Brief wait only — this delays showing the "incoming transfer" prompt
        // to the recipient, so keep it short. If P2P is slower to negotiate
        // than this, the transfer still works correctly via relay (or via
        // P2P later, re-verified by startSendingChunks' own size guard).
        channel = (await this.waitForDataChannel(targetPeerId, 3000)) || undefined;
      }

      if (channel && channel.readyState === 'open') {
        const pc = peerConnectionManager.getConnection(targetPeerId);
        const maxMessageSize = (pc as any)?.sctp?.maxMessageSize as number | undefined;
        if (maxMessageSize && isFinite(maxMessageSize) && maxMessageSize > 0) {
          const safeMax = maxMessageSize - FRAME_HEADER_SIZE - SEND_SIZE_SAFETY_MARGIN;
          return Math.max(CHUNK_SIZE, Math.min(IDEAL_CHUNK_SIZE, safeMax));
        }
        return IDEAL_CHUNK_SIZE;
      }
    } catch (err) {
      console.warn('[TransferManager] determineChunkSizeForTransfer failed, using default:', err);
    }
    return IDEAL_CHUNK_SIZE;
  }

  /**
   * Initiates sending a file to a target peer.
   */
  public async offerFile(targetPeerId: string, file: File): Promise<string> {
    const selfDevice = useDeviceStore.getState().selfDevice;
    const targetPeer = useDeviceStore.getState().devices.get(targetPeerId);

    if (!selfDevice || !targetPeer) {
      throw new Error('Device not found or not connected');
    }

    const transferId = this.generateTransferId();
    const chunkSize = await this.determineChunkSizeForTransfer(targetPeerId);
    const totalChunks = Math.ceil(file.size / chunkSize);

    const transfer: Transfer = {
      id: transferId,
      senderId: selfDevice.id,
      senderName: selfDevice.name,
      receiverId: targetPeer.id,
      receiverName: targetPeer.name,
      type: 'file',
      status: 'offered',
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type || 'application/octet-stream',
      totalChunks,
      chunkSize,
      bytesTransferred: 0,
      startedAt: Date.now()
    };

    useTransferStore.getState().addTransfer(transfer);

    const offerPayload: FileOfferPayload = {
      name: file.name,
      size: file.size,
      mimeType: file.type || 'application/octet-stream',
      chunkSize,
      totalChunks
    };

    // Ensure WebRTC connection negotiation is initiated in background
    peerConnectionManager.ensureConnection(targetPeerId);

    // Save local file reference for when recipient accepts or resumes
    this.senderFiles.set(transferId, file);
    (this as any)[`file_${transferId}`] = file;

    // Send file-offer control message reliably (both WebRTC & WebSocket signaling)
    this.sendControlMessage(targetPeerId, {
      type: 'file-offer',
      transferId,
      timestamp: Date.now(),
      payload: offerPayload
    });

    console.log(`[TransferManager] Offered file "${file.name}" (${file.size} bytes) to ${targetPeer.name}`);
    return transferId;
  }

  /**
   * Sends quick text directly to a peer.
   */
  public sendText(targetPeerId: string, text: string): void {
    const selfDevice = useDeviceStore.getState().selfDevice;
    const targetPeer = useDeviceStore.getState().devices.get(targetPeerId);
    if (!selfDevice || !targetPeer) return;

    const transferId = `txt_${Date.now().toString(36)}`;
    const transfer: Transfer = {
      id: transferId,
      senderId: selfDevice.id,
      senderName: selfDevice.name,
      receiverId: targetPeer.id,
      receiverName: targetPeer.name,
      type: 'text',
      status: 'completed',
      textContent: text,
      bytesTransferred: text.length,
      startedAt: Date.now(),
      completedAt: Date.now()
    };

    useTransferStore.getState().addTransfer(transfer);

    this.sendControlMessage(targetPeerId, {
      type: 'text',
      transferId,
      timestamp: Date.now(),
      payload: { text }
    });
  }

  public acceptTransfer(transferId: string): void {
    const pendingList = useTransferStore.getState().pendingOffers;
    const pending = pendingList.find((p) => p.transfer.id === transferId) || useTransferStore.getState().pendingOffer;
    if (!pending || pending.transfer.id !== transferId) return;

    const { transfer, fileOffer } = pending;
    const senderId = transfer.senderId;

    useTransferStore.getState().removePendingOffer(transferId);
    useTransferStore.getState().updateTransfer(transferId, { status: 'accepted' });

    // Initialize receiver session
    this.activeReceivers.set(transferId, {
      transferId,
      offer: fileOffer,
      senderId,
      chunks: new Array(fileOffer.totalChunks),
      blobParts: [],
      flushedUpTo: 0,
      receivedBytes: 0,
      totalChunks: fileOffer.totalChunks,
      receivedCount: 0,
      lastSequence: -1,
      startTime: Date.now(),
      lastProgressUpdate: Date.now(),
      lastBytes: 0
    });

    // Persist session to IndexedDB for crash/refresh resilience
    const currentRoomId = useUIStore.getState().currentRoomId || '';
    chunkStorage.saveSession({
      transferId,
      roomId: currentRoomId,
      fileName: fileOffer.name,
      fileSize: fileOffer.size,
      mimeType: fileOffer.mimeType,
      totalChunks: fileOffer.totalChunks,
      senderId,
      senderName: transfer.senderName,
      receivedBytes: 0,
      receivedCount: 0,
      lastSequence: -1,
      updatedAt: Date.now()
    });

    // Send accept message
    this.sendControlMessage(senderId, {
      type: 'file-accept',
      transferId,
      timestamp: Date.now(),
      payload: { transferId }
    });

    // Proactively resolve and set transportMode so receiver UI immediately displays LAN P2P
    peerConnectionManager
      .getTransportMode(senderId)
      .then((mode) => {
        useTransferStore.getState().updateTransfer(transferId, { transportMode: mode });
      })
      .catch(() => {});

    console.log(`[TransferManager] Accepted transfer ${transferId} for "${fileOffer.name}"`);
  }

  public acceptAllPendingOffers(): void {
    const pendingList = [...useTransferStore.getState().pendingOffers];
    for (const pending of pendingList) {
      this.acceptTransfer(pending.transfer.id);
    }
  }

  public rejectTransfer(transferId: string): void {
    const pendingList = useTransferStore.getState().pendingOffers;
    const pending = pendingList.find((p) => p.transfer.id === transferId) || useTransferStore.getState().pendingOffer;
    if (!pending || pending.transfer.id !== transferId) return;

    const senderId = pending.transfer.senderId;
    useTransferStore.getState().removePendingOffer(transferId);
    useTransferStore.getState().updateTransfer(transferId, { status: 'rejected' });

    this.sendControlMessage(senderId, {
      type: 'file-reject',
      transferId,
      timestamp: Date.now(),
      payload: { transferId, reason: 'Recipient declined transfer' }
    });
  }

  public rejectAllPendingOffers(): void {
    const pendingList = [...useTransferStore.getState().pendingOffers];
    for (const pending of pendingList) {
      this.rejectTransfer(pending.transfer.id);
    }
  }

  /**
   * Centralised cleanup of all sender-side state for a transfer.
   * Safe to call multiple times — idempotent.
   */
  private cleanupSenderState(transferId: string): void {
    const senderRef = this.activeSenders.get(transferId);
    if (senderRef) {
      senderRef.abort = true;
      this.activeSenders.delete(transferId);
    }
    // Remove from any peer send queues
    for (const [peerId, queue] of this.sendQueues) {
      const idx = queue.findIndex((t) => t.transferId === transferId);
      if (idx !== -1) {
        queue.splice(idx, 1);
        console.log(`[TransferManager] Removed queued transfer ${transferId} for peer ${peerId}`);
      }
    }
    this.senderFiles.delete(transferId);
    delete (this as any)[`file_${transferId}`];
  }

  /**
   * Enqueues an outbound file transfer for a target peer.
   * If the peer channel is already busy streaming, the transfer is queued so files
   * execute sequentially over that peer's DataChannel without buffer starvation or SCTP collisions.
   * Transfers to different peers proceed concurrently on their respective channels.
   */
  public enqueueSend(targetPeerId: string, transferId: string, file: File, startSeq = 0): void {
    let queue = this.sendQueues.get(targetPeerId);
    if (!queue) {
      queue = [];
      this.sendQueues.set(targetPeerId, queue);
    }

    if (queue.some((task) => task.transferId === transferId)) {
      return;
    }

    const activeCount = this.activeSendsPerPeer.get(targetPeerId) || 0;
    if (activeCount < TransferManager.MAX_CONCURRENT_SENDS_PER_PEER) {
      this.activeSendsPerPeer.set(targetPeerId, activeCount + 1);
      this.executeSendTask({ targetPeerId, transferId, file, startSeq }).catch((err) => {
        console.error(`[TransferManager] Failed executing send task for ${transferId}:`, err);
      });
    } else {
      console.log(`[TransferManager] DataChannel to ${targetPeerId} busy. Transfer ${transferId} queued at position ${queue.length + 1}.`);
      queue.push({ targetPeerId, transferId, file, startSeq });
      useTransferStore.getState().updateTransfer(transferId, {
        status: 'accepted',
        error: undefined
      });
    }
  }

  private async executeSendTask(task: SendQueueTask): Promise<void> {
    try {
      await this.startSendingChunks(task.targetPeerId, task.transferId, task.file, task.startSeq);
    } catch (err: any) {
      console.error(`[TransferManager] Error in send task for ${task.transferId}:`, err);
      useTransferStore.getState().updateTransfer(task.transferId, {
        status: 'failed',
        error: err?.message || 'Transfer failed'
      });
    } finally {
      const currentActive = (this.activeSendsPerPeer.get(task.targetPeerId) || 1) - 1;
      this.activeSendsPerPeer.set(task.targetPeerId, Math.max(0, currentActive));

      const queue = this.sendQueues.get(task.targetPeerId);
      if (queue && queue.length > 0) {
        const nextTask = queue.shift()!;
        const newActive = (this.activeSendsPerPeer.get(task.targetPeerId) || 0) + 1;
        this.activeSendsPerPeer.set(task.targetPeerId, newActive);
        this.executeSendTask(nextTask).catch((err) => {
          console.error(`[TransferManager] Failed executing next queued task for ${nextTask.transferId}:`, err);
        });
      }
    }
  }

  public cancelTransfer(transferId: string): void {
    const transfer = useTransferStore.getState().transfers.get(transferId);
    if (!transfer) return;

    // Guard: don't double-cancel (would send duplicate file-error to peer)
    const currentStatus = transfer.status;
    if (currentStatus === 'cancelled' || currentStatus === 'completed' || currentStatus === 'failed') {
      return;
    }

    this.cleanupSenderState(transferId);
    const cancelledReceiver = this.activeReceivers.get(transferId);
    if (cancelledReceiver?.completionTimer) clearInterval(cancelledReceiver.completionTimer);
    this.activeReceivers.delete(transferId);
    chunkStorage.deleteSession(transferId);

    useTransferStore.getState().removePendingOffer(transferId);
    useTransferStore.getState().updateTransfer(transferId, { status: 'cancelled' });

    const selfId = useDeviceStore.getState().selfDevice?.id;
    const targetPeerId = transfer.senderId === selfId ? transfer.receiverId : transfer.senderId;
    if (!targetPeerId) return;

    this.sendControlMessage(targetPeerId, {
      type: 'file-error',
      transferId,
      timestamp: Date.now(),
      payload: { transferId, code: 'TRANSFER_CANCELLED', message: 'Transfer cancelled by peer' }
    });
  }

  /**
   * Helper to wait for DataChannel to open before streaming, or time out to relay.
   * Also triggers WebRTC connection negotiation if not already started.
   */
  private waitForDataChannel(peerId: string, timeoutMs = 5000): Promise<RTCDataChannel | null> {
    return new Promise((resolve) => {
      const channel = peerConnectionManager.getDataChannel(peerId);
      if (channel && channel.readyState === 'open') {
        return resolve(channel);
      }

      // Ensure WebRTC connection & DataChannel creation is initiated
      try {
        peerConnectionManager.ensureConnection(peerId);
      } catch {}

      const timer = setTimeout(() => {
        clearInterval(checkInterval);
        resolve(null);
      }, timeoutMs);

      const checkInterval = setInterval(() => {
        const ch = peerConnectionManager.getDataChannel(peerId);
        if (ch && ch.readyState === 'open') {
          clearTimeout(timer);
          clearInterval(checkInterval);
          resolve(ch);
        }
      }, 80);
    });
  }

  /**
   * Chunker streamer with WebRTC backpressure control and automatic WebSocket relay fallback.
   * Supports resumable streaming starting from any sequence index.
   */
  public async startSendingChunks(
    targetPeerId: string,
    transferId: string,
    file: File,
    startSeq = 0
  ): Promise<void> {
    // CRITICAL: Abort any existing sender for this transferId before starting a new one
    // This prevents duplicate sends when retry/resume triggers a second sender
    const existingSender = this.activeSenders.get(transferId);
    if (existingSender) {
      console.log(`[TransferManager] Aborting previous sender for ${transferId} before starting new one`);
      existingSender.abort = true;
      // Small pause to allow in-flight async operations to notice the abort
      await new Promise((r) => setTimeout(r, 120));
    }

    // Determine active transport mode
    const transportMode: TransportMode = await peerConnectionManager.getTransportMode(targetPeerId);

    // Wait up to 15s for WebRTC DataChannel (also triggers negotiation).
    // Bumped from 10s: mobile networks / ICE gathering can legitimately take
    // longer, and oniceconnectionstatechange now attempts an ICE restart on
    // failure (see webrtc.ts), which needs a bit more time to recover.
    let channel = peerConnectionManager.getDataChannel(targetPeerId);
    if (!channel || channel.readyState !== 'open') {
      console.log(`[TransferManager] Awaiting WebRTC DataChannel with ${targetPeerId} (up to 15s)...`);
      channel = (await this.waitForDataChannel(targetPeerId, 15000)) || undefined;
    }

    if (!channel || channel.readyState !== 'open') {
      const pc = peerConnectionManager.getConnection(targetPeerId);
      console.warn(
        `[TransferManager] DataChannel not ready after 15s — falling back to WebSocket relay for this transfer. ` +
        `This is NOT related to how many devices are in the room; it means direct P2P couldn't be established with ` +
        `THIS peer in time (ICE connectionState=${pc?.iceConnectionState ?? 'unknown'}, ` +
        `gatheringState=${pc?.iceGatheringState ?? 'unknown'}). The most common cause is no TURN server configured ` +
        `and a NAT between the two devices that STUN alone can't traverse — see docs/deployment.md.`
      );
      await this.startSendingChunksViaRelay(targetPeerId, transferId, file, startSeq);
      return;
    }

    console.log(
      `[TransferManager] Streaming via ${transportMode.toUpperCase()}: "${file.name}" (from chunk ${startSeq})`
    );

    useTransferStore.getState().updateTransfer(transferId, {
      status: 'transferring',
      transportMode,
      error: undefined
    });

    const senderControl = { abort: false };
    this.activeSenders.set(transferId, senderControl);

    // Use the chunk size that was actually negotiated for this transfer at
    // offer time (see determineChunkSizeForTransfer) — NOT a hardcoded
    // constant — so genuinely capable P2P connections get up to
    // IDEAL_CHUNK_SIZE instead of being needlessly throttled to the
    // universal-safe floor.
    const chunkSize = useTransferStore.getState().transfers.get(transferId)?.chunkSize ?? CHUNK_SIZE;
    const totalChunks = Math.ceil(file.size / chunkSize);
    let bytesSent = startSeq * chunkSize;
    let lastTime = Date.now();
    let lastBytes = bytesSent;
    let smoothedSpeed = 0;

    // Verify the chunk frame actually fits within this connection's
    // negotiated SCTP max message size. If it doesn't, no amount of
    // retrying/waiting for drain will ever make channel.send() succeed —
    // that previously wasted 3 retries (with multi-second drain waits) on
    // every single transfer before falling back to relay. Skip straight to
    // relay instead, with a clear explanation of why. This re-checks the
    // SAME thing determineChunkSizeForTransfer already measured at offer
    // time, because conditions (or the peer connection object itself) may
    // have changed between when the file was offered and when it was
    // actually accepted and streaming began.
    const pc = peerConnectionManager.getConnection(targetPeerId);
    const negotiatedMaxMessageSize = (pc as any)?.sctp?.maxMessageSize as number | undefined;
    const frameSize = chunkSize + FRAME_HEADER_SIZE;
    if (negotiatedMaxMessageSize && negotiatedMaxMessageSize > 0 && frameSize > negotiatedMaxMessageSize) {
      console.warn(
        `[TransferManager] This connection's negotiated SCTP maxMessageSize (${negotiatedMaxMessageSize} bytes) ` +
        `is smaller than our frame size (${frameSize} bytes) — WebRTC sends would fail immediately and ` +
        `unrecoverably. Skipping straight to WebSocket relay instead of wasting retries.`
      );
      await this.startSendingChunksViaRelay(targetPeerId, transferId, file, startSeq);
      return;
    }

    // Set a larger send buffer and low-water mark for maximum LAN throughput
    channel.bufferedAmountLowThreshold = LOW_WATER_MARK;

    // Block I/O streaming: read 2 MB blocks (32 x 64KB chunks) in parallel
    // to eliminate 97% of Chromium file IPC overhead while keeping peak memory under 4MB.
    const BLOCK_CHUNKS = 32;
    const blockSize = BLOCK_CHUNKS * chunkSize;
    let currentBlockSeq = -1;
    let currentBlockBuffer: ArrayBuffer | null = null;
    let nextBlockPromise: Promise<ArrayBuffer> | null = null;

    const readBlock = (bIndex: number): Promise<ArrayBuffer> => {
      const start = bIndex * blockSize;
      const end = Math.min(start + blockSize, file.size);
      return file.slice(start, end).arrayBuffer();
    };

    // Pre-read initial block
    const initialBlockIndex = Math.floor(startSeq / BLOCK_CHUNKS);
    currentBlockBuffer = await readBlock(initialBlockIndex);
    currentBlockSeq = initialBlockIndex;

    // Launch background prefetch of next block
    if ((initialBlockIndex + 1) * blockSize < file.size) {
      nextBlockPromise = readBlock(initialBlockIndex + 1);
    }

    for (let seq = startSeq; seq < totalChunks; seq++) {
      if (senderControl.abort) {
        console.log(`[TransferManager] Transfer ${transferId} paused at chunk ${seq}`);
        return;
      }

      if (!channel || channel.readyState !== 'open') {
        console.warn(`[TransferManager] WebRTC channel closed at chunk ${seq}. Marking interrupted.`);
        useTransferStore.getState().updateTransfer(transferId, {
          status: 'interrupted',
          lastSequence: seq,
          bytesTransferred: bytesSent,
          error: 'Connection dropped. Waiting for peer to reconnect...'
        });
        return;
      }

      // Backpressure regulation: wait for buffer to drain below HIGH_WATER_MARK
      while (channel.bufferedAmount >= HIGH_WATER_MARK) {
        if (senderControl.abort || channel.readyState !== 'open') break;
        await this.waitForDrain(channel);
      }

      if (senderControl.abort || channel.readyState !== 'open') {
        continue;
      }

      // Retrieve chunk from current in-memory block (or advance to next block)
      const blockIdx = Math.floor(seq / BLOCK_CHUNKS);
      if (blockIdx !== currentBlockSeq) {
        currentBlockBuffer = nextBlockPromise ? await nextBlockPromise : await readBlock(blockIdx);
        currentBlockSeq = blockIdx;
        nextBlockPromise = ((blockIdx + 1) * blockSize < file.size) ? readBlock(blockIdx + 1) : null;
      }

      const offsetInBlock = (seq % BLOCK_CHUNKS) * chunkSize;
      const chunkBytes = Math.min(chunkSize, file.size - seq * chunkSize);
      const buffer = currentBlockBuffer!.slice(offsetInBlock, offsetInBlock + chunkBytes);

      // Construct binary frame: 32 bytes header + raw chunk payload
      const frame = this.buildBinaryFrame(transferId, seq, totalChunks, buffer);

      // Robust send with retry on backpressure / transient buffer exception
      let sent = false;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          while (channel.bufferedAmount >= HIGH_WATER_MARK) {
            if (senderControl.abort || channel.readyState !== 'open') break;
            await this.waitForDrain(channel);
          }
          if (senderControl.abort || channel.readyState !== 'open') break;

          channel.send(frame);
          sent = true;
          break;
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          const isFatalSizeError = /too large|exceed|invalidstate/i.test(message);
          console.warn(
            `[TransferManager] WebRTC send failed at chunk ${seq} (attempt ${attempt + 1}/3)${isFatalSizeError ? ' — fatal (message too large), not retrying' : ''}:`,
            message
          );
          if (isFatalSizeError) break;
          await this.waitForDrain(channel);
          await new Promise((r) => setTimeout(r, 40));
        }
      }

      if (!sent) {
        if (channel.readyState !== 'open') {
          console.warn(`[TransferManager] WebRTC channel closed at chunk ${seq}. Marking interrupted.`);
          this.activeSenders.delete(transferId);
          useTransferStore.getState().updateTransfer(transferId, {
            status: 'interrupted',
            lastSequence: seq,
            bytesTransferred: bytesSent,
            error: 'WebRTC connection dropped. Click Retry or wait for auto-resume.'
          });
          return;
        }
        // Fallback to relay streamer for remaining chunks
        console.warn(`[TransferManager] WebRTC send failed after retries at chunk ${seq}. Falling back to relay streamer.`);
        await this.startSendingChunksViaRelay(targetPeerId, transferId, file, seq);
        return;
      }

      bytesSent += buffer.byteLength;

      // Speed & ETA calculation every 200ms or last chunk
      const now = Date.now();
      const elapsed = (now - lastTime) / 1000;
      if (elapsed >= 0.2 || seq === totalChunks - 1) {
        const instantSpeed = elapsed > 0 ? Math.round((bytesSent - lastBytes) / elapsed) : 0;
        smoothedSpeed = smoothedSpeed === 0 ? instantSpeed : Math.round(0.7 * instantSpeed + 0.3 * smoothedSpeed);
        const remainingBytes = file.size - bytesSent;
        const eta = smoothedSpeed > 0 ? Math.round(remainingBytes / smoothedSpeed) : 0;

        useTransferStore.getState().updateTransfer(transferId, {
          bytesTransferred: bytesSent,
          lastSequence: seq,
          speed: smoothedSpeed,
          eta
        });

        lastTime = now;
        lastBytes = bytesSent;
      }
    }

    // Wait for the local DataChannel buffer to completely drain over the network before sending file-complete
    while (channel.bufferedAmount > 0) {
      if (channel.readyState !== 'open') break;
      await this.waitForDrain(channel, 0);
    }

    // Finished sending
    this.activeSenders.delete(transferId);
    delete (this as any)[`file_${transferId}`];

    this.sendControlMessage(targetPeerId, {
      type: 'file-complete',
      transferId,
      timestamp: Date.now(),
      payload: { transferId, totalBytes: file.size, totalChunks }
    });

    useTransferStore.getState().updateTransfer(transferId, {
      status: 'completed',
      bytesTransferred: file.size,
      completedAt: Date.now()
    });
    console.log(`[TransferManager] Completed WebRTC sending: "${file.name}"`);
  }

  /**
   * WebSocket relay fallback chunk streamer.
   * Uses the SAME CHUNK_SIZE as WebRTC so receiver totalChunks count stays consistent.
   */
  public async startSendingChunksViaRelay(
    targetPeerId: string,
    transferId: string,
    file: File,
    startSeq = 0
  ): Promise<void> {
    // Abort any existing sender first
    const existingSender = this.activeSenders.get(transferId);
    if (existingSender) {
      existingSender.abort = true;
      await new Promise((r) => setTimeout(r, 80));
    }

    useTransferStore.getState().updateTransfer(transferId, {
      status: 'transferring',
      transportMode: 'websocket-relay',
      error: undefined
    });

    const senderControl = { abort: false };
    this.activeSenders.set(transferId, senderControl);

    // Use the SAME per-transfer chunk size chosen at offer time (see
    // determineChunkSizeForTransfer) so the receiver's totalChunks count
    // stays consistent with what was declared in the file-offer.
    const chunkSize = useTransferStore.getState().transfers.get(transferId)?.chunkSize ?? IDEAL_CHUNK_SIZE;
    const totalChunks = Math.ceil(file.size / chunkSize);
    let bytesSent = startSeq * chunkSize;
    let lastTime = Date.now();
    let lastBytes = bytesSent;
    let smoothedSpeed = 0;

    for (let seq = startSeq; seq < totalChunks; seq++) {
      if (senderControl.abort) {
        console.log(`[TransferManager] Relay sending of ${transferId} aborted at chunk ${seq}`);
        return;
      }

      // NOTE: We intentionally do NOT switch from relay to WebRTC mid-transfer.
      // Switching mid-transfer caused a thrashing loop:
      //   relay → WebRTC → channel drop → relay → WebRTC → ...
      // Transport is locked at transfer start. If WebRTC is desired, retry the transfer.

      const start = seq * chunkSize;
      const end = Math.min(start + chunkSize, file.size);
      const buffer = await file.slice(start, end).arrayBuffer();

      // Dynamically resolve target peer ID in case peer reconnected with a new socket ID
      const currentDevices = useDeviceStore.getState().devices;
      const targetPeer = currentDevices.get(targetPeerId) ||
        Array.from(currentDevices.values()).find((d) => d.name === useTransferStore.getState().transfers.get(transferId)?.receiverName);
      const activeToId = targetPeer ? targetPeer.id : targetPeerId;

      // Send raw ArrayBuffer — no base64 overhead (~33% faster throughput)
      socketService.sendRelayChunk({
        from: '',
        to: activeToId,
        transferId,
        sequence: seq,
        totalChunks,
        data: buffer
      });

      bytesSent += buffer.byteLength;

      const now = Date.now();
      const elapsed = (now - lastTime) / 1000;
      if (elapsed >= 0.2 || seq === totalChunks - 1) {
        const instantSpeed = elapsed > 0 ? Math.round((bytesSent - lastBytes) / elapsed) : 0;
        smoothedSpeed = smoothedSpeed === 0 ? instantSpeed : Math.round(0.7 * instantSpeed + 0.3 * smoothedSpeed);
        const remainingBytes = file.size - bytesSent;
        const eta = smoothedSpeed > 0 ? Math.round(remainingBytes / smoothedSpeed) : 0;

        useTransferStore.getState().updateTransfer(transferId, {
          bytesTransferred: bytesSent,
          lastSequence: seq,
          speed: smoothedSpeed,
          eta
        });

        lastTime = now;
        lastBytes = bytesSent;
      }

      // Small yield every 16 chunks to keep event loop responsive while maximizing throughput
      if (seq % 16 === 0) {
        await new Promise((r) => setTimeout(r, 0));
      }
    }

    this.activeSenders.delete(transferId);

    this.sendControlMessage(targetPeerId, {
      type: 'file-complete',
      transferId,
      timestamp: Date.now(),
      payload: { transferId, totalBytes: file.size, totalChunks }
    });

    useTransferStore.getState().updateTransfer(transferId, {
      status: 'completed',
      bytesTransferred: file.size,
      completedAt: Date.now()
    });
    console.log(`[TransferManager] Completed Relay sending: "${file.name}"`);
  }

  private waitForDrain(channel: RTCDataChannel, targetThreshold?: number): Promise<void> {
    const threshold = targetThreshold !== undefined ? targetThreshold : (channel.bufferedAmountLowThreshold || LOW_WATER_MARK);
    if (channel.readyState !== 'open' || channel.bufferedAmount <= threshold) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      let resolved = false;

      const cleanup = () => {
        if (!resolved) {
          resolved = true;
          channel.removeEventListener('bufferedamountlow', onLow);
          clearInterval(poll);
          clearTimeout(timeout);
          resolve();
        }
      };

      const onLow = () => {
        if (channel.bufferedAmount <= threshold) cleanup();
      };

      // Fast polling backup (5ms) in case browser event loop delays bufferedamountlow event
      const poll = setInterval(() => {
        if (channel.readyState !== 'open' || channel.bufferedAmount <= threshold) {
          cleanup();
        }
      }, 5);

      // Safety timeout: if channel doesn't drain in 2000ms, resolve so loop can verify connection state
      const timeout = setTimeout(cleanup, 2000);

      channel.addEventListener('bufferedamountlow', onLow);
    });
  }

  private buildBinaryFrame(transferId: string, seq: number, totalChunks: number, payload: ArrayBuffer): ArrayBuffer {
    return buildBinaryFrame(transferId, seq, totalChunks, payload);
  }

  private parseBinaryFrame(buffer: ArrayBuffer): {
    transferId: string;
    sequence: number;
    totalChunks: number;
    payload: ArrayBuffer;
  } | null {
    return parseBinaryFrame(buffer);
  }

  private handleIncomingData(peerId: string, data: string | ArrayBuffer): void {
    if (typeof data === 'string') {
      try {
        const msg = JSON.parse(data) as PeerMessage;
        this.handleControlMessage(peerId, msg);
      } catch (err) {
        console.warn('Failed to parse peer control message:', err);
      }
    } else if (data instanceof ArrayBuffer) {
      this.handleBinaryChunk(peerId, data);
    } else if (typeof Blob !== 'undefined' && (data as any) instanceof Blob) {
      (data as Blob).arrayBuffer().then((buf) => {
        this.handleBinaryChunk(peerId, buf);
      }).catch((err) => {
        console.warn('[TransferManager] Failed to read Blob as ArrayBuffer:', err);
      });
    }
  }

  public handleControlMessage(peerId: string, msg: PeerMessage): void {
    // Deduplicate control messages delivered via both WebRTC and Socket.IO
    const now = Date.now();
    const dedupeKey = `${msg.transferId}_${msg.type}_${msg.timestamp || 0}`;
    if (this.handledControlMessages.has(dedupeKey)) {
      return;
    }
    this.handledControlMessages.set(dedupeKey, now);

    // Periodically prune control messages older than 60s when map grows beyond 2000 items
    if (this.handledControlMessages.size > 2000) {
      const cutoff = now - 60000;
      for (const [key, timestamp] of this.handledControlMessages) {
        if (timestamp < cutoff) {
          this.handledControlMessages.delete(key);
        }
      }
    }

    const sender = useDeviceStore.getState().devices.get(peerId);
    const selfDevice = useDeviceStore.getState().selfDevice;

    switch (msg.type) {
      case 'file-offer': {
        const offer = msg.payload as FileOfferPayload & { isResume?: boolean };

        // 1. If we already have an active receiver session for this transferId, respond with resume
        const existingSession = this.activeReceivers.get(msg.transferId);
        if (existingSession) {
          console.log(`[TransferManager] Auto-acknowledging offer for already active session "${offer.name}"`);
          const lastSeq = existingSession.lastSequence ?? -1;
          this.sendControlMessage(peerId, {
            type: 'file-resume',
            transferId: msg.transferId,
            timestamp: Date.now(),
            payload: {
              transferId: msg.transferId,
              lastReceivedChunk: lastSeq,
              lastReceivedOffset: existingSession.receivedBytes,
              newReceiverId: selfDevice?.id,
              newReceiverName: selfDevice?.name
            }
          });
          return;
        }

        // 2. If already processed in a terminal state (cancelled/failed/rejected/completed), ignore duplicate offer
        const existingTransfer = useTransferStore.getState().transfers.get(msg.transferId);
        if (existingTransfer) {
          if (existingTransfer.status === 'transferring' || existingTransfer.status === 'accepted') {
            // Already in progress — ignore
            return;
          }
          if (existingTransfer.status === 'completed') {
            // Already done — ignore duplicate
            return;
          }
          // For cancelled/failed/rejected: allow re-offer (peer may have retried)
        }

        this.processedOfferIds.add(msg.transferId);

        const transfer: Transfer = {
          id: msg.transferId,
          senderId: peerId,
          senderName: sender?.name || 'Unknown Peer',
          receiverId: selfDevice?.id || '',
          receiverName: selfDevice?.name || '',
          type: 'file',
          status: 'offered',
          fileName: offer.name,
          fileSize: offer.size,
          mimeType: offer.mimeType,
          totalChunks: offer.totalChunks,
          chunkSize: offer.chunkSize,
          bytesTransferred: 0,
          startedAt: Date.now()
        };

        useTransferStore.getState().addTransfer(transfer);

        // Auto-accept if setting enabled
        if (useUIStore.getState().autoAccept) {
          console.log(`[TransferManager] Auto-accepting incoming file "${offer.name}"`);
          useTransferStore.getState().addPendingOffer({ transfer, fileOffer: offer });
          this.acceptTransfer(msg.transferId);
        } else {
          useTransferStore.getState().addPendingOffer({ transfer, fileOffer: offer });
          console.log(`[TransferManager] Received file offer "${offer.name}" (${offer.size} bytes) from ${transfer.senderName}`);
        }
        break;
      }

      case 'file-accept': {
        // Guard: ignore if transfer was already cancelled or failed (race condition)
        const currentTransfer = useTransferStore.getState().transfers.get(msg.transferId);
        if (currentTransfer && (currentTransfer.status === 'cancelled' || currentTransfer.status === 'failed' || currentTransfer.status === 'rejected')) {
          console.warn(`[TransferManager] Ignoring file-accept for ${msg.transferId} — already ${currentTransfer.status}`);
          break;
        }
        // Guard: don't start duplicate sender if already transferring
        if (this.activeSenders.has(msg.transferId)) {
          console.warn(`[TransferManager] Ignoring duplicate file-accept for ${msg.transferId} — sender already active`);
          break;
        }
        const file = this.senderFiles.get(msg.transferId) || (this as any)[`file_${msg.transferId}`] as File;
        if (file) {
          console.log(`[TransferManager] Recipient accepted transfer ${msg.transferId}. Enqueueing stream.`);
          this.enqueueSend(peerId, msg.transferId, file, 0);
        } else {
          console.warn(`[TransferManager] Cannot start stream for ${msg.transferId}: local file not found (may have been cancelled)`);
        }
        break;
      }

      case 'file-resume-check': {
        const receiver = this.activeReceivers.get(msg.transferId);
        const lastSeq = receiver ? receiver.lastSequence : -1;
        const receivedBytes = receiver ? receiver.receivedBytes : 0;

        console.log(`[TransferManager] Responding to resume check for ${msg.transferId} at chunk ${lastSeq}`);
        this.sendControlMessage(peerId, {
          type: 'file-resume',
          transferId: msg.transferId,
          timestamp: Date.now(),
          payload: {
            transferId: msg.transferId,
            lastReceivedChunk: lastSeq,
            lastReceivedOffset: receivedBytes,
            newReceiverId: selfDevice?.id,
            newReceiverName: selfDevice?.name
          }
        });
        break;
      }

      case 'file-resume': {
        const resumePayload = msg.payload as FileResumePayload;
        // Guard: don't resume if transfer was cancelled/failed on our side
        const resumeTransfer = useTransferStore.getState().transfers.get(msg.transferId);
        if (resumeTransfer && (resumeTransfer.status === 'cancelled' || resumeTransfer.status === 'failed')) {
          console.warn(`[TransferManager] Ignoring file-resume for ${msg.transferId} — already ${resumeTransfer.status}`);
          break;
        }
        const file = this.senderFiles.get(msg.transferId) || (this as any)[`file_${msg.transferId}`] as File;
        if (file) {
          const nextSeq = (resumePayload.lastReceivedChunk ?? -1) + 1;
          const targetPeerId = resumePayload.newReceiverId || peerId;
          console.log(
            `%c[TransferManager] Auto-resuming transfer ${msg.transferId} from chunk ${nextSeq} to peer ${targetPeerId}`,
            'color: #10b981; font-weight: bold'
          );

          useTransferStore.getState().updateTransfer(msg.transferId, {
            receiverId: targetPeerId,
            status: 'transferring',
            error: undefined
          });

          this.enqueueSend(targetPeerId, msg.transferId, file, nextSeq);
        } else {
          console.warn(`[TransferManager] Cannot resume ${msg.transferId}: local file handle not in memory`);
        }
        break;
      }

      case 'file-reject': {
        this.cleanupSenderState(msg.transferId);
        useTransferStore.getState().updateTransfer(msg.transferId, {
          status: 'rejected',
          error: (msg.payload as any)?.reason || 'Transfer rejected'
        });
        break;
      }

      case 'file-complete': {
        const receiver = this.activeReceivers.get(msg.transferId);
        if (receiver) {
          receiver.fileCompleteReceived = true;
          if (receiver.receivedCount >= receiver.totalChunks) {
            this.finalizeReceivedFile(msg.transferId);
          } else {
            console.log(
              `[TransferManager] file-complete message arrived early (${receiver.receivedCount}/${receiver.totalChunks} chunks). ` +
              `Sender finished writing to its local send buffer before the slower receiver drained all chunks — watching for the rest...`
            );
            if (receiver.completionTimer) clearInterval(receiver.completionTimer);

            // Poll every 3s instead of a single one-shot check. As long as chunks
            // keep trickling in (lastProgressUpdate keeps advancing) we keep waiting
            // indefinitely — this is what used to get permanently "stuck": the old
            // code checked ONCE at the 30s mark and, if still short of a true 25s
            // stall, did nothing ever again. Only after a genuine ~20s of silence do
            // we give up — and even then we NEVER assemble a file from partial data
            // (that produced the corrupted/undersized/unopenable downloads). Instead
            // we mark the transfer interrupted and ask the sender to resume sending
            // from our last confirmed chunk.
            receiver.completionTimer = setInterval(() => {
              const current = this.activeReceivers.get(msg.transferId);
              if (!current) {
                clearInterval(receiver.completionTimer);
                return;
              }
              if (current.receivedCount >= current.totalChunks) {
                clearInterval(current.completionTimer);
                this.finalizeReceivedFile(msg.transferId);
                return;
              }
              const inactiveTime = Date.now() - current.lastProgressUpdate;
              if (inactiveTime >= 20000) {
                clearInterval(current.completionTimer);
                console.warn(
                  `[TransferManager] Transfer ${msg.transferId} stalled for 20s after file-complete ` +
                  `(${current.receivedCount}/${current.totalChunks} chunks). Marking interrupted and requesting resume ` +
                  `instead of producing a truncated file.`
                );
                const selfDevice = useDeviceStore.getState().selfDevice;
                useTransferStore.getState().updateTransfer(msg.transferId, {
                  status: 'interrupted',
                  lastSequence: current.lastSequence,
                  bytesTransferred: current.receivedBytes,
                  error: 'Transfer stalled — missing chunks. Auto-resuming...'
                });
                this.sendControlMessage(current.senderId, {
                  type: 'file-resume',
                  transferId: msg.transferId,
                  timestamp: Date.now(),
                  payload: {
                    transferId: msg.transferId,
                    lastReceivedChunk: current.lastSequence,
                    lastReceivedOffset: current.receivedBytes,
                    newReceiverId: selfDevice?.id,
                    newReceiverName: selfDevice?.name
                  }
                });
              }
            }, 3000);
          }
        }
        break;
      }

      case 'file-error': {
        const errorPayload = msg.payload as any;
        this.cleanupSenderState(msg.transferId);
        const erroredReceiver = this.activeReceivers.get(msg.transferId);
        if (erroredReceiver?.completionTimer) clearInterval(erroredReceiver.completionTimer);
        this.activeReceivers.delete(msg.transferId);
        chunkStorage.deleteSession(msg.transferId);
        useTransferStore.getState().updateTransfer(msg.transferId, {
          status: 'failed',
          error: errorPayload?.message || 'Transfer cancelled by peer'
        });
        break;
      }

      case 'text': {
        const textPayload = msg.payload as { text: string };
        const transfer: Transfer = {
          id: msg.transferId,
          senderId: peerId,
          senderName: sender?.name || 'Unknown Peer',
          receiverId: selfDevice?.id || '',
          receiverName: selfDevice?.name || '',
          type: 'text',
          status: 'completed',
          textContent: textPayload.text,
          bytesTransferred: textPayload.text.length,
          startedAt: Date.now(),
          completedAt: Date.now()
        };
        useTransferStore.getState().addTransfer(transfer);
        break;
      }
    }
  }

  private handleBinaryChunk(_peerId: string, buffer: ArrayBuffer): void {
    const frame = this.parseBinaryFrame(buffer);
    if (!frame) return;

    const receiver = this.activeReceivers.get(frame.transferId);
    if (!receiver) return;

    // Deduplication: skip already-received sequences
    if (receiver.chunks[frame.sequence] !== undefined && receiver.chunks[frame.sequence] !== null) {
      return;
    }

    receiver.chunks[frame.sequence] = frame.payload;
    receiver.receivedBytes += frame.payload.byteLength;
    receiver.receivedCount++;
    receiver.lastSequence = Math.max(receiver.lastSequence, frame.sequence);

    // Data arriving here means it came over the real RTCDataChannel — but
    // the receiver's Transfer record never actually recorded that fact
    // anywhere before. updateTransfer() calls below only set other fields,
    // so transportMode stayed unset and the UI badge defaulted to showing
    // "Relay" even on a genuine P2P transfer. Resolve it once (not every
    // chunk — getStats() isn't free) and persist it.
    if (!receiver.transportModeResolving) {
      receiver.transportModeResolving = true;
      peerConnectionManager
        .getTransportMode(_peerId)
        .then((mode) => {
          useTransferStore.getState().updateTransfer(frame.transferId, { transportMode: mode });
        })
        .catch(() => {});
    }

    // Compact contiguous raw chunks into Blob parts periodically so we never
    // hold the whole file in memory at once (see MEMORY_FLUSH_BATCH_SIZE).
    // Note: per-chunk IndexedDB writes are intentionally bypassed during live streaming —
    // in-memory Blob compaction in flushContiguousChunks handles memory safety natively.
    // Saving 40,000+ chunks to SQLite on mobile was capping throughput at 1.5 MB/s and freezing the event loop.
    this.flushContiguousChunks(receiver);

    const now = Date.now();
    const elapsed = (now - receiver.lastProgressUpdate) / 1000;

    if (elapsed >= 0.25 || receiver.receivedCount === receiver.totalChunks) {
      const speed = Math.round((receiver.receivedBytes - receiver.lastBytes) / elapsed);
      const remainingBytes = receiver.offer.size - receiver.receivedBytes;
      const eta = speed > 0 ? Math.round(remainingBytes / speed) : 0;

      useTransferStore.getState().updateTransfer(frame.transferId, {
        status: 'transferring',
        bytesTransferred: receiver.receivedBytes,
        lastSequence: receiver.lastSequence,
        speed,
        eta,
        error: undefined
      });

      receiver.lastProgressUpdate = now;
      receiver.lastBytes = receiver.receivedBytes;

      // Update session progress in IndexedDB throttled to at most once every 5 seconds
      // to avoid saturating mobile storage threads with continuous transactions.
      if (!receiver.lastSessionSaved || now - receiver.lastSessionSaved >= 5000) {
        receiver.lastSessionSaved = now;
        const currentRoomId = useUIStore.getState().currentRoomId || '';
        chunkStorage.saveSession({
          transferId: frame.transferId,
          roomId: currentRoomId,
          fileName: receiver.offer.name,
          fileSize: receiver.offer.size,
          mimeType: receiver.offer.mimeType,
          totalChunks: receiver.totalChunks,
          senderId: receiver.senderId,
          senderName: '',
          receivedBytes: receiver.receivedBytes,
          receivedCount: receiver.receivedCount,
          lastSequence: receiver.lastSequence,
          updatedAt: now
        });
      }
    }

    if (receiver.receivedCount === receiver.totalChunks) {
      this.finalizeReceivedFile(frame.transferId);
    }
  }

  private handleRelayChunk(chunk: any): void {
    if (!chunk.data || !chunk.transferId) return;

    const receiver = this.activeReceivers.get(chunk.transferId);
    if (!receiver) return;

    // Deduplication: skip if this sequence was already received
    if (receiver.chunks[chunk.sequence] !== undefined && receiver.chunks[chunk.sequence] !== null) {
      console.debug(`[TransferManager] Relay: duplicate chunk ${chunk.sequence} for ${chunk.transferId}, skipping`);
      return;
    }

    let buffer: ArrayBuffer;
    if (typeof chunk.data === 'string') {
      const binary = atob(chunk.data);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      buffer = bytes.buffer;
    } else if (chunk.data instanceof ArrayBuffer) {
      buffer = chunk.data;
    } else if (ArrayBuffer.isView(chunk.data)) {
      buffer = chunk.data.buffer.slice(chunk.data.byteOffset, chunk.data.byteOffset + chunk.data.byteLength);
    } else if (chunk.data && chunk.data.type === 'Buffer' && Array.isArray(chunk.data.data)) {
      buffer = new Uint8Array(chunk.data.data).buffer;
    } else {
      buffer = chunk.data;
    }

    receiver.chunks[chunk.sequence] = buffer;
    receiver.receivedBytes += buffer.byteLength;
    receiver.receivedCount++;
    receiver.lastSequence = Math.max(receiver.lastSequence, chunk.sequence);

    this.flushContiguousChunks(receiver);

    const now = Date.now();
    const elapsed = (now - receiver.lastProgressUpdate) / 1000;

    // Use receiver.totalChunks (set from file-offer) not chunk.totalChunks (may mismatch)
    const totalForCompletion = receiver.totalChunks;

    if (elapsed >= 0.2 || receiver.receivedCount === totalForCompletion) {
      const speed = Math.round((receiver.receivedBytes - receiver.lastBytes) / elapsed);
      const remainingBytes = receiver.offer.size - receiver.receivedBytes;
      const eta = speed > 0 ? Math.round(remainingBytes / speed) : 0;

      useTransferStore.getState().updateTransfer(chunk.transferId, {
        status: 'transferring',
        transportMode: 'websocket-relay',
        bytesTransferred: receiver.receivedBytes,
        lastSequence: receiver.lastSequence,
        speed,
        eta,
        error: undefined
      });

      receiver.lastProgressUpdate = now;
      receiver.lastBytes = receiver.receivedBytes;
    }

    if (receiver.receivedCount === totalForCompletion) {
      this.finalizeReceivedFile(chunk.transferId);
    }
  }

  /**
   * Gracefully pauses active transfers when a peer disconnects.
   */
  private handlePeerLeave(peerId: string): void {
    console.log(`[TransferManager] Handling peer disconnect for: ${peerId}`);

    // Clear and pause queued outbound tasks for the disconnected peer
    const queue = this.sendQueues.get(peerId);
    if (queue && queue.length > 0) {
      for (const task of queue) {
        useTransferStore.getState().updateTransfer(task.transferId, {
          status: 'interrupted',
          interruptedAt: Date.now(),
          error: 'Peer disconnected. Transfer paused — will auto-resume on reconnect'
        });
      }
      this.sendQueues.delete(peerId);
    }
    this.activeSendsPerPeer.delete(peerId);

    const devices = useDeviceStore.getState().devices;
    const transfers = useTransferStore.getState().transfers;
    for (const [id, t] of transfers.entries()) {
      // Check if receiver device is still in room (e.g. reconnected or updated ID)
      const isReceiverStillInRoom = Array.from(devices.values()).some(
        (d) => d.id === t.receiverId || (t.receiverName && d.name === t.receiverName)
      );
      if (t.receiverId === peerId && !isReceiverStillInRoom && (t.status === 'transferring' || t.status === 'offered')) {
        const senderControl = this.activeSenders.get(id);
        if (senderControl) {
          senderControl.abort = true;
          this.activeSenders.delete(id);
        }

        useTransferStore.getState().updateTransfer(id, {
          status: 'interrupted',
          interruptedAt: Date.now(),
          error: 'Peer disconnected. Transfer paused — will auto-resume on reconnect'
        });
        console.log(`[TransferManager] Outbound transfer ${id} paused due to peer disconnect.`);
      }

      // Check if sender device is still in room
      const isSenderStillInRoom = Array.from(devices.values()).some(
        (d) => d.id === t.senderId || (t.senderName && d.name === t.senderName)
      );
      if (t.senderId === peerId && !isSenderStillInRoom && t.status === 'transferring') {
        useTransferStore.getState().updateTransfer(id, {
          status: 'interrupted',
          interruptedAt: Date.now(),
          error: 'Sender disconnected. Waiting to auto-resume...'
        });
      }
    }
  }

  /**
   * Checks IndexedDB for any in-flight interrupted transfers and attempts auto-resumption with peers.
   * Only restores sessions that are genuinely incomplete and not currently active.
   */
  public async restoreInFlightTransfers(): Promise<void> {
    try {
      const sessions = await chunkStorage.getAllActiveSessions();
      if (sessions.length === 0) return;

      const devices = useDeviceStore.getState().devices;
      const selfDevice = useDeviceStore.getState().selfDevice;
      const currentRoomId = useUIStore.getState().currentRoomId;
      const activeTransfers = useTransferStore.getState().transfers;

      for (const session of sessions) {
        // Skip sessions that don't match current room
        if (session.roomId && currentRoomId && session.roomId !== currentRoomId) {
          console.log(`[TransferManager] Skipping session ${session.transferId} — different room`);
          continue;
        }

        // Skip sessions that are already active in the transfer store as completed / transferring
        const existing = activeTransfers.get(session.transferId);
        if (existing) {
          if (existing.status === 'completed' || existing.status === 'transferring') {
            // Already done or still going — don't interfere
            continue;
          }
        }

        // Skip if the sender is ourselves (we were the sender, not receiver)
        if (session.senderId === selfDevice?.id) {
          console.log(`[TransferManager] Skipping session ${session.transferId} — we are the sender, not receiver`);
          continue;
        }

        // Restore transfer record in UI store if not already present
        if (!existing) {
          useTransferStore.getState().addTransfer({
            id: session.transferId,
            senderId: session.senderId,
            senderName: session.senderName || 'Peer',
            receiverId: selfDevice?.id || '',
            receiverName: selfDevice?.name || '',
            type: 'file',
            status: 'interrupted',
            fileName: session.fileName,
            fileSize: session.fileSize,
            mimeType: session.mimeType,
            totalChunks: session.totalChunks,
            bytesTransferred: session.receivedBytes,
            lastSequence: session.lastSequence,
            startedAt: session.updatedAt,
            error: 'Interrupted transfer recovered. Reconnecting to sender...'
          });
        }

        // Initialize in-memory activeReceiver
        if (!this.activeReceivers.has(session.transferId)) {
          const storedChunks = (await chunkStorage.getAllChunks(session.transferId, session.totalChunks)) as ArrayBuffer[];
          const restoredSession: ActiveReceiverSession = {
            transferId: session.transferId,
            offer: {
              name: session.fileName,
              size: session.fileSize,
              mimeType: session.mimeType,
              chunkSize: CHUNK_SIZE,
              totalChunks: session.totalChunks
            },
            senderId: session.senderId,
            chunks: storedChunks,
            blobParts: [],
            flushedUpTo: 0,
            receivedBytes: session.receivedBytes,
            totalChunks: session.totalChunks,
            receivedCount: session.receivedCount,
            lastSequence: session.lastSequence,
            startTime: session.updatedAt,
            lastProgressUpdate: Date.now(),
            lastBytes: session.receivedBytes
          };
          this.activeReceivers.set(session.transferId, restoredSession);
          // Immediately compact whatever was loaded from disk into Blob parts
          // so the restored (already-received) portion doesn't sit around as
          // live ArrayBuffers for the rest of the transfer's lifetime.
          this.flushContiguousChunks(restoredSession, true);
        }

        // Find sender peer in room
        const activeSenderPeer = Array.from(devices.values()).find(
          (d) => d.id === session.senderId || (session.senderName && d.name === session.senderName)
        );

        if (activeSenderPeer) {
          console.log(
            `%c[TransferManager] Auto-resuming "${session.fileName}" from chunk ${session.lastSequence + 1}/${session.totalChunks} with ${activeSenderPeer.name}`,
            'color: #06b6d4; font-weight: bold'
          );

          this.sendControlMessage(activeSenderPeer.id, {
            type: 'file-resume',
            transferId: session.transferId,
            timestamp: Date.now(),
            payload: {
              transferId: session.transferId,
              lastReceivedChunk: session.lastSequence,
              lastReceivedOffset: session.receivedBytes,
              newReceiverId: selfDevice?.id,
              newReceiverName: selfDevice?.name
            }
          });
        } else {
          console.log(`[TransferManager] Sender "${session.senderName}" not yet in room for session ${session.transferId} — will retry on next peer join`);
        }
      }
    } catch (err) {
      console.warn('[TransferManager] Error restoring in-flight transfers:', err);
    }
  }

  /**
   * Converts a contiguous run of raw received chunks into a Blob and
   * discards the ArrayBuffer references, so the receiver's peak memory is
   * bounded by MEMORY_FLUSH_BATCH_SIZE instead of growing with the whole
   * file. Without this, a multi-GB transfer holds every chunk live until
   * the very end, then builds one giant Blob from thousands of ArrayBuffers
   * at once — exactly what crashes memory-constrained tabs (mobile Chrome's
   * "Aw, Snap!") right at 100%, during final assembly, not during transfer.
   *
   * Normal (per-chunk) calls flush at most one fixed-size batch so the hot
   * receive path stays cheap. `forceAll=true` (end of transfer, or right
   * after restoring from IndexedDB) drains every remaining contiguous chunk
   * regardless of batch size.
   */
  private flushContiguousChunks(receiver: ActiveReceiverSession, forceAll = false): void {
    for (;;) {
      let runLength = 0;
      while (
        receiver.flushedUpTo + runLength < receiver.totalChunks &&
        receiver.chunks[receiver.flushedUpTo + runLength]
      ) {
        runLength++;
      }
      if (runLength === 0) return;
      if (!forceAll && runLength < MEMORY_FLUSH_BATCH_SIZE) return;

      const batchLength = forceAll ? runLength : MEMORY_FLUSH_BATCH_SIZE;
      const start = receiver.flushedUpTo;
      const batch = receiver.chunks.slice(start, start + batchLength) as ArrayBuffer[];

      // Null out the raw references immediately — `batch` is now the only
      // thing holding them for the short-lived Blob() construction below.
      for (let i = start; i < start + batchLength; i++) {
        receiver.chunks[i] = undefined as any;
      }

      receiver.blobParts.push(new Blob(batch, { type: receiver.offer.mimeType }));
      receiver.flushedUpTo = start + batchLength;

      if (!forceAll) return; // one batch per call on the hot path
    }
  }

  /**
   * Streams the receiver's compacted Blob parts to disk one at a time via
   * the dedicated download Service Worker, instead of concatenating them
   * into one in-memory Blob first. Each part (≈16MB, from
   * MEMORY_FLUSH_BATCH_SIZE) is read and written individually and then
   * dereferenced, so peak memory stays at "one part", regardless of total
   * file size.
   */
  private async streamDownloadBlobParts(receiver: ActiveReceiverSession, safeName: string): Promise<void> {
    const writer = new StreamDownloadWriter(safeName, receiver.offer.size, receiver.offer.mimeType);
    await writer.start();

    // Re-slice each ~16MB compacted part into smaller (~1MB) pieces before
    // posting to the Service Worker, and yield to the event loop between
    // posts. This avoids flooding postMessage with a handful of huge
    // transfers back-to-back and gives the browser's disk-write pipeline a
    // chance to keep pace, instead of buffering everything in the SW first.
    const POST_CHUNK_SIZE = 1 * 1024 * 1024;

    try {
      for (let i = 0; i < receiver.blobParts.length; i++) {
        const part = receiver.blobParts[i];
        (receiver.blobParts as any)[i] = null; // release the Blob handle before reading it

        for (let offset = 0; offset < part.size; offset += POST_CHUNK_SIZE) {
          const slice = part.slice(offset, Math.min(offset + POST_CHUNK_SIZE, part.size));
          const buffer = await slice.arrayBuffer();
          writer.write(buffer);
          // Yield periodically so this doesn't block the main thread outright.
          if ((offset / POST_CHUNK_SIZE) % 8 === 0) {
            await new Promise((r) => setTimeout(r, 0));
          }
        }
      }
      writer.end();
    } catch (err) {
      writer.abort(err instanceof Error ? err.message : 'write failed');
      throw err;
    }
  }

  private async finalizeReceivedFile(transferId: string): Promise<void> {
    const receiver = this.activeReceivers.get(transferId);
    if (!receiver) return;

    // Guard: NEVER assemble/download a file until every chunk has actually
    // arrived. Previously a stall watchdog could force this through early
    // with missing chunks, producing corrupted/truncated/unopenable files —
    // that case is now handled by marking the transfer 'interrupted' and
    // requesting a resume instead (see the 'file-complete' handler above).
    if (receiver.receivedCount < receiver.totalChunks) {
      return;
    }

    if (receiver.completionTimer) {
      clearInterval(receiver.completionTimer);
    }

    this.activeReceivers.delete(transferId);
    console.log(`[TransferManager] Finalizing received file "${receiver.offer.name}" (${receiver.receivedBytes} bytes)`);

    // Drain any remaining contiguous chunks accumulated since the last
    // periodic flush into Blob parts.
    this.flushContiguousChunks(receiver, true);

    // Safety net: if something still didn't make it into blobParts (e.g. a
    // chunk was dropped from memory by a reload mid-transfer), pull the
    // missing tail from persistent storage rather than failing the download.
    if (receiver.flushedUpTo < receiver.totalChunks) {
      console.warn(
        `[TransferManager] ${receiver.totalChunks - receiver.flushedUpTo} chunk(s) missing from memory at finalize — reloading from IndexedDB`
      );
      const stored = (await chunkStorage.getAllChunks(transferId, receiver.totalChunks)) as ArrayBuffer[];
      const tail = stored.slice(receiver.flushedUpTo);
      if (tail.some((c) => !c)) {
        console.error(`[TransferManager] Transfer ${transferId} is missing chunks even in persistent storage — aborting finalize.`);
        useTransferStore.getState().updateTransfer(transferId, {
          status: 'failed',
          error: 'Some chunks were lost and could not be recovered. Please retry the transfer.'
        });
        chunkStorage.deleteSession(transferId);
        return;
      }
      receiver.blobParts.push(new Blob(tail, { type: receiver.offer.mimeType }));
      receiver.flushedUpTo = receiver.totalChunks;
    }

    const safeName = sanitizeFilename(receiver.offer.name);

    // Primary path: stream bytes straight to disk via a dedicated Service
    // Worker (see services/streamDownload.ts) instead of materializing the
    // whole file as one in-memory Blob. A single giant Blob (even built from
    // smaller Blob parts) still has to be fully resolvable for the browser
    // to hand it to the native downloader — on memory-constrained mobile
    // tabs that is exactly what crashes a multi-GB transfer right at 100%.
    // Streaming never needs more than one small part resident at once.
    // Primary path: stream bytes straight to disk via dedicated Service Worker
    // ONLY for desktop browsers on very large files (> 500 MB).
    // Mobile browsers (Android/iOS) block subframe downloads and use the direct Blob path below.
    if (isStreamDownloadSupported() && receiver.offer.size > 500 * 1024 * 1024) {
      try {
        await this.streamDownloadBlobParts(receiver, safeName);
        await chunkStorage.deleteSession(transferId);
        useTransferStore.getState().updateTransfer(transferId, {
          status: 'completed',
          bytesTransferred: receiver.offer.size,
          completedAt: Date.now(),
          error: undefined
        });
        return;
      } catch (err) {
        console.warn(
          '[TransferManager] Streaming download failed, falling back to in-memory Blob download:',
          err
        );
        // fall through to the Blob-based path below
      }
    }

    // Direct Blob download: fast, reliable across all mobile and desktop browsers
    const blob = new Blob(receiver.blobParts, { type: receiver.offer.mimeType });
    const url = URL.createObjectURL(blob);

    // Save downloadUrl on transfer record so the user can always click "Save File" in the UI
    useTransferStore.getState().updateTransfer(transferId, {
      status: 'completed',
      bytesTransferred: receiver.offer.size,
      completedAt: Date.now(),
      downloadUrl: url,
      error: undefined
    });

    // Automatic download attempt
    try {
      const a = document.createElement('a');
      a.href = url;
      a.download = safeName;
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        try {
          document.body.removeChild(a);
        } catch {}
      }, 500);
    } catch (e) {
      console.warn('[TransferManager] Auto download trigger blocked by browser:', e);
    }

    // Keep the object URL active for 10 minutes so the user can save/re-download if Android blocked automatic download
    setTimeout(() => {
      try {
        URL.revokeObjectURL(url);
      } catch {}
    }, 600000);

    // Clean up persistent storage
    await chunkStorage.deleteSession(transferId);
  }

  public sendControlMessage(targetPeerId: string, msg: PeerMessage): void {
    const devices = useDeviceStore.getState().devices;
    let activeId = targetPeerId;
    if (!devices.has(activeId)) {
      const transfer = useTransferStore.getState().transfers.get(msg.transferId);
      const peerName = transfer
        ? transfer.receiverId === targetPeerId
          ? transfer.receiverName
          : transfer.senderName
        : undefined;
      if (peerName) {
        const found = Array.from(devices.values()).find((d) => d.name === peerName);
        if (found) {
          activeId = found.id;
        }
      }
    }

    const json = JSON.stringify(msg);
    // 1. Try sending over direct WebRTC DataChannel
    peerConnectionManager.sendData(activeId, json);
    // 2. ALSO send reliably via Socket.IO signaling server relay
    socketService.sendPeerMessage(activeId, msg);
  }
}

export const transferManager = new TransferManager();

if (typeof window !== 'undefined') {
  if ((window as any).__xtrashare_transfer_manager) {
    (window as any).__xtrashare_transfer_manager.destroy();
  }
  (window as any).__xtrashare_transfer_manager = transferManager;
}

