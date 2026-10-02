import { create } from 'zustand';
import { DeviceInfo } from '@xtrashare/protocol';

interface DeviceState {
  selfDevice: DeviceInfo | null;
  devices: Map<string, DeviceInfo>;
  targetDeviceId: string | null;

  setSelfDevice: (device: DeviceInfo | null) => void;
  setDevices: (devices: DeviceInfo[]) => void;
  addOrUpdateDevice: (device: DeviceInfo) => void;
  removeDevice: (deviceId: string) => void;
  setTargetDeviceId: (deviceId: string | null) => void;
}

export const useDeviceStore = create<DeviceState>((set) => ({
  selfDevice: null,
  devices: new Map(),
  targetDeviceId: null,

  setSelfDevice: (device) => set({ selfDevice: device }),

  setDevices: (devicesList) =>
    set((state) => {
      const map = new Map<string, DeviceInfo>();
      for (const d of devicesList) {
        if (!state.selfDevice || d.id !== state.selfDevice.id) {
          map.set(d.id, d);
        }
      }
      return { devices: map };
    }),

  addOrUpdateDevice: (device) =>
    set((state) => {
      if (state.selfDevice && device.id === state.selfDevice.id) {
        return state;
      }
      const newMap = new Map(state.devices);
      newMap.set(device.id, device);
      return { devices: newMap };
    }),

  removeDevice: (deviceId) =>
    set((state) => {
      const newMap = new Map(state.devices);
      newMap.delete(deviceId);
      const targetId = state.targetDeviceId === deviceId ? null : state.targetDeviceId;
      return { devices: newMap, targetDeviceId: targetId };
    }),

  setTargetDeviceId: (targetDeviceId) => set({ targetDeviceId })
}));
