#!/usr/bin/env node
import { io, Socket } from 'socket.io-client';
import crypto from 'node:crypto';
import os from 'node:os';
import {
  ClientToServerEvents,
  ServerToClientEvents,
  ClipboardPacket,
  DeviceInfo
} from '@xtrashare/protocol';
import { readSystemClipboard, writeSystemClipboard } from './clipboard.js';

// Ignore self-signed TLS certificates for local LAN HTTPS
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

// Command-line argument parser
const args = process.argv.slice(2);
function getArg(flag: string, fallback: string): string {
  const index = args.indexOf(flag);
  if (index !== -1 && index + 1 < args.length) {
    return args[index + 1]!;
  }
  return fallback;
}

const serverUrl = getArg('--server', process.env.XTRASHARE_SERVER || 'https://localhost:3000');
const targetRoom = getArg('--room', process.env.XTRASHARE_ROOM || '').toUpperCase();
const agentName = getArg('--name', `${os.hostname()} (Clipboard Agent)`);
const pollIntervalMs = parseInt(getArg('--interval', '1000'), 10);
const autoCopy = !args.includes('--no-auto-copy');

if (!targetRoom) {
  console.error('\n❌ Error: Room code is required!');
  console.log('\nUsage:');
  console.log('  xtrashare-agent --room <ROOM_CODE> [--server <URL>] [--name <NAME>] [--interval <MS>]\n');
  console.log('Examples:');
  console.log('  npm run start --workspace=@xtrashare/desktop-agent -- --room X7K9P2');
  console.log('  xtrashare-agent --server https://192.168.1.100:3000 --room ABC123\n');
  process.exit(1);
}

function computeHash(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex').substring(0, 16);
}

console.log('======================================================');
console.log('   📋  XTRASHARE DESKTOP CLIPBOARD AGENT');
console.log('======================================================');
console.log(`📡 Connecting to:  ${serverUrl}`);
console.log(`🔑 Target Room:    ${targetRoom}`);
console.log(`💻 Device Name:    ${agentName}`);
console.log(`⏱️  Poll Interval:  ${pollIntervalMs}ms`);
console.log(`📥 Auto-apply:     ${autoCopy ? 'Enabled' : 'Disabled'}`);
console.log('------------------------------------------------------\n');

let selfDeviceId = '';
let lastKnownHash = '';
let isUpdatingLocally = false;

const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(serverUrl, {
  transports: ['websocket', 'polling'],
  rejectUnauthorized: false
});

socket.on('connect', () => {
  console.log(`[${new Date().toLocaleTimeString()}] 🟢 Connected to signaling server`);

  // Register device and join room
  socket.emit(
    'room:join',
    {
      roomId: targetRoom,
      device: {
        name: agentName,
        type: 'desktop',
        platform: os.platform() === 'win32' ? 'Windows' : os.platform() === 'darwin' ? 'macOS' : 'Linux',
        browser: 'Node.js Agent',
        avatarColor: '#10b981'
      }
    },
    (res) => {
      if (res.success) {
        selfDeviceId = res.selfDevice.id;
        console.log(`[${new Date().toLocaleTimeString()}] ✅ Joined room: ${targetRoom}`);
        console.log(`[${new Date().toLocaleTimeString()}] 👥 Active peers: ${res.devices.length}`);
        res.devices.forEach((d: DeviceInfo) => {
          if (d.id !== res.selfDevice.id) {
            console.log(`   - ${d.name} (${d.platform}, ${d.type})`);
          }
        });
        console.log(`\n🚀 Watching system clipboard for changes...\n`);
        startClipboardWatcher();
      } else {
        console.error(`[${new Date().toLocaleTimeString()}] ❌ Failed to join room: ${res.error}`);
        process.exit(1);
      }
    }
  );
});

socket.on('room:device-added', ({ device }: { device: DeviceInfo }) => {
  console.log(`[${new Date().toLocaleTimeString()}] ➕ Peer connected: ${device.name} (${device.platform})`);
});

socket.on('room:device-removed', ({ deviceId }: { deviceId: string }) => {
  console.log(`[${new Date().toLocaleTimeString()}] ➖ Peer disconnected: ${deviceId}`);
});

// Incoming clipboard updates from mobile, web, or other agents
socket.on('clipboard:update', async (packet: ClipboardPacket) => {
  if (packet.hash === lastKnownHash) return;

  lastKnownHash = packet.hash;
  console.log(`\n[${new Date().toLocaleTimeString()}] 📥 Received clipboard from "${packet.sourceDeviceName || 'Peer'}":`);
  const preview = packet.content.length > 60 ? packet.content.substring(0, 57) + '...' : packet.content;
  console.log(`   "${preview}" (${packet.content.length} chars)`);

  if (autoCopy) {
    isUpdatingLocally = true;
    const ok = await writeSystemClipboard(packet.content);
    if (ok) {
      console.log(`   ✨ Copied to local system clipboard!`);
    } else {
      console.warn(`   ⚠️ Could not write to system clipboard.`);
    }
    // Briefly delay before re-reading to prevent echo loop
    setTimeout(() => {
      isUpdatingLocally = false;
    }, 800);
  }
});

socket.on('connect_error', (err) => {
  console.error(`[${new Date().toLocaleTimeString()}] 🔴 Connection error:`, err.message);
});

socket.on('disconnect', () => {
  console.log(`[${new Date().toLocaleTimeString()}] 🟡 Disconnected from server. Reconnecting...`);
});

// Clipboard polling loop
async function startClipboardWatcher() {
  // Read initial content so we don't spam on startup
  const initial = await readSystemClipboard();
  if (initial) {
    lastKnownHash = computeHash(initial);
  }

  setInterval(async () => {
    if (isUpdatingLocally || !socket.connected) return;

    try {
      const current = await readSystemClipboard();
      if (!current || current.trim().length === 0) return;

      const hash = computeHash(current);
      if (hash !== lastKnownHash) {
        lastKnownHash = hash;
        const preview = current.length > 60 ? current.substring(0, 57) + '...' : current;
        console.log(`\n[${new Date().toLocaleTimeString()}] 📋 Local copy detected:`);
        console.log(`   "${preview}" (${current.length} chars)`);
        console.log(`   📤 Broadcasting to room ${targetRoom}...`);

        const packet: ClipboardPacket = {
          id: `clip_${Date.now().toString(36)}`,
          sourceDeviceId: selfDeviceId,
          sourceDeviceName: agentName,
          content: current,
          hash,
          timestamp: Date.now()
        };

        socket.emit('clipboard:announce', packet);
      }
    } catch (err) {
      // Quiet fail on temporary lock
    }
  }, pollIntervalMs);
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nStopping XtraShare Clipboard Agent...');
  socket.disconnect();
  process.exit(0);
});
