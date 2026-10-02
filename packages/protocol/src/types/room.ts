import { DeviceInfo } from './device.js';

export interface Room {
  roomId: string;
  createdAt: number;
  ownerId: string;
  devices: Record<string, DeviceInfo>;
}

export interface JoinRoomRequest {
  roomId: string;
  device: {
    name: string;
    type: DeviceInfo['type'];
    platform: DeviceInfo['platform'];
    browser: string;
    avatarColor?: string;
  };
}

export interface JoinRoomResponse {
  success: boolean;
  roomId: string;
  selfDevice: DeviceInfo;
  devices: DeviceInfo[];
  error?: string;
}
