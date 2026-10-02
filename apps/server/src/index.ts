import express from 'express';
import http from 'http';
import https from 'https';
import path from 'path';
import fs from 'fs';
import cors from 'cors';
import { Server as SocketIOServer } from 'socket.io';
import qrcode from 'qrcode-terminal';
import { ENV } from './config/env.js';
import { getLocalNetworkAddresses } from './utils/network.js';
import { getOrCreateSslCredentials } from './utils/ssl.js';
import { RoomManager } from './rooms/RoomManager.js';
import { DeviceManager } from './devices/DeviceManager.js';
import { SignalingService } from './signaling/SignalingService.js';
import { createApiRouter } from './api/routes.js';
import { ClientToServerEvents, ServerToClientEvents } from '@xtrashare/protocol';

async function bootstrap() {
  const app = express();
  app.use(cors({ origin: '*' }));
  app.use(express.json());

  const roomManager = new RoomManager();
  const deviceManager = new DeviceManager();

  // API Routes
  app.use('/api', createApiRouter(roomManager, deviceManager));

  // Serve Frontend Production build if exists
  const candidatePaths = [
    path.resolve(process.cwd(), '../web/dist'),
    path.resolve(process.cwd(), 'apps/web/dist'),
    path.resolve(process.cwd(), 'public'),
    path.resolve(process.cwd(), 'dist/public')
  ];

  const staticDir = candidatePaths.find((p) => fs.existsSync(p)) || null;

  if (staticDir) {
    app.use(express.static(staticDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(staticDir, 'index.html'));
    });
  } else {
    app.get('/', (_req, res) => {
      res.send(`
        <html>
          <body style="font-family: system-ui; background: #0f172a; color: #f8fafc; padding: 2rem;">
            <h1>🚀 XtraShare Signaling Server</h1>
            <p>Server is active. Start the frontend via <code>npm run dev:web</code> or run production build.</p>
            <p>API Health: <a style="color: #38bdf8;" href="/api/health">/api/health</a></p>
          </body>
        </html>
      `);
    });
  }

  // Create HTTP or HTTPS server
  let server: http.Server | https.Server;
  let protocol = 'http';

  if (ENV.ENABLE_HTTPS) {
    try {
      const credentials = getOrCreateSslCredentials();
      server = https.createServer(credentials, app);
      protocol = 'https';
    } catch (err) {
      console.warn('⚠️ Could not initialize HTTPS credentials, falling back to HTTP:', err);
      server = http.createServer(app);
      protocol = 'http';
    }
  } else {
    server = http.createServer(app);
  }

  // Attach Socket.IO
  const io = new SocketIOServer<ClientToServerEvents, ServerToClientEvents>(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST']
    },
    transports: ['websocket', 'polling'],
    maxHttpBufferSize: 2e7 // 20MB — handles 256KB chunks with room for framing overhead
  });

  // Attach Signaling Service
  new SignalingService(io, roomManager, deviceManager);

  // Start listening
  server.listen(ENV.PORT, ENV.HOST, () => {
    const { lanIp } = getLocalNetworkAddresses();
    const localUrl = `${protocol}://localhost:${ENV.PORT}`;
    const lanUrl = `${protocol}://${lanIp}:${ENV.PORT}`;

    console.log('\n======================================================');
    console.log('   🚀  XTRASHARE - P2P LAN FILE & CLIPBOARD TRANSFER');
    console.log('======================================================');
    console.log(`📡 Local:        ${localUrl}`);
    console.log(`🌐 LAN Network:  ${lanUrl}`);
    console.log(`🔒 Protocol:     ${protocol.toUpperCase()}`);
    console.log('------------------------------------------------------');
    console.log('📱 Scan QR to open on Phone / Tablet:\n');

    qrcode.generate(lanUrl, { small: true }, (qr) => {
      console.log(qr);
      console.log('------------------------------------------------------');
      console.log('Ready for peer connections...\n');
    });
  });
}

bootstrap().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
