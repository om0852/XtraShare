import React from 'react';
import { Laptop, Smartphone, Tablet, Send } from 'lucide-react';
import { DeviceInfo } from '@xtrashare/protocol';
import { useDeviceStore } from '../store/deviceStore.js';

interface DeviceGridProps {
  onSelectDeviceForTransfer: (device: DeviceInfo) => void;
}

export const DeviceGrid: React.FC<DeviceGridProps> = ({ onSelectDeviceForTransfer }) => {
  const devices = useDeviceStore((state) => state.devices);
  const targetDeviceId = useDeviceStore((state) => state.targetDeviceId);
  const setTargetDeviceId = useDeviceStore((state) => state.setTargetDeviceId);

  const deviceList = Array.from(devices.values());

  const getDeviceIcon = (type: DeviceInfo['type'], platform: DeviceInfo['platform']) => {
    if (type === 'desktop' || platform === 'Windows' || platform === 'macOS' || platform === 'Linux') {
      return <Laptop className="w-6 h-6 text-white" />;
    }
    if (type === 'tablet') {
      return <Tablet className="w-6 h-6 text-white" />;
    }
    return <Smartphone className="w-6 h-6 text-white" />;
  };

  if (deviceList.length === 0) {
    return (
      <div className="w-full max-w-4xl 2xl:max-w-5xl mx-auto py-14 text-center mono-panel rounded-3xl border border-white/10 my-6 shadow-xl">
        <Smartphone className="w-12 h-12 text-zinc-500 mx-auto mb-3 animate-float" />
        <h3 className="text-base font-extrabold text-white">No peers discovered yet</h3>
        <p className="text-xs text-zinc-400 mt-1 max-w-xs mx-auto">
          Scan the QR code from another device or join the same room to connect.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-4xl 2xl:max-w-5xl mx-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 my-6">
      {deviceList.map((device) => {
        const isSelected = targetDeviceId === device.id;

        return (
          <div
            key={device.id}
            onClick={() => {
              setTargetDeviceId(device.id);
              onSelectDeviceForTransfer(device);
            }}
            className={`p-4 rounded-2xl cursor-pointer transition-all mono-card mono-card-hover border ${
              isSelected ? 'border-white bg-zinc-900 shadow-xl shadow-white/10' : 'border-white/10'
            }`}
          >
            <div className="flex items-center space-x-3.5">
              <div
                className={`relative flex items-center justify-center w-12 h-12 rounded-xl border ${
                  isSelected ? 'border-white bg-white text-black' : 'border-white/20 bg-zinc-900 text-white'
                }`}
              >
                {getDeviceIcon(device.type, device.platform)}
                <span
                  className={`absolute -top-1 -right-1 w-3 h-3 rounded-full border-2 border-black ${
                    device.status === 'available' ? 'bg-white' : 'bg-zinc-600'
                  }`}
                />
              </div>

              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-bold text-white truncate">{device.name}</h4>
                <p className="text-xs text-zinc-400 font-mono truncate">
                  {device.platform} • {device.browser}
                </p>
              </div>

              <button
                className={`p-2 rounded-xl transition-all ${
                  isSelected
                    ? 'bg-white text-black font-extrabold shadow-sm'
                    : 'bg-zinc-900 text-zinc-300 hover:bg-zinc-800 border border-white/10'
                }`}
                title="Send File"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
};
