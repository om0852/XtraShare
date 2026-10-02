import React, { useEffect, useRef, useState } from 'react';
import {
  Laptop,
  Smartphone,
  Tablet,
  HelpCircle,
  Send,
  QrCode,
  ShieldCheck,
  Radio,
  Activity
} from 'lucide-react';
import { DeviceInfo, formatBytes } from '@xtrashare/protocol';
import { useDeviceStore } from '../store/deviceStore.js';
import { useUIStore } from '../store/uiStore.js';
import { useTransferStore } from '../store/transferStore.js';

interface AirDropRadarProps {
  onSelectDeviceForTransfer: (device: DeviceInfo) => void;
}

export const AirDropRadar: React.FC<AirDropRadarProps> = ({ onSelectDeviceForTransfer }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 460 });

  const selfDevice = useDeviceStore((state) => state.selfDevice);
  const devices = useDeviceStore((state) => state.devices);
  const targetDeviceId = useDeviceStore((state) => state.targetDeviceId);
  const setTargetDeviceId = useDeviceStore((state) => state.setTargetDeviceId);
  const setQrModalOpen = useUIStore((state) => state.setQrModalOpen);
  const currentRoomId = useUIStore((state) => state.currentRoomId);
  const transfers = useTransferStore((state) => state.transfers);

  // ResizeObserver for exact pixel-perfect responsive dimensions
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0 && entry.contentRect.height > 0) {
          setDimensions({
            width: entry.contentRect.width,
            height: entry.contentRect.height
          });
        }
      }
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const deviceList = Array.from(devices.values());

  // Active file transfer state
  const activeTransfer = Array.from(transfers.values()).find(
    (t) => t.status === 'transferring' || t.status === 'offered' || t.status === 'interrupted'
  );

  const isSendingActive = Boolean(activeTransfer && activeTransfer.senderId === selfDevice?.id);
  const isReceivingActive = Boolean(activeTransfer && activeTransfer.receiverId === selfDevice?.id);
  const isInterrupted = activeTransfer?.status === 'interrupted';

  // Responsive radius calculation based on container bounds
  const getRadius = () => {
    if (dimensions.width < 640) return Math.min(115, dimensions.height / 2 - 40);
    if (dimensions.width < 1024) return Math.min(160, dimensions.height / 2 - 50);
    return Math.min(210, dimensions.height / 2 - 60);
  };

  const radius = getRadius();
  const centerX = dimensions.width / 2;
  const centerY = dimensions.height / 2;

  const getDeviceIcon = (type: DeviceInfo['type'], platform: DeviceInfo['platform'], className = 'w-6 h-6') => {
    if (type === 'desktop' || platform === 'Windows' || platform === 'macOS' || platform === 'Linux') {
      return <Laptop className={className} />;
    }
    if (type === 'tablet') {
      return <Tablet className={className} />;
    }
    if (type === 'mobile' || platform === 'iOS' || platform === 'Android') {
      return <Smartphone className={className} />;
    }
    return <HelpCircle className={className} />;
  };

  // Find active transfer peer coordinates for SVG photon beam
  const activePeerIndex = deviceList.findIndex((d) =>
    activeTransfer ? (isSendingActive ? d.id === activeTransfer.receiverId : d.id === activeTransfer.senderId) : false
  );

  let activePeerCoords: { x: number; y: number } | null = null;
  if (activePeerIndex !== -1 && deviceList.length > 0) {
    const angle = (activePeerIndex / deviceList.length) * 2 * Math.PI - Math.PI / 2;
    activePeerCoords = {
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius
    };
  }

  // Active transfer progress calculation
  const transferProgress = activeTransfer && activeTransfer.fileSize && activeTransfer.fileSize > 0
    ? Math.min(100, Math.round((activeTransfer.bytesTransferred / activeTransfer.fileSize) * 100))
    : 0;

  return (
    <div
      ref={containerRef}
      className="relative w-full max-w-4xl 2xl:max-w-5xl mx-auto h-[350px] sm:h-[450px] lg:h-[520px] 2xl:h-[570px] flex items-center justify-center overflow-hidden rounded-3xl mono-panel border border-white/15 p-3 sm:p-6 my-2 sm:my-4 shadow-2xl animate-room-warp"
    >
      {/* 1. Concentric Black & White Radar Rings */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        {/* Animated Quantum Ripple on Room Sync */}
        <div className="absolute w-28 h-28 rounded-full border border-white/40 animate-quantum-ripple" />

        {/* Animated Sonar Pulse */}
        <div className="absolute w-40 sm:w-52 lg:w-64 h-40 sm:h-52 lg:h-64 rounded-full border border-white/30 animate-radar-pulse" />

        {/* Ring 1 */}
        <div className="absolute w-44 sm:w-60 lg:w-76 h-44 sm:h-60 lg:h-76 rounded-full border border-white/10" />

        {/* Ring 2 (Dashed Orbit Ring) */}
        <div
          style={{ width: `${radius * 2}px`, height: `${radius * 2}px` }}
          className="absolute rounded-full border border-white/15 border-dashed"
        />

        {/* Ring 3 (Outer Boundary) */}
        <div className="absolute w-[360px] sm:w-[480px] lg:w-[620px] h-[360px] sm:h-[480px] lg:h-[620px] rounded-full border border-white/5" />

        {/* 360-Degree Rotating Radar Sweep Line */}
        <div className="absolute w-[360px] sm:w-[480px] lg:w-[620px] h-[360px] sm:h-[480px] lg:h-[620px] rounded-full pointer-events-none animate-radar-sweep">
          <div
            className="w-1/2 h-1/2 origin-bottom-right"
            style={{
              background: 'conic-gradient(from 0deg, transparent 70%, rgba(255, 255, 255, 0.09) 100%)'
            }}
          />
        </div>

        {/* Subtle grid crosshairs */}
        <div className="absolute w-full h-[1px] bg-gradient-to-r from-transparent via-white/10 to-transparent" />
        <div className="absolute h-full w-[1px] bg-gradient-to-b from-transparent via-white/10 to-transparent" />
      </div>

      {/* 2. Top HUD Room Status Indicator */}
      <div className="absolute top-3 left-3 sm:top-4 sm:left-6 z-30 flex items-center space-x-2">
        <div className="flex items-center space-x-1.5 sm:space-x-2 px-2.5 sm:px-3.5 py-1 sm:py-1.5 rounded-full bg-black/85 border border-white/20 text-[10px] sm:text-[11px] font-mono text-zinc-300 backdrop-blur-md shadow-lg">
          <ShieldCheck className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-white" />
          <span>ROOM: <strong className="text-white tracking-widest">{currentRoomId || '---'}</strong></span>
          <span className="text-zinc-600">•</span>
          <span className="text-white font-extrabold flex items-center gap-1">
            <Radio className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-white animate-pulse" />
            {deviceList.length + 1} ONLINE
          </span>
        </div>
      </div>

      {/* 3. Top Right Transfer HUD Indicator */}
      {(isSendingActive || isReceivingActive) && (
        <div className="absolute top-3 right-3 sm:top-4 sm:right-6 z-30 flex items-center space-x-2 animate-fade-in">
          {isInterrupted ? (
            <div className="flex items-center space-x-1.5 sm:space-x-2 px-2.5 sm:px-3.5 py-1 sm:py-1.5 rounded-full bg-amber-400 text-black text-[10px] sm:text-[11px] font-mono font-black shadow-[0_0_20px_rgba(251,191,36,0.4)]">
              <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-black animate-ping" />
              <span>RECONNECTING...</span>
              <span className="bg-black text-amber-400 px-1.5 py-0.2 rounded text-[9px] sm:text-[10px] font-bold">
                {transferProgress}%
              </span>
            </div>
          ) : (
            <div className="flex items-center space-x-1.5 sm:space-x-2 px-2.5 sm:px-3.5 py-1 sm:py-1.5 rounded-full bg-white text-black text-[10px] sm:text-[11px] font-mono font-black shadow-[0_0_20px_rgba(255,255,255,0.3)]">
              <Activity className="w-3 h-3 sm:w-3.5 sm:h-3.5 animate-spin" />
              <span>{isSendingActive ? `SENDING ${transferProgress}%` : `RECEIVING ${transferProgress}%`}</span>
              {activeTransfer?.transportMode === 'lan-p2p' ? (
                <span className="font-mono text-[8px] sm:text-[9px] bg-black text-emerald-400 border border-emerald-400/40 px-1 py-0.2 rounded font-bold">
                  LAN
                </span>
              ) : activeTransfer?.speed ? (
                <span className="font-mono text-[9px] sm:text-[10px] bg-black text-white px-1 sm:px-1.5 py-0.2 rounded font-bold">
                  {formatBytes(activeTransfer.speed)}/s
                </span>
              ) : null}
            </div>
          )}
        </div>
      )}

      {/* 4. SVG Active Transfer Photon Beam (File Sending & Receiving Animation) */}
      {activePeerCoords && (
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none z-15 overflow-visible"
          style={{ width: '100%', height: '100%' }}
        >
          <defs>
            <filter id="beamGlow" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
            <linearGradient id="beamGradient" x1="0" y1="0" x2={activePeerCoords.x} y2={activePeerCoords.y} gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.9" />
              <stop offset="50%" stopColor="#ffffff" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#ffffff" stopOpacity="0.9" />
            </linearGradient>
          </defs>

          {/* Centered coordinate system mapped directly to radar center */}
          <g transform={`translate(${centerX}, ${centerY})`}>
            {/* Outer Glow Aura Beam */}
            <line
              x1="0"
              y1="0"
              x2={activePeerCoords.x}
              y2={activePeerCoords.y}
              stroke="white"
              strokeWidth="6"
              strokeOpacity="0.3"
              filter="url(#beamGlow)"
            />

            {/* Core Dashed Animated Laser Beam */}
            <line
              x1="0"
              y1="0"
              x2={activePeerCoords.x}
              y2={activePeerCoords.y}
              stroke="url(#beamGradient)"
              strokeWidth="2.5"
              className="animate-beam-dash"
            />

            {/* Travelling Photon Packets along Vector */}
            <circle
              cx={activePeerCoords.x * 0.25}
              cy={activePeerCoords.y * 0.25}
              r="3.5"
              fill="white"
              filter="url(#beamGlow)"
            />
            <circle
              cx={activePeerCoords.x * 0.5}
              cy={activePeerCoords.y * 0.5}
              r="4.5"
              fill="white"
              filter="url(#beamGlow)"
            />
            <circle
              cx={activePeerCoords.x * 0.75}
              cy={activePeerCoords.y * 0.75}
              r="3.5"
              fill="white"
              filter="url(#beamGlow)"
            />

            {/* Lock-On Reticle Around Target Node */}
            <circle
              cx={activePeerCoords.x}
              cy={activePeerCoords.y}
              r="38"
              stroke="white"
              strokeWidth="1.5"
              strokeDasharray="6 6"
              fill="none"
              className="animate-lock-on"
            />

            {/* Floating transfer HUD badge on beam midpoint */}
            <g transform={`translate(${activePeerCoords.x * 0.5}, ${activePeerCoords.y * 0.5})`}>
              <rect
                x="-50"
                y="-15"
                width="100"
                height="30"
                rx="15"
                fill="#000000"
                stroke="white"
                strokeWidth="1.5"
                filter="url(#beamGlow)"
              />
              <text
                x="0"
                y="4"
                fill="#ffffff"
                fontSize="10"
                fontFamily="Inter, sans-serif"
                fontWeight="800"
                textAnchor="middle"
              >
                {isInterrupted
                  ? `RECONNECTING ${transferProgress}%`
                  : isSendingActive
                  ? `SENDING ${transferProgress}%`
                  : `RECEIVING ${transferProgress}%`}
              </text>
            </g>
          </g>
        </svg>
      )}

      {/* 5. Center: Self Device Beacon */}
      <div className="relative z-20 flex flex-col items-center group cursor-pointer animate-float">
        <div
          className={`relative flex items-center justify-center w-16 sm:w-20 lg:w-22 h-16 sm:h-20 lg:h-22 rounded-full shadow-2xl border-2 transition-transform duration-300 group-hover:scale-105 ${
            isSendingActive || isReceivingActive
              ? 'border-white bg-black mono-border-glow'
              : 'border-white/50 bg-black shadow-[0_0_35px_rgba(255,255,255,0.2)]'
          }`}
        >
          {selfDevice ? (
            getDeviceIcon(selfDevice.type, selfDevice.platform, 'w-7 sm:w-8 h-7 sm:h-8 text-white')
          ) : (
            <Laptop className="w-7 sm:w-8 h-7 sm:h-8 text-white" />
          )}

          {/* Self status online badge */}
          <span className="absolute bottom-0 right-0 w-4 h-4 rounded-full bg-white border-2 border-black flex items-center justify-center shadow-md">
            <span className="w-1.5 h-1.5 rounded-full bg-black" />
          </span>

          {/* Sending animation ring around self */}
          {isSendingActive && (
            <div className="absolute -inset-2 rounded-full border-2 border-white animate-ping opacity-60" />
          )}

          {/* Receiving beacon ping around self */}
          {isReceivingActive && (
            <div className="absolute -inset-3 rounded-full border border-dashed border-white animate-lock-on" />
          )}
        </div>

        <div className="mt-1.5 text-center max-w-[80px] sm:max-w-[110px]">
          <span className="text-[10px] sm:text-xs font-bold text-white tracking-wide flex items-center justify-center gap-1 flex-wrap">
            <span className="truncate max-w-[60px] sm:max-w-[85px]">{selfDevice?.name || 'This Device'}</span>
            <span className="text-[9px] px-1 py-px rounded bg-white text-black font-mono font-black flex-shrink-0">YOU</span>
          </span>
          <span className="text-[9px] text-zinc-500 font-mono block truncate">{selfDevice?.platform || ''}</span>
        </div>
      </div>

      {/* 6. Orbiting Discovered Devices */}
      {deviceList.length > 0 ? (
        deviceList.map((device, index) => {
          const total = deviceList.length;
          const angle = (index / total) * 2 * Math.PI - Math.PI / 2;
          const x = Math.cos(angle) * radius;
          const y = Math.sin(angle) * radius;

          const isSelected = targetDeviceId === device.id;
          const isTransferringWithThisDevice =
            activeTransfer && (activeTransfer.receiverId === device.id || activeTransfer.senderId === device.id);

          return (
            <div
              key={device.id}
              style={{
                transform: `translate(${x}px, ${y}px)`
              }}
              onClick={() => {
                setTargetDeviceId(device.id);
                onSelectDeviceForTransfer(device);
              }}
              className={`absolute z-20 flex flex-col items-center cursor-pointer transition-all duration-300 group ${
                isSelected ? 'scale-110 z-30' : 'hover:scale-105'
              }`}
            >
              {/* Device Circular Node */}
              <div
                className={`relative flex items-center justify-center w-14 sm:w-16 lg:w-18 h-14 sm:h-16 lg:h-18 rounded-full shadow-2xl transition-all border-2 ${
                  isTransferringWithThisDevice
                    ? 'border-white bg-black mono-border-glow ring-4 ring-white/20'
                    : isSelected
                    ? 'border-white bg-zinc-900 ring-2 ring-white/30 shadow-[0_0_25px_rgba(255,255,255,0.25)]'
                    : 'border-white/25 bg-black/90 hover:border-white/70'
                }`}
              >
                {getDeviceIcon(device.type, device.platform, 'w-6 sm:w-7 h-6 sm:h-7 text-white')}

                {/* Receiving Lock-On Target Brackets */}
                {isReceivingActive && isTransferringWithThisDevice && (
                  <div className="absolute -inset-3 rounded-full border border-dashed border-white animate-lock-on pointer-events-none" />
                )}

                {/* Device Online Indicator */}
                <span
                  className={`absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-black flex items-center justify-center ${
                    device.status === 'available' ? 'bg-white' : 'bg-zinc-600'
                  }`}
                />
              </div>

              {/* Device Name + Send Badge (compact, no overflow) */}
              <div className="mt-1 text-center" style={{ width: `${Math.min(90, radius * 0.65)}px` }}>
                <p className="text-[10px] sm:text-xs font-bold text-white truncate">{device.name}</p>
                <p className="text-[8px] sm:text-[9px] text-zinc-500 font-mono truncate">{device.platform}</p>
                {/* SEND / SELECTED inline badge */}
                <div
                  className={`mt-0.5 inline-flex items-center gap-0.5 text-[8px] sm:text-[9px] font-mono px-1.5 py-px rounded-full transition-all ${
                    isSelected
                      ? 'bg-white text-black font-black shadow-sm'
                      : 'bg-zinc-900/80 text-zinc-400 opacity-0 group-hover:opacity-100'
                  }`}
                >
                  <Send className="w-2 h-2" />
                  <span>{isSelected ? 'SELECTED' : 'SEND'}</span>
                </div>
              </div>
            </div>
          );
        })
      ) : (
        /* Empty State: Waiting for nearby devices */
        <div className="absolute bottom-6 flex flex-col items-center text-center max-w-sm px-4 z-20">
          <p className="text-xs font-semibold text-white flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-white animate-ping" />
            Scanning for devices on this local Wi-Fi...
          </p>
          <p className="text-[11px] text-zinc-400 mt-1">
            Open XtraShare on another phone, tablet, or laptop on the same network to connect.
          </p>
          <button
            onClick={() => setQrModalOpen(true)}
            className="mt-3 flex items-center space-x-1.5 px-3.5 py-1.5 rounded-xl bg-white hover:bg-zinc-200 text-black text-xs font-extrabold shadow-md transition-all active:scale-95"
          >
            <QrCode className="w-3.5 h-3.5" />
            <span>Show QR Code</span>
          </button>
        </div>
      )}
    </div>
  );
};
