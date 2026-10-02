import { DeviceInfo, DeviceRegistration, DeviceStatus } from '@xtrashare/protocol';
import { v4 as uuidv4 } from 'uuid';

export class DeviceManager {
  // socketId -> DeviceInfo
  private devicesBySocket = new Map<string, DeviceInfo>();
  // deviceId -> socketId
  private socketByDeviceId = new Map<string, string>();

  /**
   * Registers a connected socket as a device.
   */
  public registerDevice(socketId: string, reg: DeviceRegistration, isHost = false): DeviceInfo {
    const deviceId = `dev_${uuidv4().substring(0, 8)}`;
    const device: DeviceInfo = {
      id: deviceId,
      name: reg.name || 'Anonymous Device',
      type: reg.type || 'unknown',
      platform: reg.platform || 'Unknown',
      browser: reg.browser || 'Unknown',
      status: 'available',
      joinedAt: Date.now(),
      isHost,
      avatarColor: reg.avatarColor || '#6366f1'
    };

    this.devicesBySocket.set(socketId, device);
    this.socketByDeviceId.set(deviceId, socketId);
    return device;
  }

  /**
   * Retrieves device by its socket ID.
   */
  public getBySocketId(socketId: string): DeviceInfo | undefined {
    return this.devicesBySocket.get(socketId);
  }

  /**
   * Retrieves socket ID by device ID.
   */
  public getSocketId(deviceId: string): string | undefined {
    return this.socketByDeviceId.get(deviceId);
  }

  /**
   * Retrieves device by its device ID.
   */
  public getByDeviceId(deviceId: string): DeviceInfo | undefined {
    const socketId = this.socketByDeviceId.get(deviceId);
    if (!socketId) return undefined;
    return this.devicesBySocket.get(socketId);
  }

  /**
   * Updates device status or metadata.
   */
  public updateStatus(socketId: string, status: DeviceStatus): DeviceInfo | undefined {
    const device = this.devicesBySocket.get(socketId);
    if (device) {
      device.status = status;
      return device;
    }
    return undefined;
  }

  /**
   * Removes device upon socket disconnection.
   */
  public removeDevice(socketId: string): DeviceInfo | undefined {
    const device = this.devicesBySocket.get(socketId);
    if (device) {
      this.devicesBySocket.delete(socketId);
      this.socketByDeviceId.delete(device.id);
      return device;
    }
    return undefined;
  }

  public getActiveCount(): number {
    return this.devicesBySocket.size;
  }
}
