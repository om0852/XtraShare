import { ClipboardItemRecord, ClipboardPacket } from '@xtrashare/protocol';
import { socketService } from './socket.js';
import { useClipboardStore } from '../store/clipboardStore.js';
import { useDeviceStore } from '../store/deviceStore.js';

export class ClipboardManager {
  constructor() {
    socketService.onClipboard((packet) => {
      this.handleIncomingClipboard(packet);
    });
  }

  /**
   * Generates a fast SHA-256 hash of a string using Web Crypto API.
   */
  public async hashText(text: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Reads from system clipboard and broadcasts to current room peers.
   */
  public async sendClipboard(): Promise<{ success: boolean; error?: string }> {
    try {
      if (!navigator.clipboard || !navigator.clipboard.readText) {
        return { success: false, error: 'Clipboard API not supported in this browser context' };
      }

      const text = await navigator.clipboard.readText();
      if (!text || !text.trim()) {
        return { success: false, error: 'Clipboard is empty' };
      }

      const hash = await this.hashText(text);
      const selfDevice = useDeviceStore.getState().selfDevice;
      const selfId = selfDevice?.id || 'dev_self';

      // Check loop prevention
      if (useClipboardStore.getState().hasHash(hash)) {
        return { success: true };
      }

      const packet: ClipboardPacket = {
        id: `clip_${Date.now().toString(36)}`,
        sourceDeviceId: selfId,
        sourceDeviceName: selfDevice?.name || 'My Device',
        content: text,
        timestamp: Date.now(),
        hash
      };

      // Add to local store as 'sent'
      const record: ClipboardItemRecord = {
        ...packet,
        sourceDeviceName: selfDevice?.name || 'My Device',
        type: 'sent'
      };
      useClipboardStore.getState().addItem(record);

      // Broadcast to room
      socketService.announceClipboard(packet);

      return { success: true };
    } catch (err: any) {
      console.warn('Failed to read clipboard:', err);
      return { success: false, error: err.message || 'Clipboard permission denied' };
    }
  }

  /**
   * Copies text back to the local device clipboard.
   */
  public async copyToClipboard(text: string): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (err) {
      console.warn('Failed to write clipboard:', err);
      return false;
    }
  }

  private async handleIncomingClipboard(packet: ClipboardPacket): Promise<void> {
    // Loop prevention: ignore if we already have this hash
    if (useClipboardStore.getState().hasHash(packet.hash)) {
      return;
    }

    const selfId = useDeviceStore.getState().selfDevice?.id;
    if (packet.sourceDeviceId === selfId) {
      return;
    }

    const record: ClipboardItemRecord = {
      id: packet.id,
      sourceDeviceId: packet.sourceDeviceId,
      sourceDeviceName: packet.sourceDeviceName || 'Connected Peer',
      content: packet.content,
      timestamp: packet.timestamp,
      hash: packet.hash,
      type: 'received'
    };

    useClipboardStore.getState().addItem(record);
  }
}

export const clipboardManager = new ClipboardManager();
