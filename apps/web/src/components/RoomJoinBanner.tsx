import React, { useEffect, useState } from 'react';
import { ShieldCheck, Wifi } from 'lucide-react';
import { useUIStore } from '../store/uiStore.js';
import { useDeviceStore } from '../store/deviceStore.js';

export const RoomJoinBanner: React.FC = () => {
  const currentRoomId = useUIStore((state) => state.currentRoomId);
  const devices = useDeviceStore((state) => state.devices);
  const [showNotification, setShowNotification] = useState(false);
  const [lastRoom, setLastRoom] = useState<string | null>(null);

  useEffect(() => {
    if (currentRoomId && currentRoomId !== lastRoom) {
      setLastRoom(currentRoomId);
      setShowNotification(true);
      const timer = setTimeout(() => {
        setShowNotification(false);
      }, 4200);
      return () => clearTimeout(timer);
    }
  }, [currentRoomId, lastRoom]);

  if (!showNotification || !currentRoomId) return null;

  return (
    <div className="fixed top-20 inset-x-0 z-50 flex justify-center pointer-events-none px-4 animate-fade-in">
      <div className="relative overflow-hidden rounded-2xl mono-panel border border-white/30 px-5 py-3.5 shadow-2xl shadow-black/80 flex items-center space-x-4 max-w-md w-full animate-room-warp pointer-events-auto">
        {/* Hyperspace beam scanline across the banner */}
        <div className="absolute inset-0 pointer-events-none bg-gradient-to-r from-transparent via-white/10 to-transparent animate-mono-shimmer" />

        {/* Quantum Icon Reticle */}
        <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-white text-black flex-shrink-0 shadow-[0_0_20px_rgba(255,255,255,0.4)]">
          <ShieldCheck className="w-5 h-5 text-black" />
          <span className="absolute -inset-1 rounded-xl border border-white/50 animate-ping opacity-50" />
        </div>

        {/* Room Info & Status */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center space-x-2">
            <span className="text-[10px] font-mono font-bold tracking-widest uppercase px-1.5 py-0.5 rounded bg-white text-black">
              LINK ACTIVE
            </span>
            <span className="text-xs font-mono font-bold text-white tracking-wider truncate">
              ROOM // {currentRoomId}
            </span>
          </div>
          <p className="text-[11px] text-zinc-400 font-mono mt-0.5 flex items-center gap-1.5">
            <Wifi className="w-3 h-3 text-white" />
            <span>P2P Mesh Ready • {devices.size} peer(s) in channel</span>
          </p>
        </div>

        {/* Micro Graphic: Frequency Bars */}
        <div className="hidden sm:flex items-end space-x-1 h-5 flex-shrink-0">
          <span className="w-1 bg-white rounded-full h-2 animate-pulse" />
          <span className="w-1 bg-white rounded-full h-4 animate-pulse [animation-delay:150ms]" />
          <span className="w-1 bg-white rounded-full h-5 animate-pulse [animation-delay:300ms]" />
          <span className="w-1 bg-white rounded-full h-3 animate-pulse [animation-delay:450ms]" />
        </div>
      </div>
    </div>
  );
};
