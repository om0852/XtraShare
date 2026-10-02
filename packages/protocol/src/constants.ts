export const CHUNK_SIZE = 256 * 1024; // 256 KB — optimal for WebRTC DataChannel on LAN
export const HIGH_WATER_MARK = 2 * 1024 * 1024; // 2 MB high-water mark to trigger backpressure pause
export const LOW_WATER_MARK = 512 * 1024;       // 512 KB low-water mark to resume chunk streaming

export const DEFAULT_PORT = 3000;
export const DEFAULT_ROOM_CODE_LENGTH = 6;
export const MAX_ROOM_DEVICES = 32;

export const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' }
];

export const MAX_RECENT_CLIPBOARDS = 50;
export const MAX_RECENT_TRANSFERS = 100;
