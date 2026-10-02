import React, { useState } from 'react';
import {
  Share2,
  QrCode,
  Copy,
  Check,
  Settings,
  LayoutGrid,
  Radar,
  Camera
} from 'lucide-react';
import { useUIStore } from '../store/uiStore.js';
import { useDeviceStore } from '../store/deviceStore.js';

export const Header: React.FC = () => {
  const {
    currentRoomId,
    connectionStatus,
    setQrModalOpen,
    setQrScannerOpen,
    setSettingsModalOpen,
    viewMode,
    setViewMode,
    activeTab,
    setActiveTab
  } = useUIStore();
  const devices = useDeviceStore((state) => state.devices);

  const [copiedCode, setCopiedCode] = useState(false);

  const handleCopyCode = () => {
    if (!currentRoomId) return;
    navigator.clipboard.writeText(currentRoomId);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  return (
    <header className="sticky top-0 z-40 w-full mono-panel border-b border-white/10 px-4 sm:px-8 py-3.5 flex items-center justify-between">
      {/* Brand Logo */}
      <div className="flex items-center space-x-3">
        <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-white text-black shadow-[0_0_25px_rgba(255,255,255,0.25)]">
          <Share2 className="w-5 h-5 text-black" />
          <span className="absolute -top-1 -right-1 flex h-3 w-3">
            <span
              className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                connectionStatus === 'connected' ? 'bg-white' : 'bg-zinc-500'
              }`}
            />
            <span
              className={`relative inline-flex rounded-full h-3 w-3 ${
                connectionStatus === 'connected' ? 'bg-white' : 'bg-zinc-400'
              }`}
            />
          </span>
        </div>

        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-xl font-extrabold tracking-tight text-white">
              XtraShare
            </h1>
            <span className="text-[10px] font-mono font-bold tracking-widest uppercase px-2 py-0.5 rounded-full bg-white/10 text-zinc-300 border border-white/20">
              LAN P2P
            </span>
          </div>
          <p className="text-xs text-zinc-400 hidden sm:block">
            High-speed peer-to-peer transfer without internet
          </p>
        </div>
      </div>

      {/* Center Navigation Tabs (Black & White) */}
      <nav className="hidden md:flex items-center p-1 rounded-xl bg-zinc-900/90 border border-white/10 text-xs font-medium">
        <button
          onClick={() => setActiveTab('devices')}
          className={`px-3.5 py-1.5 rounded-lg transition-all ${
            activeTab === 'devices'
              ? 'bg-white text-black font-bold shadow-md shadow-white/10'
              : 'text-zinc-400 hover:text-white'
          }`}
        >
          Devices ({devices.size})
        </button>
        <button
          onClick={() => setActiveTab('transfers')}
          className={`px-3.5 py-1.5 rounded-lg transition-all ${
            activeTab === 'transfers'
              ? 'bg-white text-black font-bold shadow-md shadow-white/10'
              : 'text-zinc-400 hover:text-white'
          }`}
        >
          Transfers
        </button>
        <button
          onClick={() => setActiveTab('clipboard')}
          className={`px-3.5 py-1.5 rounded-lg transition-all ${
            activeTab === 'clipboard'
              ? 'bg-white text-black font-bold shadow-md shadow-white/10'
              : 'text-zinc-400 hover:text-white'
          }`}
        >
          Clipboard
        </button>
        <button
          onClick={() => setActiveTab('text')}
          className={`px-3.5 py-1.5 rounded-lg transition-all ${
            activeTab === 'text'
              ? 'bg-white text-black font-bold shadow-md shadow-white/10'
              : 'text-zinc-400 hover:text-white'
          }`}
        >
          Text Share
        </button>
      </nav>

      {/* Right Controls: Room Badge, QR Button, View Toggle & Settings */}
      <div className="flex items-center space-x-2 sm:space-x-3">
        {/* Room Code Pill */}
        {currentRoomId && (
          <button
            onClick={handleCopyCode}
            title="Click to copy Room Code"
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-zinc-900/90 hover:bg-zinc-800 border border-white/20 text-white text-xs font-mono transition-all group hover:border-white/40 shadow-sm"
          >
            <span className="text-zinc-400 font-sans text-[11px]">Room:</span>
            <span className="font-bold tracking-wider">{currentRoomId}</span>
            {copiedCode ? (
              <Check className="w-3.5 h-3.5 text-white ml-1" />
            ) : (
              <Copy className="w-3.5 h-3.5 text-zinc-400 group-hover:text-white ml-1 transition-colors" />
            )}
          </button>
        )}

        {/* QR Code Show Trigger Button */}
        <button
          onClick={() => setQrModalOpen(true)}
          className="flex items-center space-x-1 px-2.5 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-white/15 text-zinc-200 text-xs font-medium transition-all hover:border-white/30"
          title="Show Room QR Code"
        >
          <QrCode className="w-4 h-4 text-white" />
          <span className="hidden sm:inline">Show QR</span>
        </button>

        {/* Scan QR Button */}
        <button
          onClick={() => setQrScannerOpen(true)}
          className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-white hover:bg-zinc-200 text-black text-xs font-bold shadow-md shadow-white/15 transition-all active:scale-95"
          title="Scan QR Code with Camera"
        >
          <Camera className="w-4 h-4 text-black" />
          <span className="inline">Scan QR</span>
        </button>

        {/* View mode toggle (radar vs grid) */}
        {activeTab === 'devices' && (
          <button
            onClick={() => setViewMode(viewMode === 'radar' ? 'grid' : 'radar')}
            className="p-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-white/15 text-zinc-300 hover:text-white transition-all"
            title={viewMode === 'radar' ? 'Switch to Grid View' : 'Switch to Radar View'}
          >
            {viewMode === 'radar' ? (
              <LayoutGrid className="w-4 h-4 text-white" />
            ) : (
              <Radar className="w-4 h-4 text-white" />
            )}
          </button>
        )}

        {/* Settings button */}
        <button
          onClick={() => setSettingsModalOpen(true)}
          className="p-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-white/15 text-zinc-400 hover:text-white transition-all"
          title="Device Settings"
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};
