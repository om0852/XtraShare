<div align="center">

# 🚀 XtraShare

### Privacy-First, LAN-Native Peer-to-Peer Transfer Platform
**AirDrop & LocalSend simplicity across every device: Windows, macOS, Linux, iOS, and Android.**

[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg?logo=typescript)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18.3-cyan.svg?logo=react)](https://react.dev/)
[![Node.js](https://img.shields.io/badge/Node.js-22+-green.svg?logo=node.js)](https://nodejs.org/)
[![WebRTC](https://img.shields.io/badge/WebRTC-DataChannel-orange.svg?logo=webrtc)](https://webrtc.org/)
[![Tailwind CSS](https://img.shields.io/badge/TailwindCSS-3.4-38bdf8.svg?logo=tailwind-css)](https://tailwindcss.com/)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ed.svg?logo=docker)](https://www.docker.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

[Features](#-features) • [Quick Start](#-quick-start) • [Architecture](#-architecture) • [Free Cloud Deployment](#-free-cloud-deployment) • [Desktop Clipboard Agent](#-desktop-clipboard-agent) • [Documentation](#-documentation)

</div>

---

## ✨ Features

| Feature | Scope | Status | Description |
|---|---|---|---|
| **Zero-Cloud P2P Transfer** | MVP | ✅ | Direct device-to-device streaming via WebRTC `RTCDataChannel` |
| **AirDrop-Style Radar View** | MVP | ✅ | Interactive radar visualizer showing active peers with distance pulses |
| **Instant QR Code Pairing** | MVP | ✅ | Point mobile camera to immediately pair phone/tablet to desktop |
| **6-Character Room Codes** | MVP | ✅ | Easy room joining (`ABC-123`) without account creation |
| **High-Speed Chunk Streamer** | MVP | ✅ | 64KB chunking with backpressure watermarks (`waitForDrain`) |
| **RAM Conservation** | MVP | ✅ | Streams multi-gigabyte files via `File.slice()` with zero RAM spikes |
| **Multiple Files & Folders** | V1 | ✅ | Batch multi-file drag-and-drop & native directory picker |
| **Text Sharing Panel** | MVP | ✅ | Send quick URLs, code snippets, notes, and addresses directly |
| **Bidirectional Clipboard Sync**| MVP | ✅ | Real-time clipboard sharing with SHA-256 deduplication |
| **Desktop Clipboard Agent** | V1 | ✅ | Background CLI agent for automatic OS clipboard synchronization |
| **Transfer History & Storage** | V1 | ✅ | Offline transfer logging powered by browser IndexedDB |
| **WebSocket Relay Fallback** | V1 | ✅ | Automatic fallback tunnel for symmetric NAT/firewalled networks |
| **Self-Signed HTTPS on LAN** | MVP | ✅ | Automatic SSL certificate generation for WebRTC camera/clipboard APIs |
| **Progress, Speed & ETA** | MVP | ✅ | Live transfer progress bar, current throughput (MB/s), and ETA |
| **Installable PWA** | MVP | ✅ | Install as native desktop/mobile app with offline cache |

---

## 🏗️ Architecture

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
       │ Laptop A  │        │ Phone A   │        │ Desktop   │
       │ (Browser) │        │ (Mobile)  │        │ (Agent)   │
       └─────┬─────┘        └─────┬─────┘        └─────┬─────┘
             │                    │                    │
             └─────── P2P WebRTC DataChannel ──────────┘
                    (Direct, Encrypted, LAN Speed)
```

---

## ⚡ Quick Start

### Prerequisites
- Node.js >= 20.0.0
- npm >= 10.0.0

### Run Locally in 3 Steps
```bash
# 1. Clone repository & install dependencies
git clone https://github.com/your-username/XtraShare.git
cd XtraShare
npm install

# 2. Build protocol, server, and web client
npm run build

# 3. Start the unified server
npm start
```

Open `https://localhost:3000` on your desktop, and scan the terminal QR code from your phone!

---

## 🐳 Docker & Docker Compose

Deploy with a single command on any server, homelab, or Raspberry Pi:

```bash
# Clone and run via docker-compose
docker compose up -d
```

Or build and run manually:
```bash
docker build -t xtrashare:latest .
docker run -d --name xtrashare -p 3000:3000 -e SSL_ENABLED=true xtrashare:latest
```

---

## ☁️ Free Cloud Deployment

Deploy your personal XtraShare instance with zero cost:

| Platform | Deployment Method | Config File |
|---|---|---|
| **Render** | 1-Click Blueprint (Free Web Service) | [`render.yaml`](./render.yaml) |
| **Railway** | Deploy via GitHub (Docker) | [`railway.json`](./railway.json) |
| **Fly.io** | CLI deploy (`fly launch`) | [`fly.toml`](./fly.toml) |
| **Hugging Face** | Free Docker Space | [`Dockerfile`](./Dockerfile) |

👉 Read the full step-by-step guide in **[docs/deployment.md](docs/deployment.md)**.

---

## 📋 Desktop Clipboard Agent

XtraShare includes an optional background desktop watcher (`@xtrashare/desktop-agent`) that connects directly to your XtraShare room:

- Anything you copy on your computer (`Ctrl+C` / `Cmd+C`) is automatically pushed to your connected devices.
- Anything you copy on your phone is automatically written to your computer's clipboard.

### Usage
```bash
# Run agent and join your room code
npm run start --workspace=@xtrashare/desktop-agent -- --room ABC123
```
👉 Read details in **[apps/desktop-agent/README.md](apps/desktop-agent/README.md)**.

---

## 📚 Documentation

- 📜 [AI Development Rules](docs/AI_RULES.md)
- 📐 [System Architecture](docs/architecture.md)
- 🔌 [Wire Protocol Specification](docs/protocol.md)
- 🧠 [Low-Level Design (LLD)](docs/low-level-design.md)
- 🚀 [Free Hosting & Deployment Guide](docs/deployment.md)

---

## 📄 License

MIT © XtraShare Open Source Contributors
