import { describe, it } from 'node:test';
import assert from 'node:assert';
import { DeviceManager } from './DeviceManager.js';

describe('DeviceManager Unit Tests', () => {
  it('should register a new device and map socket ID correctly', () => {
    const dm = new DeviceManager();
    const dev = dm.registerDevice('sock_1', {
      name: 'MacBook Pro',
      type: 'desktop',
      platform: 'macOS',
      browser: 'Chrome'
    }, true);

    assert.ok(dev.id.startsWith('dev_'));
    assert.strictEqual(dev.name, 'MacBook Pro');
    assert.strictEqual(dev.isHost, true);
    assert.strictEqual(dm.getActiveCount(), 1);

    const retrieved = dm.getBySocketId('sock_1');
    assert.strictEqual(retrieved?.id, dev.id);

    const socketId = dm.getSocketId(dev.id);
    assert.strictEqual(socketId, 'sock_1');

    const byDevId = dm.getByDeviceId(dev.id);
    assert.strictEqual(byDevId?.name, 'MacBook Pro');
  });

  it('should update device status', () => {
    const dm = new DeviceManager();
    dm.registerDevice('sock_2', {
      name: 'Pixel Phone',
      type: 'mobile',
      platform: 'Android',
      browser: 'Chrome Mobile'
    });

    const updated = dm.updateStatus('sock_2', 'busy');
    assert.strictEqual(updated?.status, 'busy');

    const retrieved = dm.getBySocketId('sock_2');
    assert.strictEqual(retrieved?.status, 'busy');
  });

  it('should clean up on device removal', () => {
    const dm = new DeviceManager();
    const dev = dm.registerDevice('sock_3', {
      name: 'iPad Air',
      type: 'tablet',
      platform: 'iOS',
      browser: 'Safari'
    });

    assert.strictEqual(dm.getActiveCount(), 1);
    const removed = dm.removeDevice('sock_3');
    assert.strictEqual(removed?.id, dev.id);
    assert.strictEqual(dm.getActiveCount(), 0);
    assert.strictEqual(dm.getBySocketId('sock_3'), undefined);
    assert.strictEqual(dm.getSocketId(dev.id), undefined);
  });
});
