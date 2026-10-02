import React from 'react';
import {
  File,
  ArrowDownLeft,
  ArrowUpRight,
  X,
  Gauge,
  Clock,
  Files,
  RefreshCw,
  Wifi,
  Cloud,
  Server
} from 'lucide-react';
import { formatBytes } from '@xtrashare/protocol';
import { useTransferStore } from '../store/transferStore.js';
import { transferManager } from '../services/transferManager.js';
import { useDeviceStore } from '../store/deviceStore.js';

export const TransferModal: React.FC = () => {
  const pendingOffers = useTransferStore((state) => state.pendingOffers);
  const transfers = useTransferStore((state) => state.transfers);
  const selfDevice = useDeviceStore((state) => state.selfDevice);

  // Active ongoing transfers (sending, receiving, or interrupted / reconnecting)
  const activeTransfers = Array.from(transfers.values()).filter(
    (t) =>
      t.status === 'transferring' ||
      t.status === 'offered' ||
      t.status === 'accepted' ||
      t.status === 'interrupted'
  );

  const hasOffers = pendingOffers.length > 0;
  const isMultiple = pendingOffers.length > 1;
  const totalBatchBytes = pendingOffers.reduce((acc, o) => acc + o.fileOffer.size, 0);
  const firstSender = pendingOffers[0]?.transfer.senderName || 'Peer';

  const renderTransportBadge = (mode?: string) => {
    switch (mode) {
      case 'lan-p2p':
        return (
          <span
            className="flex items-center space-x-1 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 text-[10px] font-mono font-bold"
            title="Direct Wi-Fi / Local Area Network P2P transfer (No cloud data used)"
          >
            <Wifi className="w-3 h-3 text-emerald-400" />
            <span>LAN Direct P2P</span>
          </span>
        );
      case 'webrtc-p2p':
        return (
          <span
            className="flex items-center space-x-1 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 text-[10px] font-mono font-bold"
            title="Direct WebRTC P2P transfer via STUN NAT Traversal"
          >
            <Wifi className="w-3 h-3 text-emerald-400" />
            <span>WebRTC P2P</span>
          </span>
        );
      case 'turn-relay':
        return (
          <span
            className="flex items-center space-x-1 px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/25 text-[10px] font-mono font-bold"
            title="Encrypted TURN relay transfer across restrictive NAT networks"
          >
            <Cloud className="w-3 h-3 text-amber-400" />
            <span>TURN Relay</span>
          </span>
        );
      case 'websocket-relay':
      default:
        return (
          <span
            className="flex items-center space-x-1 px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/25 text-[10px] font-mono font-bold"
            title="Fallback Server Relay transfer"
          >
            <Server className="w-3 h-3 text-blue-400" />
            <span>Server Relay</span>
          </span>
        );
    }
  };

  return (
    <>
      {/* 1. Incoming File Offer Prompt Modal (Single or Multiple) */}
      {hasOffers && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in">
          <div className="w-full max-w-lg p-6 sm:p-7 rounded-3xl mono-panel border border-white/20 shadow-2xl shadow-black space-y-4">
            {/* Modal Header */}
            <div className="flex items-center space-x-3.5">
              <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-white text-black flex-shrink-0 shadow-[0_0_20px_rgba(255,255,255,0.2)]">
                {isMultiple ? (
                  <Files className="w-6 h-6 animate-pulse text-black" />
                ) : (
                  <ArrowDownLeft className="w-6 h-6 animate-pulse text-black" />
                )}
              </div>
              <div>
                <h3 className="text-base font-extrabold text-white">
                  {isMultiple ? `Incoming Transfer (${pendingOffers.length} files)` : 'Incoming File Transfer'}
                </h3>
                <p className="text-xs text-zinc-400">
                  From: <span className="text-white font-semibold">{firstSender}</span>
                  {isMultiple && ` • Total: ${formatBytes(totalBatchBytes)}`}
                </p>
              </div>
            </div>

            {/* File(s) List */}
            <div className="max-h-60 overflow-y-auto space-y-2 p-1">
              {pendingOffers.map(({ transfer, fileOffer }) => (
                <div
                  key={transfer.id}
                  className="flex items-center justify-between p-3.5 rounded-2xl bg-zinc-900/90 border border-white/10 text-xs"
                >
                  <div className="flex items-center space-x-3 truncate">
                    <File className="w-6 h-6 text-white flex-shrink-0" />
                    <div className="truncate">
                      <p className="font-semibold text-white truncate">{fileOffer.name}</p>
                      <p className="text-[11px] text-zinc-400 font-mono">{formatBytes(fileOffer.size)}</p>
                    </div>
                  </div>

                  {isMultiple && (
                    <div className="flex items-center space-x-2 ml-2">
                      <button
                        onClick={() => transferManager.rejectTransfer(transfer.id)}
                        className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[11px]"
                      >
                        Decline
                      </button>
                      <button
                        onClick={() => transferManager.acceptTransfer(transfer.id)}
                        className="px-3 py-1 rounded-lg bg-white hover:bg-zinc-200 text-black font-bold text-[11px]"
                      >
                        Accept
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Action Buttons */}
            <div className="flex items-center space-x-3 pt-2">
              <button
                onClick={() => transferManager.rejectAllPendingOffers()}
                className="flex-1 py-3 px-4 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 text-xs font-semibold border border-white/15 transition-all active:scale-95"
              >
                {isMultiple ? 'Decline All' : 'Decline'}
              </button>
              <button
                onClick={() => transferManager.acceptAllPendingOffers()}
                className="flex-1 py-3 px-4 rounded-xl bg-white hover:bg-zinc-200 text-black text-xs font-extrabold shadow-lg shadow-white/15 transition-all active:scale-95"
              >
                {isMultiple ? `Accept All (${pendingOffers.length} files)` : 'Accept & Download'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. Floating Active Transfers Drawer (Bottom Right) */}
      {activeTransfers.length > 0 && (
        <div className="fixed bottom-6 right-4 sm:right-6 z-40 w-full max-w-sm space-y-3 pointer-events-auto">
          {activeTransfers.map((t) => {
            const isSender = t.senderId === selfDevice?.id;
            const progress =
              t.fileSize && t.fileSize > 0
                ? Math.min(100, Math.round((t.bytesTransferred / t.fileSize) * 100))
                : 0;

            const isPendingAccept = t.status === 'offered';
            const isInterrupted = t.status === 'interrupted';

            return (
              <div
                key={t.id}
                className="p-4 sm:p-5 rounded-2xl mono-panel border border-white/20 shadow-2xl space-y-3 animate-slide-up"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2.5 truncate">
                    {isSender ? (
                      <ArrowUpRight className="w-4 h-4 text-white flex-shrink-0" />
                    ) : (
                      <ArrowDownLeft className="w-4 h-4 text-white flex-shrink-0" />
                    )}
                    <span className="text-xs font-bold text-white truncate">
                      {t.fileName || 'Transfer'}
                    </span>
                  </div>

                  <div className="flex items-center space-x-2">
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/10 text-white border border-white/20 font-bold">
                      {isSender ? 'UPLOADING' : 'DOWNLOADING'}
                    </span>
                    <button
                      onClick={() => transferManager.cancelTransfer(t.id)}
                      className="p-1 rounded text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
                      title="Cancel Transfer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Transport Mode Badge (LAN Direct vs WebRTC vs Relay) */}
                <div className="flex items-center justify-between text-[11px]">
                  {renderTransportBadge(t.transportMode)}
                  <span className="text-zinc-500 font-mono text-[10px]">
                    {isSender ? `To: ${t.receiverName}` : `From: ${t.senderName}`}
                  </span>
                </div>

                {/* Status or Progress bar */}
                {isPendingAccept ? (
                  <div className="flex items-center space-x-2 py-1 text-xs text-zinc-300 font-mono">
                    <span className="animate-spin w-3 h-3 border-2 border-white border-t-transparent rounded-full" />
                    <span>Awaiting recipient confirmation...</span>
                  </div>
                ) : isInterrupted ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-300 text-xs font-mono">
                      <div className="flex items-center space-x-2">
                        <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                        <span className="font-bold">Interrupted • Auto-resuming...</span>
                      </div>
                      <button
                        onClick={() => transferManager.restoreInFlightTransfers()}
                        className="flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-amber-400 hover:bg-amber-300 text-black text-[10px] font-extrabold transition-all"
                      >
                        <RefreshCw className="w-3 h-3" />
                        <span>Resume</span>
                      </button>
                    </div>

                    <div className="w-full h-2 rounded-full bg-zinc-900 overflow-hidden border border-white/10">
                      <div
                        className="h-full rounded-full bg-amber-400 opacity-70"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-[11px] font-mono text-zinc-400">
                      <span className="text-white font-extrabold flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
                        {progress}%
                      </span>
                      <span>
                        {formatBytes(t.bytesTransferred)} / {t.fileSize ? formatBytes(t.fileSize) : '?'}
                      </span>
                    </div>

                    <div className="w-full h-2.5 rounded-full bg-zinc-900 overflow-hidden border border-white/15 p-0.5">
                      <div
                        className="h-full rounded-full bg-white relative overflow-hidden transition-all duration-200 shadow-[0_0_12px_rgba(255,255,255,0.7)]"
                        style={{ width: `${progress}%` }}
                      >
                        {/* Shimmer laser scan along the progress bar */}
                        <div className="absolute inset-0 animate-mono-shimmer" />
                      </div>
                    </div>
                  </div>
                )}

                {/* Speed & ETA */}
                {!isPendingAccept && !isInterrupted && (
                  <div className="flex items-center justify-between text-[10px] font-mono text-zinc-400 pt-1.5 border-t border-white/10">
                    <span className="flex items-center space-x-1 text-zinc-300">
                      <Gauge className="w-3 h-3 text-white" />
                      <span>{t.speed ? `${formatBytes(t.speed)}/s` : 'Negotiating...'}</span>
                    </span>
                    <span className="flex items-center space-x-1 text-zinc-300">
                      <Clock className="w-3 h-3 text-white" />
                      <span>{t.eta ? `ETA ~${t.eta}s` : 'Estimating...'}</span>
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
};
