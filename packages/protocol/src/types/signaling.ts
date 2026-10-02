import { DeviceInfo, DeviceRegistration } from './device.js';
import { JoinRoomRequest, JoinRoomResponse } from './room.js';
import { ClipboardPacket } from './clipboard.js';

export type SignalType = 'offer' | 'answer' | 'ice-candidate';

export interface SignalPacket {
  type: SignalType;
  from: string;
  to: string;
  payload: any; // RTCSessionDescriptionInit | RTCIceCandidateInit
}

export interface RelayChunkPacket {
  from: string;
  to: string;
  transferId: string;
  sequence: number;
  totalChunks: number;
  data: string | ArrayBuffer; // base64 or buffer
}

export interface ClientToServerEvents {
  'room:create': (
    device: DeviceRegistration,
    callback: (res: JoinRoomResponse) => void
  ) => void;
  'room:join': (
    req: JoinRoomRequest,
    callback: (res: JoinRoomResponse) => void
  ) => void;
  'room:leave': (data: { roomId: string }) => void;
  'device:update': (data: Partial<DeviceInfo>) => void;
  'peer:signal': (data: SignalPacket) => void;
  'peer:message': (data: { to: string; message: any }) => void;
  'transfer:relay-chunk': (data: RelayChunkPacket) => void;
  'clipboard:announce': (data: ClipboardPacket) => void;
}

export interface ServerToClientEvents {
  'room:joined': (res: JoinRoomResponse) => void;
  'room:device-list': (data: { devices: DeviceInfo[] }) => void;
  'room:device-added': (data: { device: DeviceInfo }) => void;
  'room:device-removed': (data: { deviceId: string }) => void;
  'room:device-updated': (data: { device: DeviceInfo }) => void;
  'peer:signal': (data: SignalPacket) => void;
  'peer:message': (data: { from: string; message: any }) => void;
  'transfer:relay-chunk': (data: RelayChunkPacket) => void;
  'clipboard:update': (data: ClipboardPacket) => void;
  error: (data: { code: string; message: string }) => void;
}
