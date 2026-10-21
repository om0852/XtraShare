import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';
import { AddressInfo } from 'net';
import { Server as SocketIOServer } from 'socket.io';
import { io as ClientSocket, Socket as ClientSocketType } from 'socket.io-client';
import {
  ClientToServerEvents,
  ServerToClientEvents,
  DeviceRegistration,
  SignalPacket,
  RelayChunkPacket
} from '@xtrashare/protocol';
import { RoomManager } from '../rooms/RoomManager.js';
import { DeviceManager } from '../devices/DeviceManager.js';
import { SignalingService } from './SignalingService.js';

describe('Multi-Device Connected Signaling & Routing Tests', () => {
  let server: http.Server;
  let ioServer: SocketIOServer<ClientToServerEvents, ServerToClientEvents>;
  let serverUrl: string;

  let clientA: ClientSocketType<ServerToClientEvents, ClientToServerEvents>;
  let clientB: ClientSocketType<ServerToClientEvents, ClientToServerEvents>;
  let clientC: ClientSocketType<ServerToClientEvents, ClientToServerEvents>;

  let deviceIdA = '';
  let deviceIdB = '';
  let deviceIdC = '';
  let testRoomId = '';

  const regA: DeviceRegistration = {
    name: "Om's Desktop",
    type: 'desktop',
    platform: 'Windows',
    browser: 'Chrome'
  };

  const regB: DeviceRegistration = {
    name: "Om's iPhone",
    type: 'mobile',
    platform: 'iOS',
    browser: 'Safari'
  };

  const regC: DeviceRegistration = {
    name: "Om's Android Tablet",
    type: 'tablet',
    platform: 'Android',
    browser: 'Chrome'
  };

  before(async () => {
    server = http.createServer();
    ioServer = new SocketIOServer<ClientToServerEvents, ServerToClientEvents>(server, {
      cors: { origin: '*' }
    });

    const roomManager = new RoomManager();
    const deviceManager = new DeviceManager();
    new SignalingService(ioServer, roomManager, deviceManager);

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const address = server.address() as AddressInfo;
        serverUrl = `http://127.0.0.1:${address.port}`;
        resolve();
      });
    });
  });

  after(async () => {
    if (clientA) clientA.disconnect();
    if (clientB) clientB.disconnect();
    if (clientC) clientC.disconnect();
    ioServer.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('should allow 3 devices to connect and join the same room with presence discovery', async () => {
    // 1. Connect Client A and create room
    clientA = ClientSocket(serverUrl, { transports: ['websocket'] });
    await new Promise<void>((resolve) => clientA.on('connect', resolve));

    const createRes = await new Promise<any>((resolve) => {
      clientA.emit('room:create', regA, (res) => resolve(res));
    });

    assert.equal(createRes.success, true);
    assert.ok(createRes.roomId);
    testRoomId = createRes.roomId;
    deviceIdA = createRes.selfDevice.id;
    assert.equal(createRes.devices.length, 1);

    // 2. Connect Client B and join room
    clientB = ClientSocket(serverUrl, { transports: ['websocket'] });
    await new Promise<void>((resolve) => clientB.on('connect', resolve));

    const joinBRes = await new Promise<any>((resolve) => {
      clientB.emit('room:join', { roomId: testRoomId, device: regB }, (res) => resolve(res));
    });

    assert.equal(joinBRes.success, true);
    deviceIdB = joinBRes.selfDevice.id;
    assert.equal(joinBRes.devices.length, 2);

    // 3. Connect Client C and join room
    clientC = ClientSocket(serverUrl, { transports: ['websocket'] });
    await new Promise<void>((resolve) => clientC.on('connect', resolve));

    const joinCRes = await new Promise<any>((resolve) => {
      clientC.emit('room:join', { roomId: testRoomId, device: regC }, (res) => resolve(res));
    });

    assert.equal(joinCRes.success, true);
    deviceIdC = joinCRes.selfDevice.id;
    assert.equal(joinCRes.devices.length, 3);
  });

  it('should route WebRTC peer signals strictly to the intended target device without leakage', async () => {
    const testSignal: SignalPacket = {
      type: 'offer',
      from: '',
      to: deviceIdC,
      payload: { type: 'offer', sdp: 'v=0 dummy_offer_sdp' }
    };

    let clientCReceivedSignal: SignalPacket | null = null;
    let clientALeakSignal: SignalPacket | null = null;

    (clientC as any).once('peer:signal', (packet: SignalPacket) => {
      clientCReceivedSignal = packet;
    });

    (clientA as any).once('peer:signal', (packet: SignalPacket) => {
      clientALeakSignal = packet;
    });

    // Client B sends signal targeting Client C
    clientB.emit('peer:signal', testSignal);

    // Wait 100ms for routing
    await new Promise((r) => setTimeout(r, 100));

    assert.ok(clientCReceivedSignal, 'Target device C should receive the signal');
    assert.equal((clientCReceivedSignal as SignalPacket).from, deviceIdB);
    assert.equal((clientCReceivedSignal as SignalPacket).to, deviceIdC);
    assert.equal(clientALeakSignal, null, 'Untargeted device A must NOT receive the signal');
  });

  it('should route direct peer control messages strictly to the target peer', async () => {
    const transferId = 'tr_multidev_1234';
    let clientBReceivedMsg: any = null;
    let clientCLeakMsg: any = null;

    (clientB as any).once('peer:message', ({ from, message }: any) => {
      clientBReceivedMsg = { from, message };
    });

    (clientC as any).once('peer:message', ({ from, message }: any) => {
      clientCLeakMsg = { from, message };
    });

    // Client A sends file-offer specifically to Client B
    clientA.emit('peer:message', {
      to: deviceIdB,
      message: {
        type: 'file-offer',
        transferId,
        timestamp: Date.now(),
        payload: {
          name: 'project_spec.pdf',
          size: 1048576,
          mimeType: 'application/pdf',
          chunkSize: 65536,
          totalChunks: 16
        }
      }
    });

    await new Promise((r) => setTimeout(r, 100));

    assert.ok(clientBReceivedMsg, 'Target peer B must receive the control message');
    assert.equal(clientBReceivedMsg.from, deviceIdA);
    assert.equal(clientBReceivedMsg.message.transferId, transferId);
    assert.equal(clientBReceivedMsg.message.payload.name, 'project_spec.pdf');
    assert.equal(clientCLeakMsg, null, 'Untargeted peer C must not receive the control message');
  });

  it('should route binary relay chunks isolated to the target peer', async () => {
    const rawChunkData = new Uint8Array([10, 20, 30, 40, 50, 60]).buffer as ArrayBuffer;
    const relayPacket: RelayChunkPacket = {
      from: '',
      to: deviceIdB,
      transferId: 'tr_chunk_test123',
      sequence: 0,
      totalChunks: 1,
      data: rawChunkData
    };

    let clientBReceivedChunk: RelayChunkPacket | null = null;
    let clientCLeakChunk: RelayChunkPacket | null = null;

    (clientB as any).once('transfer:relay-chunk', (chunk: RelayChunkPacket) => {
      clientBReceivedChunk = chunk;
    });

    (clientC as any).once('transfer:relay-chunk', (chunk: RelayChunkPacket) => {
      clientCLeakChunk = chunk;
    });

    // Client A sends relay chunk targeting Client B
    clientA.emit('transfer:relay-chunk', relayPacket);

    await new Promise((r) => setTimeout(r, 100));

    assert.ok(clientBReceivedChunk, 'Client B should receive the relay chunk');
    assert.equal((clientBReceivedChunk as RelayChunkPacket).from, deviceIdA);
    assert.equal((clientBReceivedChunk as RelayChunkPacket).transferId, 'tr_chunk_test123');
    assert.equal(clientCLeakChunk, null, 'Client C must not receive chunks intended for Client B');
  });

  it('should maintain communication between remaining devices when one device disconnects', async () => {
    let clientANotifiedOfRemoval = false;
    let clientCNotifiedOfRemoval = false;

    (clientA as any).once('room:device-removed', ({ deviceId }: any) => {
      if (deviceId === deviceIdB) clientANotifiedOfRemoval = true;
    });

    (clientC as any).once('room:device-removed', ({ deviceId }: any) => {
      if (deviceId === deviceIdB) clientCNotifiedOfRemoval = true;
    });

    // Disconnect Client B
    clientB.disconnect();

    await new Promise((r) => setTimeout(r, 150));

    assert.equal(clientANotifiedOfRemoval, true, 'Client A should be notified that Client B left');
    assert.equal(clientCNotifiedOfRemoval, true, 'Client C should be notified that Client B left');

    // Verify Client A and Client C can still communicate seamlessly
    let clientCReceivedMessageFromA = false;
    clientC.once('peer:message', ({ from }) => {
      if (from === deviceIdA) clientCReceivedMessageFromA = true;
    });

    clientA.emit('peer:message', {
      to: deviceIdC,
      message: {
        type: 'text',
        transferId: 'msg_after_leave',
        timestamp: Date.now(),
        payload: { text: 'Are you still connected?' }
      }
    });

    await new Promise((r) => setTimeout(r, 100));
    assert.equal(clientCReceivedMessageFromA, true, 'Client A and C must continue communicating normally');
  });
});
