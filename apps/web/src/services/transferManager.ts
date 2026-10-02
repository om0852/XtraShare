import {
  CHUNK_SIZE,
  HIGH_WATER_MARK,
  LOW_WATER_MARK,
  FileOfferPayload,
  FileResumePayload,
  PeerMessage,
  sanitizeFilename,
  Transfer,
  TransportMode
} from '@xtrashare/protocol';
import { peerConnectionManager } from './webrtc.js';
import { socketService } from './socket.js';
import { useTransferStore } from '../store/transferStore.js';
import { useDeviceStore } from '../store/deviceStore.js';
import { useUIStore } from '../store/uiStore.js';
import { chunkStorage } from './chunkStorage.js';

interface ActiveReceiverSession {
  transferId: string;
  offer: FileOfferPayload;
  senderId: string;
  chunks: ArrayBuffer[];
  receivedBytes: number;
  totalChunks: number;
  receivedCount: number;
  lastSequence: number;
  startTime: number;
  lastProgressUpdate: number;
  lastBytes: number;
}

export class TransferManager {
  private activeReceivers = new Map<string, ActiveReceiverSession>();
  private activeSenders = new Map<string, { abort: boolean }>();
  private processedOfferIds = new Set<string>();
  private senderFiles = new Map<string, File>();

