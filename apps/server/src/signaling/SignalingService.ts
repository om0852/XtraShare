import { Server, Socket } from 'socket.io';
import {
  ClientToServerEvents,
  ServerToClientEvents,
  SignalPacket,
  ClipboardPacket,
  RelayChunkPacket
} from '@xtrashare/protocol';
import { DeviceManager } from '../devices/DeviceManager.js';
import { RoomManager } from '../rooms/RoomManager.js';

export class SignalingService {
  private recentClipboardHashes = new Set<string>();

  constructor(
    private io: Server<ClientToServerEvents, ServerToClientEvents>,
    private roomManager: RoomManager,
    private deviceManager: DeviceManager
  ) {
    this.setupListeners();
  }

  private log(tag: string, message: string): void {
    const time = new Date().toLocaleTimeString();
    console.log(`[${time}] ${tag.padEnd(16)} ${message}`);
  }

  private setupListeners(): void {
    this.io.on('connection', (socket: Socket<ClientToServerEvents, ServerToClientEvents>) => {
      const clientIp = socket.handshake.headers['x-forwarded-for'] || socket.handshake.address;
      this.log('🔗 CONNECT', `Socket: ${socket.id.substring(0, 8)}... (IP: ${clientIp})`);

      // 1. Create Room
      socket.on('room:create', (reg, callback) => {
        try {
          const device = this.deviceManager.registerDevice(socket.id, reg, true);
          const room = this.roomManager.createRoom(socket.id, device);

          socket.join(room.roomId);

          this.log(
            '🏠 ROOM:CREATE',
            `Room ${room.roomId} created by "${device.name}" (${device.platform} ${device.browser}, ${device.type})`
          );

          callback({
            success: true,
            roomId: room.roomId,
            selfDevice: device,
            devices: [device]
          });
        } catch (err: any) {
          this.log('❌ ROOM:ERR', `Failed to create room: ${err.message}`);
          callback({
            success: false,
            roomId: '',
            selfDevice: {} as any,
            devices: [],
            error: err.message || 'Failed to create room'
          });
        }
      });

      // 2. Join Room
      socket.on('room:join', (req, callback) => {
        try {
          const normalizedRoom = req.roomId.toUpperCase().trim();
          const targetRoom = this.roomManager.getRoom(normalizedRoom);

          if (!targetRoom) {
            this.log('⚠️ ROOM:JOIN', `Attempt to join non-existent Room "${normalizedRoom}"`);
            callback({
              success: false,
              roomId: normalizedRoom,
              selfDevice: {} as any,
              devices: [],
              error: 'ROOM_NOT_FOUND'
            });
            return;
          }

          const device = this.deviceManager.registerDevice(socket.id, req.device, false);
          const joinResult = this.roomManager.joinRoom(normalizedRoom, socket.id, device);

          if (!joinResult.success || !joinResult.room) {
            this.log('⚠️ ROOM:JOIN', `Room "${normalizedRoom}" join failed: ${joinResult.error}`);
            callback({
              success: false,
              roomId: normalizedRoom,
              selfDevice: {} as any,
              devices: [],
              error: joinResult.error || 'ROOM_FULL'
            });
            return;
          }

          socket.join(normalizedRoom);

          // Broadcast to existing room peers
          socket.to(normalizedRoom).emit('room:device-added', { device });

          const allDevices = this.roomManager.getDevicesInRoom(normalizedRoom);
          this.log(
            '🤝 ROOM:JOIN',
            `"${device.name}" (${device.platform} ${device.browser}) joined Room ${normalizedRoom} (${allDevices.length} peers total)`
          );

          callback({
            success: true,
            roomId: normalizedRoom,
            selfDevice: device,
            devices: allDevices
          });
        } catch (err: any) {
          this.log('❌ ROOM:ERR', `Join error: ${err.message}`);
          callback({
            success: false,
            roomId: req.roomId,
            selfDevice: {} as any,
            devices: [],
            error: err.message || 'INTERNAL_ERROR'
          });
        }
      });

      // 3. Leave Room
      socket.on('room:leave', ({ roomId }) => {
        this.handleLeave(socket, roomId);
      });

      // 4. Update Device metadata/status
      socket.on('device:update', (patch) => {
        const device = this.deviceManager.getBySocketId(socket.id);
        if (!device) return;

        Object.assign(device, patch);
        const roomId = this.roomManager.getRoomIdBySocket(socket.id);
        if (roomId) {
          this.log('🔄 DEV:UPDATE', `Device "${device.name}" updated status to ${device.status}`);
          this.io.to(roomId).emit('room:device-updated', { device });
        }
      });

      // 5. WebRTC Peer Signaling (Offer / Answer / ICE)
      socket.on('peer:signal', (packet: SignalPacket) => {
        const sender = this.deviceManager.getBySocketId(socket.id);
        if (!sender) return;

        packet.from = sender.id;

        const targetSocketId = this.deviceManager.getSocketId(packet.to);
        const targetDevice = this.deviceManager.getByDeviceId(packet.to);

        this.log(
          '⚡ WEBRTC:SIGNAL',
          `${sender.name} -> ${targetDevice?.name || packet.to} [${packet.type.toUpperCase()}]`
        );

        if (targetSocketId) {
          this.io.to(targetSocketId).emit('peer:signal', packet);
        } else {
          this.log('⚠️ SIGNAL:DROP', `Target device ${packet.to} unreachable`);
          socket.emit('error', {
            code: 'DEVICE_NOT_FOUND',
            message: `Target device ${packet.to} not reachable`
          });
        }
      });

      // 6. Direct Reliable Peer Control Message Relay (file-offer, file-accept, file-reject, text, etc.)
      socket.on('peer:message', ({ to, message }: { to: string; message: any }) => {
        const sender = this.deviceManager.getBySocketId(socket.id);
        if (!sender) return;

        const targetSocketId = this.deviceManager.getSocketId(to);
        const targetDevice = this.deviceManager.getByDeviceId(to);
        const msgType = message?.type || 'unknown';
        const fileInfo = message?.payload?.name ? ` "${message.payload.name}"` : '';

        this.log(
          '📨 PEER:MSG',
          `${sender.name} -> ${targetDevice?.name || to} [${msgType}]${fileInfo}`
        );

        if (targetSocketId) {
          this.io.to(targetSocketId).emit('peer:message', {
            from: sender.id,
            message
          });
        } else {
          this.log('⚠️ MSG:DROP', `Peer ${to} not connected for message ${msgType}`);
        }
      });

      // 7. WebSocket Fallback Relay Chunk
      socket.on('transfer:relay-chunk', (chunk: RelayChunkPacket) => {
        const sender = this.deviceManager.getBySocketId(socket.id);
        if (!sender) return;

        chunk.from = sender.id;
        const targetSocketId = this.deviceManager.getSocketId(chunk.to);
        const targetDevice = this.deviceManager.getByDeviceId(chunk.to);

        if (chunk.sequence === 0 || chunk.sequence % 25 === 0 || chunk.sequence === chunk.totalChunks - 1) {
          this.log(
            '📦 RELAY:CHUNK',
            `${sender.name} -> ${targetDevice?.name || chunk.to} chunk ${chunk.sequence + 1}/${chunk.totalChunks}`
          );
        }

        if (targetSocketId) {
          this.io.to(targetSocketId).emit('transfer:relay-chunk', chunk);
        }
      });

      // 8. Clipboard Announce
      socket.on('clipboard:announce', (packet: ClipboardPacket) => {
        const sender = this.deviceManager.getBySocketId(socket.id);
        if (!sender) return;

        packet.sourceDeviceId = sender.id;
        packet.sourceDeviceName = sender.name;

        // Loop prevention deduplication
        if (this.recentClipboardHashes.has(packet.hash)) {
          return;
        }
        this.recentClipboardHashes.add(packet.hash);
        if (this.recentClipboardHashes.size > 200) {
          const first = this.recentClipboardHashes.values().next().value;
          if (first) this.recentClipboardHashes.delete(first);
        }

        const roomId = this.roomManager.getRoomIdBySocket(socket.id);
        if (roomId) {
          this.log(
            '📋 CLIPBOARD:SYNC',
            `"${sender.name}" announced clipboard text (${packet.content.length} chars) to Room ${roomId}`
          );
          socket.to(roomId).emit('clipboard:update', packet);
        }
      });

      // 9. Disconnect
      socket.on('disconnect', (reason) => {
        this.handleDisconnect(socket, reason);
      });
    });
  }

  private handleLeave(socket: Socket, roomId?: string): void {
    const activeRoomId = roomId || this.roomManager.getRoomIdBySocket(socket.id);
    if (!activeRoomId) return;

    socket.leave(activeRoomId);
    const { removedDevice } = this.roomManager.leaveCurrentRoom(socket.id);
    if (removedDevice) {
      this.log('🚪 ROOM:LEAVE', `"${removedDevice.name}" left Room ${activeRoomId}`);
      this.io.to(activeRoomId).emit('room:device-removed', { deviceId: removedDevice.id });
    }
  }

  private handleDisconnect(socket: Socket, reason: string): void {
    const { roomId, removedDevice } = this.roomManager.leaveCurrentRoom(socket.id);
    this.deviceManager.removeDevice(socket.id);

    if (removedDevice) {
      this.log(
        '🔌 DISCONNECT',
        `"${removedDevice.name}" disconnected (${reason}) ${roomId ? `from Room ${roomId}` : ''}`
      );
      if (roomId) {
        this.io.to(roomId).emit('room:device-removed', { deviceId: removedDevice.id });
      }
    }
  }
}
