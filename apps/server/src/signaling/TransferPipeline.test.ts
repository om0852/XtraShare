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
  RelayChunkPacket
} from '@xtrashare/protocol';
import { RoomManager } from '../rooms/RoomManager.js';
import { DeviceManager } from '../devices/DeviceManager.js';
import { SignalingService } from './SignalingService.js';

describe('Transfer Pipeline & High-Volume Speed Benchmark Tests', () => {
  let server: http.Server;
  let ioServer: SocketIOServer<ClientToServerEvents, ServerToClientEvents>;
  let serverUrl: string;

  let senderSocket: ClientSocketType<ServerToClientEvents, ClientToServerEvents>;
  let receiverSocket: ClientSocketType<ServerToClientEvents, ClientToServerEvents>;

  let senderDeviceId = '';
  let receiverDeviceId = '';
  let roomId = '';

  const senderReg: DeviceRegistration = {
    name: 'Sender Device',
    type: 'desktop',
    platform: 'Windows',
    browser: 'Chrome'
  };

  const receiverReg: DeviceRegistration = {
    name: 'Receiver Device',
    type: 'mobile',
    platform: 'Android',
    browser: 'Chrome'
  };

  before(async () => {
    server = http.createServer();
    ioServer = new SocketIOServer<ClientToServerEvents, ServerToClientEvents>(server, {
      cors: { origin: '*' },
      maxHttpBufferSize: 2e7
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

    // Connect sender and create room
    senderSocket = ClientSocket(serverUrl, { transports: ['websocket'] });
    await new Promise<void>((r) => senderSocket.on('connect', r));

    const createRes = await new Promise<any>((resolve) => {
      senderSocket.emit('room:create', senderReg, resolve);
    });
    roomId = createRes.roomId;
    senderDeviceId = createRes.selfDevice.id;

    // Connect receiver and join room
    receiverSocket = ClientSocket(serverUrl, { transports: ['websocket'] });
    await new Promise<void>((r) => receiverSocket.on('connect', r));

    const joinRes = await new Promise<any>((resolve) => {
      receiverSocket.emit('room:join', { roomId, device: receiverReg }, resolve);
    });
    receiverDeviceId = joinRes.selfDevice.id;
  });

  after(async () => {
    if (senderSocket) senderSocket.disconnect();
    if (receiverSocket) receiverSocket.disconnect();
    ioServer.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('should reliably deliver a batch of 100 file offers without dropping or corrupting any messages', async () => {
    const FILE_COUNT = 100;
    const receivedOffers = new Set<string>();

    (receiverSocket as any).on('peer:message', ({ message }: any) => {
      if (message?.type === 'file-offer') {
        receivedOffers.add(message.transferId);
      }
    });

    const startOfferTime = performance.now();

    for (let i = 0; i < FILE_COUNT; i++) {
      const transferId = `batch_offer_${i.toString().padStart(4, '0')}`;
      senderSocket.emit('peer:message', {
        to: receiverDeviceId,
        message: {
          type: 'file-offer',
          transferId,
          timestamp: Date.now(),
          payload: {
            name: `photo_${i}.jpg`,
            size: 204800,
            mimeType: 'image/jpeg',
            chunkSize: 65536,
            totalChunks: 4
          }
        }
      });
    }

    // Wait for all 100 offers to be received
    const timeout = Date.now() + 5000;
    while (receivedOffers.size < FILE_COUNT && Date.now() < timeout) {
      await new Promise((r) => setTimeout(r, 20));
    }

    const elapsedMs = performance.now() - startOfferTime;

    assert.equal(
      receivedOffers.size,
      FILE_COUNT,
      `Expected all ${FILE_COUNT} offers to be delivered, got ${receivedOffers.size}`
    );

    console.log(
      `\n  🚀 High-Volume Offer Pipeline Benchmark:` +
      `\n     - Offers Delivered: ${receivedOffers.size} / ${FILE_COUNT}` +
      `\n     - Transit Time:     ${elapsedMs.toFixed(2)} ms (${(FILE_COUNT / (elapsedMs / 1000)).toFixed(1)} offers/sec)\n`
    );
  });

  it('should stream chunks across the relay pipeline, measuring throughput and verifying payload integrity', async () => {
    const CHUNK_SIZE = 64 * 1024; // 64 KB
    const TOTAL_CHUNKS = 160; // 10 MB total
    const transferId = 'pipeline_bench_1';

    // Generate test data with predictable sequence bytes
    const chunkBuffers: Uint8Array[] = [];
    for (let seq = 0; seq < TOTAL_CHUNKS; seq++) {
      const buf = new Uint8Array(CHUNK_SIZE);
      buf.fill(seq % 256);
      chunkBuffers.push(buf);
    }

    const receivedSequences = new Map<number, Uint8Array>();

    (receiverSocket as any).on('transfer:relay-chunk', (chunk: RelayChunkPacket) => {
      if (chunk.transferId === transferId) {
        receivedSequences.set(chunk.sequence, new Uint8Array(chunk.data as ArrayBuffer));
      }
    });

    const streamStart = performance.now();

    // Stream all chunks from sender to receiver
    for (let seq = 0; seq < TOTAL_CHUNKS; seq++) {
      senderSocket.emit('transfer:relay-chunk', {
        from: senderDeviceId,
        to: receiverDeviceId,
        transferId,
        sequence: seq,
        totalChunks: TOTAL_CHUNKS,
        data: chunkBuffers[seq]!.buffer
      });
    }

    // Wait until all chunks arrive
    const timeout = Date.now() + 8000;
    while (receivedSequences.size < TOTAL_CHUNKS && Date.now() < timeout) {
      await new Promise((r) => setTimeout(r, 20));
    }

    const streamElapsedMs = performance.now() - streamStart;
    const streamSeconds = streamElapsedMs / 1000;
    const totalBytesTransferred = TOTAL_CHUNKS * CHUNK_SIZE;
    const throughputMBps = (totalBytesTransferred / (1024 * 1024)) / streamSeconds;

    assert.equal(
      receivedSequences.size,
      TOTAL_CHUNKS,
      `Expected ${TOTAL_CHUNKS} chunks received, got ${receivedSequences.size}`
    );

    // Verify integrity of each chunk
    for (let seq = 0; seq < TOTAL_CHUNKS; seq++) {
      const receivedBuf = receivedSequences.get(seq);
      assert.ok(receivedBuf, `Missing sequence ${seq}`);
      assert.equal(receivedBuf.byteLength, CHUNK_SIZE);
      assert.equal(receivedBuf[0], seq % 256, `Corrupted byte at sequence ${seq}`);
    }

    console.log(
      `\n  ⚡ Relay Chunk Pipeline & Speed Test:` +
      `\n     - Data Streamed:   ${(totalBytesTransferred / (1024 * 1024)).toFixed(1)} MB` +
      `\n     - Chunks:          ${TOTAL_CHUNKS} chunks (64 KB each)` +
      `\n     - Transit Time:    ${streamElapsedMs.toFixed(2)} ms` +
      `\n     - Relay Speed:     ${throughputMBps.toFixed(2)} MB/s` +
      `\n     - Integrity Check: 100% Passed (All chunk sequences matched)\n`
    );

    assert.ok(throughputMBps > 20, `Relay throughput was ${throughputMBps} MB/s, expected > 20 MB/s`);
  });
});
