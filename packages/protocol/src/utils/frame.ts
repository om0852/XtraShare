import { FRAME_HEADER_SIZE } from '../constants.js';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export interface ParsedBinaryFrame {
  transferId: string;
  sequence: number;
  totalChunks: number;
  payload: ArrayBuffer;
}

/**
 * Builds a 32-byte binary frame containing:
 * - Bytes 0..15: 16-character transfer ID (ASCII, space-padded if needed)
 * - Bytes 16..19: Sequence number (uint32, big-endian)
 * - Bytes 20..23: Total chunks (uint32, big-endian)
 * - Bytes 24..27: Payload length in bytes (uint32, big-endian)
 * - Bytes 28..31: Reserved / flags (uint32, big-endian, default 0)
 * - Bytes 32+: Raw payload chunk
 */
export function buildBinaryFrame(
  transferId: string,
  sequence: number,
  totalChunks: number,
  payload: ArrayBuffer
): ArrayBuffer {
  const headerSize = FRAME_HEADER_SIZE;
  const packet = new Uint8Array(headerSize + payload.byteLength);
  const view = new DataView(packet.buffer);

  const idBytes = encoder.encode(transferId.padEnd(16, ' ').substring(0, 16));
  packet.set(idBytes, 0);

  view.setUint32(16, sequence, false);
  view.setUint32(20, totalChunks, false);
  view.setUint32(24, payload.byteLength, false);
  view.setUint32(28, 0, false);

  packet.set(new Uint8Array(payload), headerSize);
  return packet.buffer;
}

/**
 * Parses a binary frame received from WebRTC DataChannel.
 * Returns null if buffer is smaller than the 32-byte header.
 */
export function parseBinaryFrame(buffer: ArrayBuffer): ParsedBinaryFrame | null {
  if (buffer.byteLength < FRAME_HEADER_SIZE) {
    return null;
  }

  const view = new DataView(buffer);
  const idBytes = new Uint8Array(buffer, 0, 16);
  const transferId = decoder.decode(idBytes).trim();

  const sequence = view.getUint32(16, false);
  const totalChunks = view.getUint32(20, false);
  const payloadLength = view.getUint32(24, false);

  // Validate payload length bounds to prevent buffer overrun
  const maxSafePayload = buffer.byteLength - FRAME_HEADER_SIZE;
  const safeLength = Math.min(payloadLength, maxSafePayload);
  const payload = buffer.slice(FRAME_HEADER_SIZE, FRAME_HEADER_SIZE + safeLength);

  return {
    transferId,
    sequence,
    totalChunks,
    payload
  };
}
