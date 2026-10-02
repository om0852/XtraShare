import { io, Socket } from 'socket.io-client';
import {
  ClientToServerEvents,
  ServerToClientEvents,
  SignalPacket,
  RelayChunkPacket,
  ClipboardPacket,
  DeviceInfo
} from '@xtrashare/protocol';
import { detectCurrentDevice } from '../utils/deviceDetector.js';
import { useDeviceStore } from '../store/deviceStore.js';
import { useUIStore } from '../store/uiStore.js';

class SocketService {
  private socket: Socket<ServerToClientEvents, ClientToServerEvents> | null = null;
  private signalListeners = new Set<(packet: SignalPacket) => void>();
  private relayListeners = new Set<(chunk: RelayChunkPacket) => void>();
  private clipboardListeners = new Set<(packet: ClipboardPacket) => void>();
  private peerMessageListeners = new Set<(from: string, message: any) => void>();
  private peerJoinListeners = new Set<(device: DeviceInfo) => void>();
  private peerLeaveListeners = new Set<(deviceId: string) => void>();
  private roomJoinedListeners = new Set<(roomId: string) => void>();

  public connect(): void {
    if (this.socket) return;

    // In dev, proxy handles /socket.io; in prod, connects directly to current origin
    this.socket = io({
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 10,
      reconnectionDelay: 1000
    });

    this.socket.on('connect', () => {
      console.log('%c[XtraShare] Connected to signaling server%c ID: ' + this.socket?.id, 'color: #10b981; font-weight: bold', 'color: #94a3b8');
      useUIStore.getState().setConnectionStatus('connected');
      this.autoJoinOrInit();
    });

    this.socket.on('disconnect', () => {
      console.log('%c[XtraShare] Disconnected from signaling server', 'color: #f59e0b; font-weight: bold');
      useUIStore.getState().setConnectionStatus('disconnected');
    });

    this.socket.on('connect_error', (err) => {
      console.warn('[XtraShare] Signaling socket error:', err.message);
      useUIStore.getState().setConnectionStatus('connecting');
    });

    // Room device events
    this.socket.on('room:device-list', ({ devices }) => {
      console.log('[XtraShare] Received room device list:', devices);
      useDeviceStore.getState().setDevices(devices);
    });

    this.socket.on('room:device-added', ({ device }) => {
      console.log('%c[XtraShare] New peer joined room:%c ' + device.name + ' (' + device.platform + ')', 'color: #06b6d4; font-weight: bold', 'color: #cbd5e1');
      useDeviceStore.getState().addOrUpdateDevice(device);
      for (const listener of this.peerJoinListeners) {
        listener(device);
      }
    });

    this.socket.on('room:device-removed', ({ deviceId }) => {
      console.log('[XtraShare] Peer left room:', deviceId);
      useDeviceStore.getState().removeDevice(deviceId);
      for (const listener of this.peerLeaveListeners) {
        listener(deviceId);
      }
    });

    this.socket.on('room:device-updated', ({ device }) => {
      useDeviceStore.getState().addOrUpdateDevice(device);
    });

    // WebRTC signaling
    this.socket.on('peer:signal', (packet) => {
      for (const listener of this.signalListeners) {
        listener(packet);
      }
    });

    // Direct peer control message (reliable fallback)
    this.socket.on('peer:message', ({ from, message }) => {
      console.log('%c[XtraShare] Received peer control message:%c', 'color: #818cf8; font-weight: bold', 'color: #e2e8f0', message.type, message);
      for (const listener of this.peerMessageListeners) {
        listener(from, message);
      }
    });

    // Fallback relay
    this.socket.on('transfer:relay-chunk', (chunk) => {
      for (const listener of this.relayListeners) {
        listener(chunk);
      }
    });

    // Clipboard updates
    this.socket.on('clipboard:update', (packet) => {
      console.log('[XtraShare] Received clipboard update from:', packet.sourceDeviceName);
      for (const listener of this.clipboardListeners) {
        listener(packet);
      }
    });
  }

  public autoJoinOrInit(): void {
    const urlParams = new URLSearchParams(window.location.search);
    const roomParam = urlParams.get('room') || localStorage.getItem('xtrashare_last_room');

    const reg = detectCurrentDevice();

    if (roomParam) {
      this.joinRoom(roomParam, reg);
    } else {
      this.createRoom(reg);
    }
  }

