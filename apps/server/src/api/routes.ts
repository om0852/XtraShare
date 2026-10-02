import { Router } from 'express';
import { RoomManager } from '../rooms/RoomManager.js';
import { DeviceManager } from '../devices/DeviceManager.js';
import { getLocalNetworkAddresses } from '../utils/network.js';
import { ENV } from '../config/env.js';
import { DEFAULT_ICE_SERVERS } from '@xtrashare/protocol';

export function createApiRouter(roomManager: RoomManager, deviceManager: DeviceManager): Router {
  const router = Router();
  const network = getLocalNetworkAddresses();

  router.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      timestamp: Date.now(),
      uptime: process.uptime(),
      activeRooms: roomManager.getActiveRoomCount(),
      activeDevices: deviceManager.getActiveCount()
    });
  });

  router.get('/config', (_req, res) => {
    res.json({
      protocol: ENV.ENABLE_HTTPS ? 'https' : 'http',
      port: ENV.PORT,
      lanIp: network.lanIp,
      allIps: network.allIps,
      iceServers: DEFAULT_ICE_SERVERS
    });
  });

  router.get('/rooms/:roomId', (req, res) => {
    const roomId = req.params.roomId.toUpperCase().trim();
    const room = roomManager.getRoom(roomId);
    if (!room) {
      res.status(404).json({ error: 'ROOM_NOT_FOUND', exists: false });
      return;
    }

    res.json({
      exists: true,
      roomId: room.roomId,
      deviceCount: room.devices.size,
      createdAt: room.createdAt
    });
  });

  return router;
}
