export const CHUNK_SIZE = 64 * 1024; // 64 KB — universal baseline chunk size
export const IDEAL_CHUNK_SIZE = 128 * 1024; // 128 KB — high-throughput chunk size for capable WebRTC DataChannels
export const FRAME_HEADER_SIZE = 32; // bytes; must match buildBinaryFrame/parseBinaryFrame in transferManager.ts
export const SEND_SIZE_SAFETY_MARGIN = 4096; // bytes of headroom kept below a reported maxMessageSize
export const HIGH_WATER_MARK = 4 * 1024 * 1024;  // 4 MB — safe backpressure threshold (well below Chrome's 16MB hard queue limit)
export const LOW_WATER_MARK = 1024 * 1024;       // 1 MB — low-water mark to resume streaming once drained

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
