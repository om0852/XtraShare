# XtraShare Wire Protocol Specification

Version: `1.0.0`  
Standard: `@xtrashare/protocol`

The XtraShare wire protocol defines client-to-server signaling (via Socket.IO) and peer-to-peer data transport (via WebRTC RTCDataChannel or fallback WebSocket relay).

---

## 1. Network Topologies

1. **Signaling Channel (Socket.IO over TLS/WSS)**:
   - Responsible for room registration, device presence broadcasts, and WebRTC SDP Offer/Answer/ICE candidate exchange.
   - Also relays clipboard announcements and fallback data when WebRTC cannot be established between strict symmetric NATs.

2. **Data Channel (WebRTC RTCDataChannel)**:
   - Directly connects two devices over local LAN or STUN/TURN.
   - Ordered, binary-streamed frames using 64KB chunks (`CHUNK_SIZE = 65536`).
   - Managed with backpressure watermarks (`HIGH_WATER_MARK = 1MB`, `LOW_WATER_MARK = 256KB`).

---

## 2. Binary Frame Layout (RTCDataChannel)

When streaming file chunks over `RTCDataChannel`, each packet begins with a fixed **32-byte binary header** followed immediately by the raw chunk payload:

```
 0                   1                   2                   3
 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                                                               |
|                   Transfer ID (16 bytes ASCII)                |
|                                                               |
|                                                               |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                   Sequence Number (uint32, BE)                |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                   Total Chunks (uint32, BE)                   |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                   Payload Length in Bytes (uint32, BE)        |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                   Reserved (uint32, BE, 0x00000000)           |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                                                               |
|                       Binary Chunk Data                       |
|                       (Variable Length)                       |
|                                                               |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
```

### Fields:
- **Transfer ID** (Bytes 0-15): 16-byte fixed-width ASCII string uniquely identifying the transfer session.
- **Sequence Number** (Bytes 16-19): 0-indexed 32-bit unsigned integer in big-endian order representing the chunk sequence.
- **Total Chunks** (Bytes 20-23): 32-bit unsigned integer total number of chunks.
- **Payload Length** (Bytes 24-27): 32-bit unsigned integer byte length of the chunk payload.
- **Reserved** (Bytes 28-31): Reserved for checksum or encryption flags (default `0`).
- **Payload** (Bytes 32+): Raw file bytes sliced with `File.slice(start, end)`.

---

## 3. WebRTC Peer Control Messages

Text and control signals sent over RTCDataChannel are serialized as JSON:

```typescript
export interface PeerMessage {
  type: 'file-offer' | 'file-accept' | 'file-reject' | 'file-complete' | 'file-error' | 'text';
  transferId: string;
  timestamp: number;
  payload: any;
}
```

### 3.1 `file-offer`
Sent by the sender when initiating a transfer:
```json
{
  "type": "file-offer",
  "transferId": "tr_1727829102_a3f8",
  "timestamp": 1727829102450,
  "payload": {
    "name": "vacation_video.mp4",
    "size": 104857600,
    "mimeType": "video/mp4",
    "chunkSize": 65536,
    "totalChunks": 1600
  }
}
```

### 3.2 `file-accept`
Sent by the recipient after user approval:
```json
{
  "type": "file-accept",
  "transferId": "tr_1727829102_a3f8",
  "timestamp": 1727829103100,
  "payload": { "transferId": "tr_1727829102_a3f8" }
}
```

### 3.3 `file-complete`
Sent by sender after transmitting all chunks:
```json
{
  "type": "file-complete",
  "transferId": "tr_1727829102_a3f8",
  "timestamp": 1727829105200,
  "payload": { "transferId": "tr_1727829102_a3f8", "totalBytes": 104857600, "totalChunks": 1600 }
}
```

---

## 4. Socket.IO Signaling Events

### Client -> Server Events:
| Event | Payload | Response Callback |
|---|---|---|
| `room:create` | `DeviceRegistration` | `{ success, roomId, selfDevice, devices, error? }` |
| `room:join` | `{ roomId, device: DeviceRegistration }` | `{ success, roomId, selfDevice, devices, error? }` |
| `room:leave` | `{ roomId }` | None |
| `peer:signal` | `SignalPacket` (offer/answer/ice) | None (forwarded to peer) |
| `transfer:relay-chunk` | `RelayChunkPacket` | None (forwarded to peer) |
| `clipboard:announce` | `ClipboardPacket` | None (broadcast to room peers) |
| `device:update` | `Partial<DeviceInfo>` | None (broadcast to room peers) |

### Server -> Client Events:
| Event | Payload | Description |
|---|---|---|
| `room:device-added` | `{ device: DeviceInfo }` | A new device joined the room |
| `room:device-removed` | `{ deviceId: string }` | A device disconnected or left |
| `room:device-updated` | `{ device: DeviceInfo }` | Device status/name updated |
| `peer:signal` | `SignalPacket` | Incoming WebRTC SDP or ICE candidate |
| `transfer:relay-chunk` | `RelayChunkPacket` | Fallback chunk stream |
| `clipboard:update` | `ClipboardPacket` | New clipboard item received from a peer |
| `error` | `{ code: ErrorCode, message: string }` | Server error notification |
