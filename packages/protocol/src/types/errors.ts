export type ErrorCode =
  | 'ROOM_NOT_FOUND'
  | 'ROOM_FULL'
  | 'DEVICE_NOT_FOUND'
  | 'UNAUTHORIZED'
  | 'PEER_OFFLINE'
  | 'WEBRTC_FAILED'
  | 'ICE_FAILED'
  | 'DATA_CHANNEL_FAILED'
  | 'TRANSFER_REJECTED'
  | 'TRANSFER_CANCELLED'
  | 'CHECKSUM_MISMATCH'
  | 'FILE_TOO_LARGE'
  | 'UNSUPPORTED_BROWSER'
  | 'CLIPBOARD_PERMISSION_DENIED'
  | 'RELAY_UNAVAILABLE'
  | 'NETWORK_ERROR'
  | 'INTERNAL_ERROR';

export interface AppError {
  code: ErrorCode;
  message: string;
  details?: unknown;
}

export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  ROOM_NOT_FOUND: 'Room code not found or expired. Please check and try again.',
  ROOM_FULL: 'This transfer room has reached maximum peer capacity.',
  DEVICE_NOT_FOUND: 'The target device is no longer reachable.',
  UNAUTHORIZED: 'Action unauthorized or session expired.',
  PEER_OFFLINE: 'Target peer disconnected or went offline.',
  WEBRTC_FAILED: 'Direct WebRTC connection failed to establish.',
  ICE_FAILED: 'Network NAT traversal (ICE) could not find a connection route.',
  DATA_CHANNEL_FAILED: 'RTCDataChannel closed unexpectedly.',
  TRANSFER_REJECTED: 'The recipient declined this file transfer.',
  TRANSFER_CANCELLED: 'The transfer was cancelled.',
  CHECKSUM_MISMATCH: 'File integrity check failed (SHA-256 mismatch).',
  FILE_TOO_LARGE: 'File exceeds maximum supported transfer limit.',
  UNSUPPORTED_BROWSER: 'Your browser lacks WebRTC or modern crypto support.',
  CLIPBOARD_PERMISSION_DENIED: 'Clipboard access was not granted by your browser.',
  RELAY_UNAVAILABLE: 'Signaling relay fallback is currently unreachable.',
  NETWORK_ERROR: 'Network connectivity lost.',
  INTERNAL_ERROR: 'An unexpected internal error occurred.'
};
