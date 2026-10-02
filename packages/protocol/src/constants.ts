export const CHUNK_SIZE = 64 * 1024; // 64 KB per WebRTC message
export const HIGH_WATER_MARK = 1024 * 1024; // 1 MB high-water mark for backpressure
export const LOW_WATER_MARK = 256 * 1024; // 256 KB low-water mark to resume sending

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
