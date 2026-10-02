export interface ClipboardPacket {
  id: string;
  sourceDeviceId: string;
  sourceDeviceName?: string;
  content: string;
  timestamp: number;
  hash: string;
}

export interface ClipboardItemRecord {
  id: string;
  sourceDeviceId: string;
  sourceDeviceName: string;
  content: string;
  timestamp: number;
  hash: string;
  type: 'received' | 'sent';
}
