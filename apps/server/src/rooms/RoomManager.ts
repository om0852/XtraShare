import { DeviceInfo, MAX_ROOM_DEVICES } from '@xtrashare/protocol';

export interface RoomRecord {
  roomId: string;
  createdAt: number;
  ownerSocketId: string;
  // socketId -> DeviceInfo
  devices: Map<string, DeviceInfo>;
}

export class RoomManager {
  // roomId -> RoomRecord
  private rooms = new Map<string, RoomRecord>();
  // socketId -> roomId
  private socketToRoom = new Map<string, string>();

  /**
   * Generates a clean, readable 6-character room code (avoiding ambiguous chars like 0/O, 1/I).
   */
  public generateRoomCode(): string {
    const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    let code = '';
    do {
      code = '';
      for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
      }
    } while (this.rooms.has(code));
    return code;
  }

  /**
   * Creates a new ephemeral room with the given owner.
   */
  public createRoom(ownerSocketId: string, device: DeviceInfo, preferredCode?: string): RoomRecord {
    // If the socket was in another room, leave first
    this.leaveCurrentRoom(ownerSocketId);

    const roomId = preferredCode ? preferredCode.toUpperCase().trim() : this.generateRoomCode();
    const room: RoomRecord = {
      roomId,
      createdAt: Date.now(),
      ownerSocketId,
      devices: new Map()
    };

    room.devices.set(ownerSocketId, device);
    this.rooms.set(roomId, room);
    this.socketToRoom.set(ownerSocketId, roomId);

    return room;
  }

  /**
   * Adds a device to an existing room.
   */
  public joinRoom(
    rawRoomId: string,
    socketId: string,
    device: DeviceInfo
  ): { success: boolean; room?: RoomRecord; error?: string } {
    const roomId = rawRoomId.toUpperCase().trim();
    const room = this.rooms.get(roomId);

    if (!room) {
      return { success: false, error: 'ROOM_NOT_FOUND' };
    }

    if (room.devices.size >= MAX_ROOM_DEVICES) {
      return { success: false, error: 'ROOM_FULL' };
    }

    // Leave any previous room
    this.leaveCurrentRoom(socketId);

    room.devices.set(socketId, device);
    this.socketToRoom.set(socketId, roomId);

    return { success: true, room };
  }

  /**
   * Removes a socket from its current room, and destroys the room if empty.
   */
  public leaveCurrentRoom(socketId: string): { roomId?: string; removedDevice?: DeviceInfo; roomEmpty?: boolean } {
    const roomId = this.socketToRoom.get(socketId);
    if (!roomId) {
      return {};
    }

    const room = this.rooms.get(roomId);
    this.socketToRoom.delete(socketId);

    if (!room) {
      return { roomId };
    }

    const removedDevice = room.devices.get(socketId);
    room.devices.delete(socketId);

    let roomEmpty = false;
    if (room.devices.size === 0) {
      this.rooms.delete(roomId);
      roomEmpty = true;
    } else if (room.ownerSocketId === socketId) {
      // Reassign ownership to next available device
      const nextOwner = room.devices.keys().next().value;
      if (nextOwner) {
        room.ownerSocketId = nextOwner;
        const nextDevice = room.devices.get(nextOwner);
        if (nextDevice) nextDevice.isHost = true;
      }
    }

    return { roomId, removedDevice, roomEmpty };
  }

  public getRoom(rawRoomId: string): RoomRecord | undefined {
    return this.rooms.get(rawRoomId.toUpperCase().trim());
  }

  public getRoomIdBySocket(socketId: string): string | undefined {
    return this.socketToRoom.get(socketId);
  }

  public getDevicesInRoom(rawRoomId: string): DeviceInfo[] {
    const room = this.getRoom(rawRoomId);
    if (!room) return [];
    return Array.from(room.devices.values());
  }

  public getActiveRoomCount(): number {
    return this.rooms.size;
  }
}
