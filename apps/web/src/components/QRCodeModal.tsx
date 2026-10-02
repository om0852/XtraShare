import React, { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { X, Copy, Check, Smartphone, ArrowRight, Camera } from 'lucide-react';
import { useUIStore } from '../store/uiStore.js';
import { socketService } from '../services/socket.js';

export const QRCodeModal: React.FC = () => {
  const { isQrModalOpen, setQrModalOpen, currentRoomId, setQrScannerOpen } = useUIStore();
  const [manualCode, setManualCode] = useState('');
  const [copiedLink, setCopiedLink] = useState(false);
  const [isJoining, setIsJoining] = useState(false);

  if (!isQrModalOpen) return null;

  // Construct complete pairing URL
  const currentHost = window.location.host;
  const protocol = window.location.protocol;
  const pairUrl = `${protocol}//${currentHost}/?room=${currentRoomId}`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(pairUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleManualJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualCode.trim()) return;

    setIsJoining(true);
    try {
      await socketService.joinRoom(manualCode.trim());
      setQrModalOpen(false);
      setManualCode('');
    } catch (err) {
      console.warn('Manual join error:', err);
    } finally {
      setIsJoining(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in">
      <div className="w-full max-w-md p-6 sm:p-7 rounded-3xl mono-panel border border-white/20 shadow-2xl relative space-y-5">
        {/* Close Button */}
        <button
          onClick={() => setQrModalOpen(false)}
          className="absolute top-5 right-5 p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="flex items-center space-x-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-white text-black shadow-[0_0_20px_rgba(255,255,255,0.2)]">
            <Smartphone className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-extrabold text-white">Pair Mobile Device</h3>
            <p className="text-xs text-zinc-400">Scan QR with phone camera or switch to scanner</p>
          </div>
        </div>

        {/* Action Toggle Bar (Monochrome) */}
        <div className="flex items-center p-1 rounded-xl bg-zinc-900 border border-white/10 text-xs font-medium">
          <button
            type="button"
            className="flex-1 py-2 px-3 rounded-lg bg-white text-black font-bold text-center shadow-sm"
          >
            Show Room QR
          </button>
          <button
            type="button"
            onClick={() => {
              setQrModalOpen(false);
              setQrScannerOpen(true);
            }}
            className="flex-1 py-2 px-3 rounded-lg text-zinc-400 hover:text-white transition-colors text-center flex items-center justify-center space-x-1.5"
          >
            <Camera className="w-3.5 h-3.5" />
            <span>Scan with Camera</span>
          </button>
        </div>

        {/* High-Contrast Crisp QR Canvas Card */}
        <div className="flex flex-col items-center justify-center p-6 rounded-2xl bg-white shadow-2xl">
          <QRCodeSVG
            value={pairUrl}
            size={200}
            level="M"
            includeMargin={true}
          />
          <div className="mt-3 text-center">
            <span className="text-[11px] font-mono font-bold text-zinc-600">ROOM CODE:</span>
            <span className="ml-2 font-mono text-lg font-black tracking-widest text-black">
              {currentRoomId}
            </span>
          </div>
        </div>

        {/* Copy Link Row */}
        <div className="flex items-center space-x-2">
          <input
            type="text"
            readOnly
            value={pairUrl}
            className="flex-1 px-3 py-2 rounded-xl bg-zinc-900 border border-white/10 text-zinc-300 font-mono text-xs focus:outline-none truncate"
          />
          <button
            onClick={handleCopyLink}
            className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-white hover:bg-zinc-200 text-black text-xs font-bold shadow-md transition-all active:scale-95"
          >
            {copiedLink ? <Check className="w-4 h-4 text-black" /> : <Copy className="w-4 h-4 text-black" />}
            <span>{copiedLink ? 'Copied' : 'Copy'}</span>
          </button>
        </div>

        {/* Manual Code Input Form */}
        <form onSubmit={handleManualJoin} className="pt-4 border-t border-white/10 space-y-3">
          <label className="text-xs text-zinc-400 font-medium block">Or enter a different room code to switch:</label>
          <div className="flex items-center space-x-2">
            <input
              type="text"
              maxLength={8}
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value.toUpperCase())}
              placeholder="e.g. ABX72K"
              className="flex-1 px-3 py-2 rounded-xl bg-zinc-900 border border-white/15 text-white font-mono text-sm tracking-wider uppercase focus:outline-none focus:border-white"
            />
            <button
              type="submit"
              disabled={!manualCode.trim() || isJoining}
              className="flex items-center space-x-1 px-4 py-2 rounded-xl bg-white hover:bg-zinc-200 text-black text-xs font-extrabold shadow-md transition-all active:scale-95 disabled:opacity-40"
            >
              <span>{isJoining ? 'Joining...' : 'Join'}</span>
              <ArrowRight className="w-4 h-4 text-black" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
