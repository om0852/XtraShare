export type DeviceType = 'desktop' | 'mobile' | 'tablet' | 'unknown';

export type DevicePlatform =
  | 'Windows'
  | 'macOS'
  | 'Linux'
  | 'iOS'
  | 'Android'
  | 'Unknown';

export type DeviceStatus =
  | 'connecting'
  | 'connected'
  | 'available'
  | 'busy'
  | 'disconnected';

export interface DeviceInfo {
  id: string;
  name: string;
  type: DeviceType;
  platform: DevicePlatform;
  browser: string;
  status: DeviceStatus;
  joinedAt: number;
  isHost?: boolean;
  avatarColor?: string;
}

export interface DeviceRegistration {
  name: string;
  type: DeviceType;
  platform: DevicePlatform;
  browser: string;
  avatarColor?: string;
}