  public createRoom(device = detectCurrentDevice()): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!this.socket) return reject(new Error('Socket not initialized'));

      this.socket.emit('room:create', device, (res) => {
        if (res.success) {
          useDeviceStore.getState().setSelfDevice(res.selfDevice);
          useDeviceStore.getState().setDevices(res.devices);
          useUIStore.getState().setCurrentRoomId(res.roomId);
          localStorage.setItem('xtrashare_last_room', res.roomId);
          for (const listener of this.roomJoinedListeners) {
            listener(res.roomId);
          }
          resolve(res.roomId);
        } else {
          reject(new Error(res.error || 'Failed to create room'));
        }
      });
    });
  }

  public joinRoom(roomId: string, device = detectCurrentDevice()): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!this.socket) return reject(new Error('Socket not initialized'));

      const normalizedId = roomId.toUpperCase().trim();
      console.log(`%c[XtraShare] Joining room: ${normalizedId}`, 'color: #06b6d4; font-weight: bold');

      this.socket.emit(
        'room:join',
        {
          roomId: normalizedId,
          device
        },
        (res) => {
          if (res.success) {
            useDeviceStore.getState().setSelfDevice(res.selfDevice);
            useDeviceStore.getState().setDevices(res.devices);
            useUIStore.getState().setCurrentRoomId(res.roomId);
            localStorage.setItem('xtrashare_last_room', res.roomId);
            console.log(`%c[XtraShare] Joined room: ${res.roomId} (${res.devices.length} peers)`, 'color: #10b981; font-weight: bold');
            for (const listener of this.roomJoinedListeners) {
              listener(res.roomId);
            }
            resolve(res.roomId);
          } else {
            // Room no longer exists on server (server restart / room expired) — create a new one
            console.warn(`[XtraShare] Room "${normalizedId}" not found. Creating a new room...`);
            localStorage.removeItem('xtrashare_last_room');
            this.createRoom(device).then(resolve).catch(reject);
          }
        }
      );
    });
  }

  public sendSignal(packet: SignalPacket): void {
    if (!this.socket) return;
    this.socket.emit('peer:signal', packet);
  }

  public sendRelayChunk(chunk: RelayChunkPacket): void {
    if (!this.socket) return;
    this.socket.emit('transfer:relay-chunk', chunk);
  }

  public sendPeerMessage(to: string, message: any): void {
    if (!this.socket) return;
    this.socket.emit('peer:message', { to, message });
  }

  public announceClipboard(packet: ClipboardPacket): void {
    if (!this.socket) return;
    this.socket.emit('clipboard:announce', packet);
  }

  public updateSelfDevice(patch: Partial<DeviceInfo>): void {
    if (!this.socket) return;
    this.socket.emit('device:update', patch);
  }

  public onSignal(listener: (packet: SignalPacket) => void): () => void {
    this.signalListeners.add(listener);
    return () => this.signalListeners.delete(listener);
  }

  public onPeerMessage(listener: (from: string, message: any) => void): () => void {
    this.peerMessageListeners.add(listener);
    return () => this.peerMessageListeners.delete(listener);
  }

  public onRelay(listener: (chunk: RelayChunkPacket) => void): () => void {
    this.relayListeners.add(listener);
    return () => this.relayListeners.delete(listener);
  }

  public onClipboard(listener: (packet: ClipboardPacket) => void): () => void {
    this.clipboardListeners.add(listener);
    return () => this.clipboardListeners.delete(listener);
  }

  public onPeerJoin(listener: (device: DeviceInfo) => void): () => void {
    this.peerJoinListeners.add(listener);
    return () => this.peerJoinListeners.delete(listener);
  }

  public onPeerLeave(listener: (deviceId: string) => void): () => void {
    this.peerLeaveListeners.add(listener);
    return () => this.peerLeaveListeners.delete(listener);
  }

  public onRoomJoined(listener: (roomId: string) => void): () => void {
    this.roomJoinedListeners.add(listener);
    return () => this.roomJoinedListeners.delete(listener);
  }
}

export const socketService = new SocketService();
