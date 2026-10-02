import React, { useState } from 'react';
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
  Server,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { formatBytes } from '@xtrashare/protocol';
import { useTransferStore } from '../store/transferStore.js';
import { transferManager } from '../services/transferManager.js';
import { useDeviceStore } from '../store/deviceStore.js';

export const TransferModal: React.FC = () => {
  const pendingOffers = useTransferStore((state) => state.pendingOffers);
  const transfers = useTransferStore((state) => state.transfers);
  const selfDevice = useDeviceStore((state) => state.selfDevice);
  const [collapsed, setCollapsed] = useState(false);

  // Active ongoing transfers
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
          <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 text-[9px] font-mono font-bold whitespace-nowrap">
            <Wifi className="w-2.5 h-2.5" />
            <span>LAN P2P</span>
          </span>
        );
      case 'webrtc-p2p':
        return (
          <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 text-[9px] font-mono font-bold whitespace-nowrap">
            <Wifi className="w-2.5 h-2.5" />
            <span>WebRTC P2P</span>
          </span>
        );
      case 'turn-relay':
        return (
          <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/25 text-[9px] font-mono font-bold whitespace-nowrap">
            <Cloud className="w-2.5 h-2.5" />
            <span>TURN Relay</span>
          </span>
        );
      default:
        return (
          <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/25 text-[9px] font-mono font-bold whitespace-nowrap">
            <Server className="w-2.5 h-2.5" />
            <span>Relay</span>
          </span>
        );
    }
  };

  return (
    <>
      {/* ── 1. Incoming File Offer Modal ── */}
      {hasOffers && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-fade-in">
          <div className="w-full max-w-md p-5 sm:p-7 rounded-2xl sm:rounded-3xl mono-panel border border-white/20 shadow-2xl shadow-black space-y-4">
            {/* Modal Header */}
            <div className="flex items-center space-x-3">
              <div className="flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-white text-black flex-shrink-0 shadow-[0_0_20px_rgba(255,255,255,0.2)]">
                {isMultiple ? (
                  <Files className="w-5 h-5 animate-pulse text-black" />
                ) : (
                  <ArrowDownLeft className="w-5 h-5 animate-pulse text-black" />
                )}
              </div>
              <div className="min-w-0">
                <h3 className="text-sm sm:text-base font-extrabold text-white leading-tight">
                  {isMultiple ? `Incoming Transfer (${pendingOffers.length} files)` : 'Incoming File Transfer'}
                </h3>
                <p className="text-xs text-zinc-400 truncate">
                  From: <span className="text-white font-semibold">{firstSender}</span>
                  {isMultiple && ` • Total: ${formatBytes(totalBatchBytes)}`}
                </p>
              </div>
            </div>

            {/* File(s) List */}
            <div className="max-h-48 sm:max-h-60 overflow-y-auto space-y-2 p-1">
              {pendingOffers.map(({ transfer, fileOffer }) => (
                <div
                  key={transfer.id}
                  className="flex items-center justify-between p-3 rounded-xl bg-zinc-900/90 border border-white/10 text-xs gap-2"
                >
                  <div className="flex items-center space-x-2.5 min-w-0 flex-1">
                    <File className="w-5 h-5 text-white flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="font-semibold text-white truncate">{fileOffer.name}</p>
                      <p className="text-[10px] text-zinc-400 font-mono">{formatBytes(fileOffer.size)}</p>
                    </div>
                  </div>

                  {isMultiple && (
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button
                        onClick={() => transferManager.rejectTransfer(transfer.id)}
                        className="px-2 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[10px] font-medium"
                      >
                        ✕
                      </button>
                      <button
                        onClick={() => transferManager.acceptTransfer(transfer.id)}
                        className="px-2 py-1 rounded-lg bg-white hover:bg-zinc-200 text-black font-bold text-[10px]"
                      >
                        ✓
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2.5">
              <button
                onClick={() => transferManager.rejectAllPendingOffers()}
                className="flex-1 py-2.5 px-4 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 text-xs font-semibold border border-white/15 transition-all active:scale-95"
              >
                {isMultiple ? 'Decline All' : 'Decline'}
              </button>
              <button
                onClick={() => transferManager.acceptAllPendingOffers()}
                className="flex-1 py-2.5 px-4 rounded-xl bg-white hover:bg-zinc-200 text-black text-xs font-extrabold shadow-lg shadow-white/15 transition-all active:scale-95"
              >
                {isMultiple ? `Accept All (${pendingOffers.length})` : 'Accept & Download'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 2. Active Transfer Drawer (Bottom, full-width on mobile, right-anchored on desktop) ── */}
      {activeTransfers.length > 0 && (
        <div className="fixed bottom-14 md:bottom-5 left-0 right-0 sm:left-auto sm:right-4 z-40 sm:w-80 md:w-96 pointer-events-auto">
          {/* Collapse toggle bar (mobile only) */}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="sm:hidden w-full flex items-center justify-between px-4 py-2.5 bg-zinc-950/95 border-t border-white/15 text-xs font-mono text-zinc-300"
          >
            <span className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
              <span>{activeTransfers.length} Active Transfer{activeTransfers.length > 1 ? 's' : ''}</span>
            </span>
            {collapsed ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          {!collapsed && (
            <div className="max-h-[55vh] sm:max-h-[70vh] overflow-y-auto space-y-2 p-2 sm:p-0 sm:space-y-3 bg-zinc-950/95 sm:bg-transparent border-t border-white/10 sm:border-none">
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
                    className="p-3.5 sm:p-4 rounded-xl sm:rounded-2xl mono-panel border border-white/20 shadow-2xl space-y-2.5 animate-slide-up"
                  >
                    {/* Row 1: filename + status badge + close */}
                    <div className="flex items-center gap-2">
                      {isSender ? (
                        <ArrowUpRight className="w-3.5 h-3.5 text-white flex-shrink-0" />
                      ) : (
                        <ArrowDownLeft className="w-3.5 h-3.5 text-white flex-shrink-0" />
                      )}
                      <span className="text-xs font-bold text-white truncate flex-1 min-w-0">
                        {t.fileName || 'Transfer'}
                      </span>
                      <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-full bg-white/10 text-white border border-white/20 font-bold whitespace-nowrap flex-shrink-0">
                        {isSender ? 'UP' : 'DOWN'}
                      </span>
                      <button
                        onClick={() => transferManager.cancelTransfer(t.id)}
                        className="p-0.5 rounded text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors flex-shrink-0"
                        title="Cancel Transfer"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>

                    {/* Row 2: transport badge + peer name */}
                    <div className="flex items-center justify-between gap-2">
                      {renderTransportBadge(t.transportMode)}
                      <span className="text-zinc-500 font-mono text-[9px] truncate text-right min-w-0">
                        {isSender ? `→ ${t.receiverName}` : `← ${t.senderName}`}
                      </span>
                    </div>

                    {/* Row 3: Progress / Status */}
                    {isPendingAccept ? (
                      <div className="flex items-center gap-2 text-[10px] text-zinc-400 font-mono">
                        <span className="animate-spin w-3 h-3 border border-white border-t-transparent rounded-full flex-shrink-0" />
                        <span>Awaiting confirmation...</span>
                      </div>
                    ) : isInterrupted ? (
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between p-2 rounded-lg bg-amber-500/10 border border-amber-500/25 text-amber-300 text-[10px] font-mono gap-2">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping flex-shrink-0" />
                            <span className="font-bold truncate">Interrupted · Resuming...</span>
                          </div>
                          <button
                            onClick={() => transferManager.restoreInFlightTransfers()}
                            className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-amber-400 hover:bg-amber-300 text-black text-[9px] font-extrabold transition-all flex-shrink-0"
                          >
                            <RefreshCw className="w-2.5 h-2.5" />
                            <span>Retry</span>
                          </button>
                        </div>
                        <div className="w-full h-1.5 rounded-full bg-zinc-900 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-amber-400 opacity-70 transition-all duration-300"
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        {/* Progress text */}
                        <div className="flex justify-between text-[10px] font-mono">
                          <span className="text-white font-extrabold flex items-center gap-1">
                            <span className="w-1 h-1 rounded-full bg-white animate-ping" />
                            {progress}%
                          </span>
                          <span className="text-zinc-400">
                            {formatBytes(t.bytesTransferred)}/{t.fileSize ? formatBytes(t.fileSize) : '?'}
                          </span>
                        </div>

                        {/* Progress bar */}
                        <div className="w-full h-2 rounded-full bg-zinc-900 overflow-hidden border border-white/10 p-px">
                          <div
                            className="h-full rounded-full bg-white relative overflow-hidden transition-all duration-150 shadow-[0_0_8px_rgba(255,255,255,0.6)]"
                            style={{ width: `${progress}%` }}
                          >
                            <div className="absolute inset-0 animate-mono-shimmer" />
                          </div>
                        </div>

                        {/* Speed & ETA */}
                        <div className="flex items-center justify-between text-[9px] font-mono text-zinc-500 pt-0.5">
                          <span className="flex items-center gap-1 text-zinc-300">
                            <Gauge className="w-2.5 h-2.5 text-white" />
                            {t.speed ? `${formatBytes(t.speed)}/s` : 'Measuring...'}
                          </span>
                          <span className="flex items-center gap-1 text-zinc-300">
                            <Clock className="w-2.5 h-2.5 text-white" />
                            {t.eta ? `~${t.eta}s` : '—'}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </>
  );
};
