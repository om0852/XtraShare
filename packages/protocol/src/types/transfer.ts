export type TransferStatus =
  | 'created'
  | 'offered'
  | 'accepted'
  | 'transferring'
  | 'paused'
  | 'interrupted'
  | 'completed'
  | 'rejected'
  | 'failed'
  | 'cancelled';

export type TransportMode =
  | 'lan-p2p'
  | 'webrtc-p2p'
  | 'turn-relay'
  | 'websocket-relay';

export type TransferType = 'file' | 'text' | 'clipboard';

export interface Transfer {
  id: string;
  senderId: string;
  senderName: string;
  receiverId: string;
  receiverName: string;

  type: TransferType;
  status: TransferStatus;
  transportMode?: TransportMode;

  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  totalChunks?: number;

  bytesTransferred: number;
  speed?: number; // bytes per second
  eta?: number; // estimated seconds remaining

  startedAt?: number;
  completedAt?: number;
  interruptedAt?: number;
  lastSequence?: number;
  error?: string;
  checksum?: string;

  textContent?: string;
}

export type PeerMessageType =
  | 'file-offer'
  | 'file-accept'
  | 'file-reject'
  | 'file-start'
  | 'file-chunk'
  | 'file-ack'
  | 'file-pause'
  | 'file-resume'
  | 'file-resume-check'
  | 'file-complete'
  | 'file-error'
  | 'text'
  | 'clipboard'
  | 'ping'
  | 'pong';

export interface PeerMessage<T = unknown> {
  type: PeerMessageType;
  transferId: string;
  timestamp: number;
  payload: T;
}

export interface FileOfferPayload {
  name: string;
  size: number;
  mimeType: string;
  chunkSize: number;
  totalChunks: number;
  checksum?: string;
}

export interface FileAcceptPayload {
  transferId: string;
}

export interface FileRejectPayload {
  transferId: string;
  reason?: string;
}

export interface FileStartPayload {
  transferId: string;
}

export interface FileResumePayload {
  transferId: string;
  lastReceivedChunk: number;
  lastReceivedOffset: number;
  newReceiverId?: string;
  newReceiverName?: string;
}

export interface FileChunkMetadata {
  transferId: string;
  sequence: number;
  totalChunks: number;
  chunkSize: number;
  byteOffset: number;
}

export interface FileCompletePayload {
  transferId: string;
  totalBytes: number;
  totalChunks: number;
  checksum?: string;
}

export interface FileErrorPayload {
  transferId: string;
  code: string;
  message: string;
}

export interface TextPayload {
  text: string;
}
