# XtraShare Architecture & System Design

A privacy-first, self-hosted, LAN-based cross-device transfer platform that enables direct peer-to-peer file, text, and clipboard sharing through a modern web interface with WebRTC DataChannels, QR pairing, and fallback relay.

## 1. High-Level Architecture

```
                    ┌──────────────────────────────┐
                    │        LAN / Wi-Fi           │
                    │                              │
                    │  Laptop / Host Machine       │
                    │                              │
                    │  ┌────────────────────────┐  │
                    │  │ Node.js Signaling       │  │
                    │  │ Server (Port 3000)      │  │
                    │  │ Express + Socket.IO     │  │
                    │  │ Room & Device Registry  │  │
                    │  │ HTTPS + LAN IP Host     │  │
                    │  └───────────┬────────────┘  │
                    │              │               │
                    └──────────────┼───────────────┘
                                   │
                    Signaling only │ (SDP Offer/Answer & ICE Candidates)
                                   │
             ┌─────────────────────┼─────────────────────┐
             │                     │                     │
             ▼                     ▼                     ▼
       ┌───────────┐        ┌───────────┐        ┌───────────┐
       │ Laptop A  │        │ Phone A   │        │ Phone B   │
       │ React PWA │◄──────►│ React PWA │◄──────►│ React PWA │
       │ WebRTC    │WebRTC  │ WebRTC    │WebRTC  │ WebRTC    │
       │ DataChan  │Direct  │ DataChan  │Direct  │ DataChan  │
       └───────────┘        └───────────┘        └───────────┘
```

## 2. Three-Layer Separation

1. **UI Layer (`apps/web/src/components` & `pages`)**:
   - React components, Tailwind styling, AirDrop-like radar view, drag-and-drop dropzone, transfer modals.
   - Strictly reactive to Zustand stores.

2. **Application Layer (`apps/web/src/features` & `managers`)**:
   - `DeviceManager`: Device list, status lifecycle, self device info.
   - `TransferManager`: ChunkStreamer, chunk receiver, IndexedDB staging, backpressure regulation, SHA-256 integrity, progress computation.
   - `ClipboardManager`: Read/write clipboard, history, hash deduplication loop-prevention.
   - `RoomManager`: Room code, QR generation, join/leave actions.

3. **Transport Layer (`apps/web/src/services`)**:
   - `SignalingClient`: Socket.IO client handling `room:*` and `peer:*` events.
   - `PeerConnectionManager`: Manages RTCPeerConnections, ICE candidates, and RTCDataChannels.
   - `WebSocketRelay`: Fallback transport when WebRTC ICE direct connection fails.

## 3. Directory Layout (Monorepo)

- `packages/protocol`: Shared TypeScript types, interfaces, packet schemas, error codes, and transfer constants.
- `apps/server`: Express, Socket.IO, HTTPS self-signed cert manager, local network interface discovery, QR generator on CLI, fallback relay.
- `apps/web`: React 18, Vite, Tailwind CSS, Lucide icons, Zustand, IndexedDB (`idb-keyval` / custom IDB), PWA manifest.
- `apps/desktop`: Optional Electron agent for global background OS clipboard synchronization.
