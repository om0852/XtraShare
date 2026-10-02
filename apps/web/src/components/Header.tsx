import React, { useState } from 'react';
import {
  Share2,
  QrCode,
  Copy,
  Check,
  Settings,
  LayoutGrid,
  Radar,
  Camera,
  SlidersHorizontal,
  X,
  ChevronUp,
  ExternalLink
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
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);

  const handleCopyCode = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!currentRoomId) return;
    navigator.clipboard.writeText(currentRoomId);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleShareRoomLink = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!currentRoomId) return;
    const shareUrl = `${window.location.origin}/?room=${currentRoomId}`;
    navigator.clipboard.writeText(shareUrl);
    setShareCopied(true);
    setTimeout(() => setShareCopied(false), 2000);
  };

  return (
    <>
      <header className="sticky top-0 z-40 w-full mono-panel border-b border-white/10 px-3.5 sm:px-8 py-2.5 sm:py-3.5 flex items-center justify-between">
        {/* Brand Logo */}
        <div className="flex items-center space-x-2.5 sm:space-x-3">
          <div className="relative flex items-center justify-center w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-white text-black shadow-[0_0_20px_rgba(255,255,255,0.25)] flex-shrink-0">
            <Share2 className="w-4 h-4 sm:w-5 sm:h-5 text-black" />
            <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5 sm:h-3 sm:w-3">
              <span
                className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                  connectionStatus === 'connected' ? 'bg-white' : 'bg-zinc-500'
                }`}
              />
              <span
                className={`relative inline-flex rounded-full h-2.5 w-2.5 sm:h-3 sm:w-3 ${
                  connectionStatus === 'connected' ? 'bg-white' : 'bg-zinc-400'
                }`}
              />
            </span>
          </div>

          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-base sm:text-xl font-extrabold tracking-tight text-white">
                XtraShare
              </h1>
              <span className="hidden sm:inline-block text-[10px] font-mono font-bold tracking-widest uppercase px-2 py-0.5 rounded-full bg-white/10 text-zinc-300 border border-white/20">
                LAN P2P
              </span>
            </div>
            <p className="text-xs text-zinc-400 hidden sm:block">
              High-speed peer-to-peer transfer without internet
            </p>
          </div>
        </div>

        {/* Center Navigation Tabs (Desktop Only) */}
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

        {/* Desktop Controls (hidden on mobile, visible on md+) */}
        <div className="hidden md:flex items-center space-x-2 sm:space-x-3">
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
            className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-white/15 text-zinc-200 text-xs font-medium transition-all hover:border-white/30"
            title="Show Room QR Code"
          >
            <QrCode className="w-4 h-4 text-white" />
            <span className="hidden lg:inline">Show QR</span>
          </button>

          {/* Scan QR Button */}
          <button
            onClick={() => setQrScannerOpen(true)}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-white hover:bg-zinc-200 text-black text-xs font-bold shadow-md shadow-white/15 transition-all active:scale-95"
            title="Scan QR Code with Camera"
          >
            <Camera className="w-4 h-4 text-black" />
            <span>Scan QR</span>
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

        {/* Mobile Header Controls: Ultra-compact, never wraps or overflows */}
        <div className="flex md:hidden items-center space-x-1.5 sm:space-x-2">
          {/* Mobile Room Code Pill */}
          {currentRoomId && (
            <button
              onClick={handleCopyCode}
              title="Tap to copy Room Code"
              className="flex items-center space-x-1 px-2.5 py-1.5 rounded-lg bg-zinc-900/90 border border-white/20 text-white text-[11px] font-mono transition-all active:scale-95"
            >
              <span className="text-zinc-500 font-bold">#</span>
              <span className="font-extrabold tracking-wider">{currentRoomId}</span>
              {copiedCode ? (
                <Check className="w-3 h-3 text-emerald-400 ml-0.5" />
              ) : (
                <Copy className="w-3 h-3 text-zinc-400 ml-0.5" />
              )}
            </button>
          )}

          {/* Mobile Direct 1-Tap Camera Scan QR */}
          <button
            onClick={() => setQrScannerOpen(true)}
            className="flex items-center space-x-1 px-2.5 py-1.5 rounded-lg bg-white text-black font-extrabold text-[11px] shadow-sm active:scale-95 transition-all"
            title="Scan QR with Camera"
          >
            <Camera className="w-3.5 h-3.5 text-black" />
            <span>Scan</span>
          </button>

          {/* Mobile Floating Menubar / Hidebar Toggle Button */}
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className={`p-2 rounded-lg border transition-all active:scale-95 ${
              isMobileMenuOpen
                ? 'bg-white text-black border-white shadow-lg shadow-white/25'
                : 'bg-zinc-900/90 hover:bg-zinc-800 border-white/20 text-zinc-300'
            }`}
            title={isMobileMenuOpen ? 'Hide Menu' : 'Open Controls Menu'}
            aria-label="Toggle Mobile Options Bar"
          >
            {isMobileMenuOpen ? (
              <X className="w-4 h-4 text-black" />
            ) : (
              <SlidersHorizontal className="w-4 h-4" />
            )}
          </button>
        </div>
      </header>

      {/* Mobile Floating Menubar / Hidebar Deck (Pure Monochrome Luxury) */}
      {isMobileMenuOpen && (
        <>
          {/* Backdrop for closing when tapped outside */}
          <div
            className="fixed inset-0 bg-black/75 backdrop-blur-sm z-45 md:hidden animate-fade-in"
            onClick={() => setIsMobileMenuOpen(false)}
            aria-hidden="true"
          />

          {/* Floating Menubar Card */}
          <div className="fixed top-14 sm:top-16 inset-x-3 z-50 md:hidden mono-panel border border-white/25 rounded-2xl shadow-2xl p-4 bg-zinc-950/95 backdrop-blur-2xl animate-room-warp space-y-3.5 max-w-lg mx-auto">
            {/* Header of Floating Bar */}
            <div className="flex items-center justify-between pb-2.5 border-b border-white/10">
              <div className="flex items-center space-x-2">
                <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                <span className="text-[11px] font-mono font-bold tracking-widest text-zinc-300 uppercase">
                  ROOM // {currentRoomId || 'OFFLINE'}
                </span>
                <span className="text-[10px] font-mono text-zinc-500">
                  ({devices.size} peer{devices.size === 1 ? '' : 's'})
                </span>
              </div>

              {/* Hide Bar Button */}
              <button
                onClick={() => setIsMobileMenuOpen(false)}
                className="flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-white/20 text-zinc-300 hover:text-white text-xs font-mono transition-all"
                title="Hide this floating menubar"
              >
                <ChevronUp className="w-3.5 h-3.5" />
                <span>Hide Bar</span>
              </button>
            </div>

            {/* Primary Action Button: Camera Scanner */}
            <button
              onClick={() => {
                setIsMobileMenuOpen(false);
                setQrScannerOpen(true);
              }}
              className="w-full flex items-center justify-center space-x-2.5 py-3 px-4 rounded-xl bg-white hover:bg-zinc-200 text-black font-extrabold text-xs tracking-wide shadow-lg shadow-white/20 active:scale-[0.98] transition-all"
            >
              <Camera className="w-4 h-4 text-black" />
              <span>Scan QR Code with Camera</span>
            </button>

            {/* Quick Actions Grid */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              {/* Show Room QR Code */}
              <button
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  setQrModalOpen(true);
                }}
                className="flex items-center space-x-2.5 p-3 rounded-xl bg-zinc-900 hover:bg-zinc-850 border border-white/15 text-white font-medium transition-all text-left group hover:border-white/30"
              >
                <div className="p-2 rounded-lg bg-white/10 text-white group-hover:bg-white group-hover:text-black transition-colors">
                  <QrCode className="w-4 h-4" />
                </div>
                <div>
                  <div className="font-bold text-white">Show QR</div>
                  <div className="text-[10px] text-zinc-400">Display room code</div>
                </div>
              </button>

              {/* View Mode Toggle: Radar vs Grid */}
              <button
                onClick={() => {
                  setViewMode(viewMode === 'radar' ? 'grid' : 'radar');
                  setIsMobileMenuOpen(false);
                }}
                className="flex items-center space-x-2.5 p-3 rounded-xl bg-zinc-900 hover:bg-zinc-850 border border-white/15 text-white font-medium transition-all text-left group hover:border-white/30"
              >
                <div className="p-2 rounded-lg bg-white/10 text-white group-hover:bg-white group-hover:text-black transition-colors">
                  {viewMode === 'radar' ? (
                    <LayoutGrid className="w-4 h-4" />
                  ) : (
                    <Radar className="w-4 h-4" />
                  )}
                </div>
                <div>
                  <div className="font-bold text-white">
                    {viewMode === 'radar' ? 'Grid View' : 'Radar View'}
                  </div>
                  <div className="text-[10px] text-zinc-400">
                    {viewMode === 'radar' ? 'Switch to cards' : 'Switch to radar'}
                  </div>
                </div>
              </button>

              {/* Device & Connection Settings */}
              <button
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  setSettingsModalOpen(true);
                }}
                className="flex items-center space-x-2.5 p-3 rounded-xl bg-zinc-900 hover:bg-zinc-850 border border-white/15 text-white font-medium transition-all text-left group hover:border-white/30"
              >
                <div className="p-2 rounded-lg bg-white/10 text-white group-hover:bg-white group-hover:text-black transition-colors">
                  <Settings className="w-4 h-4" />
                </div>
                <div>
                  <div className="font-bold text-white">Settings</div>
                  <div className="text-[10px] text-zinc-400">Device, sounds, LAN</div>
                </div>
              </button>

              {/* Share Direct Room Link */}
              <button
                onClick={handleShareRoomLink}
                className="flex items-center space-x-2.5 p-3 rounded-xl bg-zinc-900 hover:bg-zinc-850 border border-white/15 text-white font-medium transition-all text-left group hover:border-white/30"
              >
                <div className="p-2 rounded-lg bg-white/10 text-white group-hover:bg-white group-hover:text-black transition-colors">
                  {shareCopied ? (
                    <Check className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <ExternalLink className="w-4 h-4" />
                  )}
                </div>
                <div>
                  <div className="font-bold text-white">
                    {shareCopied ? 'Link Copied!' : 'Share Link'}
                  </div>
                  <div className="text-[10px] text-zinc-400">Copy URL to join</div>
                </div>
              </button>
            </div>

            {/* Room Code Quick-Copy Footnote */}
            <div className="pt-2 border-t border-white/10 flex items-center justify-between text-[11px] font-mono text-zinc-400">
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                Mesh Ready
              </span>
              <button
                onClick={handleCopyCode}
                className="flex items-center space-x-1 text-white hover:underline"
              >
                <span>Code: {currentRoomId}</span>
                {copiedCode ? (
                  <Check className="w-3 h-3 text-emerald-400" />
                ) : (
                  <Copy className="w-3 h-3 text-zinc-400" />
                )}
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
};