  constructor() {
    // 1. WebRTC DataChannel binary & control listener
    peerConnectionManager.onMessage((peerId, data) => {
      this.handleIncomingData(peerId, data);
    });

    // 2. Direct reliable control message listener via Socket.IO
    socketService.onPeerMessage((peerId, msg) => {
      this.handleControlMessage(peerId, msg);
    });

    // 3. Fallback WebSocket relay chunk listener
    socketService.onRelay((chunk) => {
      this.handleRelayChunk(chunk);
    });

    // 4. Peer disconnect event listener for graceful transfer pause
    socketService.onPeerLeave((deviceId) => {
      this.handlePeerLeave(deviceId);
    });

    // 5. Peer join & room join event listeners for auto-resumption
    socketService.onPeerJoin((_device) => {
      this.restoreInFlightTransfers();
    });

    socketService.onRoomJoined((_roomId) => {
      this.restoreInFlightTransfers();
    });
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

    const transferId = `tr_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

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
      bytesTransferred: 0,
      startedAt: Date.now()
    };

    useTransferStore.getState().addTransfer(transfer);

    const offerPayload: FileOfferPayload = {
      name: file.name,
      size: file.size,
      mimeType: file.type || 'application/octet-stream',
      chunkSize: CHUNK_SIZE,
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
    this.senderFiles.delete(transferId);
    delete (this as any)[`file_${transferId}`];
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

      // Only kick off WebRTC negotiation if no connection exists yet
      // DO NOT call ensureConnection if connection is already in progress —
      // that would trigger a new offer/answer cycle and destabilize the existing channel
      const existingPc = peerConnectionManager.getConnection(peerId);
      if (!existingPc || existingPc.connectionState === 'closed' || existingPc.connectionState === 'failed') {
        try {
          peerConnectionManager.ensureConnection(peerId);
        } catch {}
      }

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

    // Wait up to 5s for WebRTC DataChannel (also triggers negotiation)
    let channel = peerConnectionManager.getDataChannel(targetPeerId);
    if (!channel || channel.readyState !== 'open') {
      console.log(`[TransferManager] Awaiting WebRTC DataChannel with ${targetPeerId} (up to 5s)...`);
      channel = (await this.waitForDataChannel(targetPeerId, 5000)) || undefined;
    }

    if (!channel || channel.readyState !== 'open') {
      console.warn(`[TransferManager] DataChannel not ready after 5s. Switching to WebSocket fallback relay.`);
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

    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    let bytesSent = startSeq * CHUNK_SIZE;
    let lastTime = Date.now();
    let lastBytes = bytesSent;

    // Set a larger send buffer and low-water mark for maximum LAN throughput
    channel.bufferedAmountLowThreshold = LOW_WATER_MARK;
    try {
      // Chrome supports setting the send buffer size via SCTP
      const pc = peerConnectionManager.getConnection(targetPeerId);
      if (pc && (pc as any).sctp) {
        // Attempt to set maxMessageSize hint (browser may ignore)
        (pc as any).sctp.maxMessageSize;
      }
    } catch {}

    // Pre-read the very first chunk before entering the loop
    let prefetchBuffer: ArrayBuffer | null = null;
    if (startSeq < totalChunks) {
      const s0 = startSeq * CHUNK_SIZE;
      prefetchBuffer = await file.slice(s0, Math.min(s0 + CHUNK_SIZE, file.size)).arrayBuffer();
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

      // Backpressure regulation: wait for drain with safety timeout
      if (channel.bufferedAmount > HIGH_WATER_MARK) {
        await this.waitForDrain(channel);
        if (senderControl.abort || channel.readyState !== 'open') {
          useTransferStore.getState().updateTransfer(transferId, {
            status: 'interrupted',
            lastSequence: seq,
            bytesTransferred: bytesSent,
            error: 'Connection interrupted during buffer drain'
          });
          return;
        }
      }

      // Use pre-fetched buffer from previous iteration, or fetch now
      const buffer = prefetchBuffer ?? await file.slice(seq * CHUNK_SIZE, Math.min((seq + 1) * CHUNK_SIZE, file.size)).arrayBuffer();
      prefetchBuffer = null;

      // Kick off read of next chunk in parallel (I/O pipeline)
      const nextSeq = seq + 1;
      if (nextSeq < totalChunks) {
        const ns = nextSeq * CHUNK_SIZE;
        file.slice(ns, Math.min(ns + CHUNK_SIZE, file.size)).arrayBuffer().then((b) => {
          prefetchBuffer = b;
        }).catch(() => {});
      }

      // Construct binary frame: 32 bytes header + raw chunk payload
      const frame = this.buildBinaryFrame(transferId, seq, totalChunks, buffer);
      try {
        channel.send(frame);
      } catch (err) {
        // Mark interrupted — do NOT recursively call relay here as it creates a thrashing loop
        // (relay→WebRTC→relay→WebRTC). Let the user retry or auto-resume handle it.
        console.warn(`[TransferManager] WebRTC channel send failed at chunk ${seq}. Marking interrupted.`, err);
        this.activeSenders.delete(transferId);
        useTransferStore.getState().updateTransfer(transferId, {
          status: 'interrupted',
          lastSequence: seq,
          bytesTransferred: bytesSent,
          error: 'WebRTC channel dropped. Click Retry or wait for auto-resume.'
        });
        return;
      }

      bytesSent += buffer.byteLength;

      // Speed & ETA calculation every 200ms or last chunk
      const now = Date.now();
      const elapsed = (now - lastTime) / 1000;
      if (elapsed >= 0.2 || seq === totalChunks - 1) {
        const speed = Math.round((bytesSent - lastBytes) / elapsed);
        const remainingBytes = file.size - bytesSent;
        const eta = speed > 0 ? Math.round(remainingBytes / speed) : 0;

        useTransferStore.getState().updateTransfer(transferId, {
          bytesTransferred: bytesSent,
          lastSequence: seq,
          speed,
          eta
        });

        lastTime = now;
        lastBytes = bytesSent;
      }
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

    // Use same CHUNK_SIZE as WebRTC so receiver totalChunks is consistent
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    let bytesSent = startSeq * CHUNK_SIZE;
    let lastTime = Date.now();
    let lastBytes = bytesSent;

    for (let seq = startSeq; seq < totalChunks; seq++) {
      if (senderControl.abort) {
        console.log(`[TransferManager] Relay sending of ${transferId} aborted at chunk ${seq}`);
        return;
      }

      // NOTE: We intentionally do NOT switch from relay to WebRTC mid-transfer.
      // Switching mid-transfer caused a thrashing loop:
      //   relay → WebRTC → channel drop → relay → WebRTC → ...
      // Transport is locked at transfer start. If WebRTC is desired, retry the transfer.

      const start = seq * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, file.size);
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
        const speed = Math.round((bytesSent - lastBytes) / elapsed);
        const remainingBytes = file.size - bytesSent;
        const eta = speed > 0 ? Math.round(remainingBytes / speed) : 0;

        useTransferStore.getState().updateTransfer(transferId, {
          bytesTransferred: bytesSent,
          lastSequence: seq,
          speed,
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

  private waitForDrain(channel: RTCDataChannel): Promise<void> {
    return new Promise((resolve) => {
      if (channel.readyState !== 'open') return resolve();

      const timeout = setTimeout(() => {
        channel.removeEventListener('bufferedamountlow', onLow);
        resolve();
      }, 1500);

      const onLow = () => {
        clearTimeout(timeout);
        channel.removeEventListener('bufferedamountlow', onLow);
        resolve();
      };
      channel.addEventListener('bufferedamountlow', onLow);
    });
  }

  private buildBinaryFrame(transferId: string, seq: number, totalChunks: number, payload: ArrayBuffer): ArrayBuffer {
    const headerSize = 32;
    const packet = new Uint8Array(headerSize + payload.byteLength);
    const view = new DataView(packet.buffer);

    const encoder = new TextEncoder();
    const idBytes = encoder.encode(transferId.padEnd(16, ' ').substring(0, 16));
    packet.set(idBytes, 0);

    view.setUint32(16, seq, false);
    view.setUint32(20, totalChunks, false);
    view.setUint32(24, payload.byteLength, false);
    view.setUint32(28, 0, false);

    packet.set(new Uint8Array(payload), headerSize);
    return packet.buffer;
  }

  private parseBinaryFrame(buffer: ArrayBuffer): {
    transferId: string;
    sequence: number;
    totalChunks: number;
    payload: ArrayBuffer;
  } | null {
    if (buffer.byteLength < 32) return null;

    const view = new DataView(buffer);
    const idBytes = new Uint8Array(buffer, 0, 16);
    const decoder = new TextDecoder();
    const transferId = decoder.decode(idBytes).trim();

    const sequence = view.getUint32(16, false);
    const totalChunks = view.getUint32(20, false);
    const payloadLength = view.getUint32(24, false);
    const payload = buffer.slice(32, 32 + payloadLength);

    return { transferId, sequence, totalChunks, payload };
  }

  private handleIncomingData(peerId: string, data: string | ArrayBuffer): void {
    if (typeof data === 'string') {
      try {
        const msg = JSON.parse(data) as PeerMessage;
        this.handleControlMessage(peerId, msg);
      } catch (err) {
        console.warn('Failed to parse peer control message:', err);
      }
    } else {
      this.handleBinaryChunk(peerId, data);
    }
  }

  public handleControlMessage(peerId: string, msg: PeerMessage): void {
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
          console.log(`[TransferManager] Recipient accepted transfer ${msg.transferId}. Starting stream.`);
          this.startSendingChunks(peerId, msg.transferId, file, 0);
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

          this.startSendingChunks(targetPeerId, msg.transferId, file, nextSeq);
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
        this.finalizeReceivedFile(msg.transferId);
        break;
      }

      case 'file-error': {
        const errorPayload = msg.payload as any;
        this.cleanupSenderState(msg.transferId);
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

    // Persist chunk to IndexedDB in background
    chunkStorage.saveChunk(frame.transferId, frame.sequence, frame.payload);

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

      // Update session progress in IndexedDB
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
    } else {
      buffer = chunk.data;
    }

    receiver.chunks[chunk.sequence] = buffer;
    receiver.receivedBytes += buffer.byteLength;
    receiver.receivedCount++;
    receiver.lastSequence = Math.max(receiver.lastSequence, chunk.sequence);

    chunkStorage.saveChunk(chunk.transferId, chunk.sequence, buffer);

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

    // If we are sending to this peer, pause and keep file ready for resumption
    const transfers = useTransferStore.getState().transfers;
    for (const [id, t] of transfers.entries()) {
      if (t.receiverId === peerId && (t.status === 'transferring' || t.status === 'offered')) {
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

      // If we were receiving from this peer
      if (t.senderId === peerId && t.status === 'transferring') {
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
          const storedChunks = await chunkStorage.getAllChunks(session.transferId, session.totalChunks);
          this.activeReceivers.set(session.transferId, {
            transferId: session.transferId,
            offer: {
              name: session.fileName,
              size: session.fileSize,
              mimeType: session.mimeType,
              chunkSize: CHUNK_SIZE,
              totalChunks: session.totalChunks
            },
            senderId: session.senderId,
            chunks: storedChunks as ArrayBuffer[],
            receivedBytes: session.receivedBytes,
            totalChunks: session.totalChunks,
            receivedCount: session.receivedCount,
            lastSequence: session.lastSequence,
            startTime: session.updatedAt,
            lastProgressUpdate: Date.now(),
            lastBytes: session.receivedBytes
          });
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

  private async finalizeReceivedFile(transferId: string): Promise<void> {
    const receiver = this.activeReceivers.get(transferId);
    if (!receiver) return;

    this.activeReceivers.delete(transferId);
    console.log(`[TransferManager] Finalizing received file "${receiver.offer.name}" (${receiver.receivedBytes} bytes)`);

    // Verify all chunks are assembled, loading any missing chunks from IndexedDB
    let allChunks = receiver.chunks;
    if (allChunks.some((c) => !c)) {
      console.log(`[TransferManager] Loading chunks from persistent storage for assembly...`);
      allChunks = (await chunkStorage.getAllChunks(transferId, receiver.totalChunks)) as ArrayBuffer[];
    }

    // Assemble file Blob
    const blob = new Blob(allChunks, { type: receiver.offer.mimeType });
    const safeName = sanitizeFilename(receiver.offer.name);

    // Trigger browser download safely
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = safeName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 15000);

    // Clean up persistent storage
    await chunkStorage.deleteSession(transferId);

    useTransferStore.getState().updateTransfer(transferId, {
      status: 'completed',
      bytesTransferred: receiver.offer.size,
      completedAt: Date.now(),
      error: undefined
    });
  }

  public sendControlMessage(targetPeerId: string, msg: PeerMessage): void {
    const json = JSON.stringify(msg);
    // 1. Try sending over direct WebRTC DataChannel
    peerConnectionManager.sendData(targetPeerId, json);
    // 2. ALSO send reliably via Socket.IO signaling server relay
    socketService.sendPeerMessage(targetPeerId, msg);
  }
}

export const transferManager = new TransferManager();
