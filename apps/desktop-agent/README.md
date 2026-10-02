# @xtrashare/desktop-agent

A lightweight background desktop clipboard watcher for **XtraShare**. It seamlessly connects your Windows, macOS, or Linux system clipboard directly to your XtraShare LAN room.

## Features

- 📋 **Automatic Bidirectional Sync**:
  - Anything copied on your desktop (`Ctrl+C` / `Cmd+C`) is automatically broadcast to your room peers (phones, tablets, laptops).
  - Anything copied on another device is instantly written into your desktop system clipboard.
- ⚡ **Zero Native C++ Compiles**: Uses native OS clipboard utilities (`PowerShell` on Windows, `pbcopy`/`pbpaste` on macOS, `wl-clipboard`/`xclip` on Linux).
- 🔁 **Loop & Duplicate Protection**: Uses SHA-256 fingerprinting to prevent echo loops.
- 🔒 **LAN-First & Secure**: Direct WebSocket connection to your self-hosted or cloud XtraShare server.

## Quick Start

### 1. Build Agent
```bash
npm run build --workspace=@xtrashare/desktop-agent
```

### 2. Start Agent with Room Code
```bash
npm run start --workspace=@xtrashare/desktop-agent -- --room <ROOM_CODE>
```

### CLI Options

| Flag | Description | Default |
|---|---|---|
| `--room <CODE>` | **Required**. 6-digit XtraShare room code | None |
| `--server <URL>` | Signaling server URL | `https://localhost:3000` |
| `--name <NAME>` | Friendly device name | Hostname |
| `--interval <MS>`| Clipboard polling interval in milliseconds | `1000` |
| `--no-auto-copy` | Only broadcast local clipboard, do not overwrite local clipboard from peers | Enabled |

### Examples

**Connect to local LAN server:**
```bash
node apps/desktop-agent/dist/index.js --server https://192.168.1.100:3000 --room B4N9X2
```

**Connect with custom name:**
```bash
node apps/desktop-agent/dist/index.js --room B4N9X2 --name "Office PC"
```
