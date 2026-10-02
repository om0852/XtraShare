import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { RoomManager } from './RoomManager.js';
import { DeviceInfo } from '@xtrashare/protocol';

describe('RoomManager Unit Tests', () => {
  const dummyDevice1: DeviceInfo = {
    id: 'dev_1',
    name: "Om's Laptop",
    type: 'desktop',
    platform: 'Windows',
    browser: 'Chrome',
    status: 'available',
    joinedAt: Date.now(),
    isHost: true
  };

  const dummyDevice2: DeviceInfo = {
    id: 'dev_2',
    name: "Om's iPhone",
    type: 'mobile',
    platform: 'iOS',
    browser: 'Safari',
    status: 'available',
    joinedAt: Date.now()
  };

  it('should generate a 6-character uppercase alphanumeric code', () => {
    const manager = new RoomManager();
    const code = manager.generateRoomCode();
    assert.equal(code.length, 6);
    assert.match(code, /^[2-9A-HJ-NP-Z]{6}$/);
  });

  it('should create a room and set the creator as owner', () => {
    const manager = new RoomManager();
    const room = manager.createRoom('socket_1', dummyDevice1);

    assert.ok(room.roomId);
    assert.equal(room.ownerSocketId, 'socket_1');
    assert.equal(room.devices.size, 1);
    assert.deepEqual(room.devices.get('socket_1'), dummyDevice1);
    assert.equal(manager.getActiveRoomCount(), 1);
  });

  it('should allow another device to join an existing room', () => {
    const manager = new RoomManager();
    const room = manager.createRoom('socket_1', dummyDevice1);
    const joinResult = manager.joinRoom(room.roomId, 'socket_2', dummyDevice2);

    assert.equal(joinResult.success, true);
    assert.equal(manager.getDevicesInRoom(room.roomId).length, 2);
  });

  it('should return error when joining non-existent room', () => {
    const manager = new RoomManager();
    const joinResult = manager.joinRoom('NONEXIST', 'socket_2', dummyDevice2);

    assert.equal(joinResult.success, false);
    assert.equal(joinResult.error, 'ROOM_NOT_FOUND');
  });

  it('should clean up room automatically when all devices leave', () => {
    const manager = new RoomManager();
    manager.createRoom('socket_1', dummyDevice1);
    assert.equal(manager.getActiveRoomCount(), 1);

    const leaveResult = manager.leaveCurrentRoom('socket_1');
    assert.equal(leaveResult.roomEmpty, true);
    assert.equal(manager.getActiveRoomCount(), 0);
  });
});
