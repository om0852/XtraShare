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
  ChevronUp,
  Download,
  CheckCircle2,
  Share2,
  Globe,
  AlertTriangle
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
  const [showAllCards, setShowAllCards] = useState(false);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

  // Active ongoing and recently completed transfers
  const activeTransfers = Array.from(transfers.values()).filter(
    (t) =>
      !dismissedIds.has(t.id) &&
      (t.status === 'transferring' ||
        t.status === 'offered' ||
        t.status === 'accepted' ||
        t.status === 'interrupted' ||
        t.status === 'completed')
  );

  const totalBatchFiles = activeTransfers.length;
  const completedTransfers = activeTransfers.filter((t) => t.status === 'completed');
  const transferringTransfers = activeTransfers.filter((t) => t.status === 'transferring');
  const queuedTransfers = activeTransfers.filter((t) => t.status === 'accepted' || t.status === 'offered');
  const totalBatchBytes = activeTransfers.reduce((acc, t) => acc + (t.fileSize || 0), 0);
  const transferredBatchBytes = activeTransfers.reduce((acc, t) => acc + (t.bytesTransferred || 0), 0);
  const overallProgress =
    totalBatchBytes > 0
      ? Math.min(100, Math.round((transferredBatchBytes / totalBatchBytes) * 100))
      : completedTransfers.length === totalBatchFiles && totalBatchFiles > 0
      ? 100
      : 0;
  const activeBatchSpeed = transferringTransfers.reduce((acc, t) => acc + (t.speed || 0), 0);

  const displayedTransfers =
    showAllCards || activeTransfers.length <= 4
      ? activeTransfers
      : [
          ...activeTransfers.filter((t) => t.status === 'transferring' || t.status === 'interrupted'),
          ...activeTransfers.filter((t) => t.status !== 'transferring' && t.status !== 'interrupted')
        ].slice(0, 4);

  const dismissAllCompleted = () => {
    setDismissedIds((prev) => {
      const next = new Set(prev);
      completedTransfers.forEach((t) => next.add(t.id));
      return next;
    });
  };

  const hasOffers = pendingOffers.length > 0;
  const isMultiple = pendingOffers.length > 1;
  const totalPendingBytes = pendingOffers.reduce((acc, o) => acc + o.fileOffer.size, 0);
  const firstSender = pendingOffers[0]?.transfer.senderName || 'Peer';
  const displayedPendingOffers = pendingOffers.slice(0, 10);
  const remainingPendingCount = pendingOffers.length - displayedPendingOffers.length;

  const renderTransportBadge = (mode?: string) => {
    switch (mode) {
      case 'lan-p2p':
        return (
          <span
            className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-[9px] font-mono font-bold whitespace-nowrap shadow-[0_0_10px_rgba(16,185,129,0.15)]"
            title="Direct Local Wi-Fi transfer. Uses 0 MB Internet Data."
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_#34d399]" />
            <Wifi className="w-2.5 h-2.5" />
            <span>Direct LAN (0 MB Data)</span>
          </span>
        );
      case 'webrtc-p2p':
        return (
          <span
            className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-400 border border-sky-500/30 text-[9px] font-mono font-bold whitespace-nowrap shadow-[0_0_10px_rgba(14,165,233,0.15)]"
            title="Direct peer-to-peer connection across public internet."
          >
            <span className="w-1.5 h-1.5 rounded-full bg-sky-400 shadow-[0_0_6px_#38bdf8]" />
            <Globe className="w-2.5 h-2.5" />
            <span>Internet P2P (Using Data)</span>
          </span>
        );
      case 'turn-relay':
        return (
          <span
            className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30 text-[9px] font-mono font-bold whitespace-nowrap shadow-[0_0_10px_rgba(245,158,11,0.2)]"
            title="Relayed via TURN server over internet."
          >
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse shadow-[0_0_6px_#fbbf24]" />
            <Cloud className="w-2.5 h-2.5" />
            <span>TURN Relay (Using Data)</span>
          </span>
        );
      case 'websocket-relay':
        return (
          <span
            className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/35 text-[9px] font-mono font-bold whitespace-nowrap shadow-[0_0_10px_rgba(245,158,11,0.25)]"
            title="Direct P2P blocked by hotspot/firewall. Transferring through cloud server over internet."
          >
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse shadow-[0_0_8px_#fbbf24]" />
            <Server className="w-2.5 h-2.5" />
            <span>Cloud Relay (Using Mobile Data)</span>
          </span>
        );
      default:
        return (
          <span
            className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 border border-white/10 text-[9px] font-mono font-bold whitespace-nowrap"
            title="Detecting transfer route..."
          >
            <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 animate-pulse" />
            <span>Detecting Route...</span>
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
                  {isMultiple && ` • Total: ${formatBytes(totalPendingBytes)}`}
                </p>
              </div>
            </div>

            {/* File(s) List */}
            <div className="max-h-48 sm:max-h-60 overflow-y-auto space-y-2 p-1">
              {displayedPendingOffers.map(({ transfer, fileOffer }) => (
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

              {remainingPendingCount > 0 && (
                <div className="p-2.5 rounded-xl bg-zinc-900/60 border border-white/10 text-center text-[11px] font-mono text-zinc-400">
                  + {remainingPendingCount} more files ({formatBytes(pendingOffers.slice(10).reduce((acc, o) => acc + o.fileOffer.size, 0))})
                </div>
              )}
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
              <span>{activeTransfers.length} Transfer{activeTransfers.length > 1 ? 's' : ''}</span>
            </span>
            {collapsed ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          {!collapsed && (
            <div className="max-h-[55vh] sm:max-h-[70vh] overflow-y-auto space-y-2 p-2 sm:p-0 sm:space-y-3 bg-zinc-950/95 sm:bg-transparent border-t border-white/10 sm:border-none">
              {/* Batch Transfer Summary Card (when > 3 transfers) */}
              {activeTransfers.length > 3 && (
                <div className="p-3.5 sm:p-4 rounded-xl sm:rounded-2xl mono-panel border border-white/25 shadow-2xl space-y-2.5 bg-zinc-950/95 animate-slide-up">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Files className="w-4 h-4 text-white" />
                      <span className="text-xs font-extrabold text-white">
                        Batch Progress ({completedTransfers.length}/{totalBatchFiles})
                      </span>
                    </div>
                    {activeBatchSpeed > 0 && (
                      <span className="flex items-center gap-1 font-mono text-[10px] text-emerald-400 font-bold">
                        <Gauge className="w-3 h-3" />
                        <span>{formatBytes(activeBatchSpeed)}/s</span>
                      </span>
                    )}
                  </div>

                  {/* Overall progress bar */}
                  <div className="space-y-1">
                    <div className="w-full bg-zinc-800 rounded-full h-1.5 overflow-hidden">
                      <div
                        className="bg-white h-1.5 rounded-full transition-all duration-300 shadow-[0_0_10px_rgba(255,255,255,0.4)]"
                        style={{ width: `${overallProgress}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-[10px] font-mono text-zinc-400">
                      <span>{formatBytes(transferredBatchBytes)} of {formatBytes(totalBatchBytes)}</span>
                      <span className="text-white font-bold">{overallProgress}%</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1 border-t border-white/10 text-[10px]">
                    <span className="text-zinc-400 font-mono">
                      {transferringTransfers.length > 0 ? `${transferringTransfers.length} active` : 'Queue idle'}
                      {queuedTransfers.length > 0 ? ` • ${queuedTransfers.length} queued` : ''}
                    </span>
                    <div className="flex items-center gap-2">
                      {completedTransfers.length > 0 && (
                        <button
                          onClick={dismissAllCompleted}
                          className="text-zinc-400 hover:text-white transition-colors underline decoration-white/30"
                        >
                          Clear done ({completedTransfers.length})
                        </button>
                      )}
                      {activeTransfers.length > 4 && (
                        <button
                          onClick={() => setShowAllCards(!showAllCards)}
                          className="text-white hover:underline font-semibold"
                        >
                          {showAllCards ? 'Compact' : `Show all (${activeTransfers.length})`}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {displayedTransfers.map((t) => {
                const isSender = t.senderId === selfDevice?.id;
                const isCompleted = t.status === 'completed';
                const progress =
                  t.fileSize && t.fileSize > 0
                    ? Math.min(100, Math.round((t.bytesTransferred / t.fileSize) * 100))
                    : isCompleted ? 100 : 0;

                const isPendingAccept = t.status === 'offered';
                const isInterrupted = t.status === 'interrupted';

                return (
                  <div
                    key={t.id}
                    className="p-3.5 sm:p-4 rounded-xl sm:rounded-2xl mono-panel border border-white/20 shadow-2xl space-y-2.5 animate-slide-up"
                  >
                    {/* Row 1: filename + status badge + close */}
                    <div className="flex items-center gap-2">
                      {isCompleted ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                      ) : isSender ? (
                        <ArrowUpRight className="w-3.5 h-3.5 text-white flex-shrink-0" />
                      ) : (
                        <ArrowDownLeft className="w-3.5 h-3.5 text-white flex-shrink-0" />
                      )}
                      <span className="text-xs font-bold text-white truncate flex-1 min-w-0">
                        {t.fileName || 'Transfer'}
                      </span>
                      <span
                        className={`text-[9px] font-mono px-1.5 py-0.5 rounded-full font-bold whitespace-nowrap flex-shrink-0 ${
                          isCompleted
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                            : 'bg-white/10 text-white border border-white/20'
                        }`}
                      >
                        {isCompleted ? (isSender ? 'SENT' : 'RECEIVED') : isSender ? 'UP' : 'DOWN'}
                      </span>
                      <button
                        onClick={() => {
                          if (isCompleted) {
                            setDismissedIds((prev) => new Set(prev).add(t.id));
                          } else {
                            transferManager.cancelTransfer(t.id);
                          }
                        }}
                        className="p-0.5 rounded text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors flex-shrink-0"
                        title={isCompleted ? 'Dismiss' : 'Cancel Transfer'}
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
                    {isCompleted ? (
                      <div className="space-y-2 pt-0.5">
                        <div className="flex items-center justify-between p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-300 text-xs">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
                            <span className="font-bold truncate text-[11px]">
                              {isSender ? 'Transfer Completed' : 'Received Successfully!'}
                            </span>
                          </div>
                          <span className="font-mono text-[10px] text-emerald-400 font-semibold flex-shrink-0">
                            {formatBytes(t.fileSize || t.bytesTransferred)}
                          </span>
                        </div>

                        {!isSender && t.downloadUrl && (
                          <div className="flex items-center gap-2">
                            <a
                              href={t.downloadUrl}
                              download={t.fileName || 'download'}
                              className="flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-white hover:bg-zinc-200 text-black text-xs font-black shadow-lg shadow-white/20 transition-all active:scale-95"
                            >
                              <Download className="w-4 h-4 text-black" />
                              <span>Save File</span>
                            </a>
                            {typeof navigator !== 'undefined' && typeof navigator.share === 'function' && (
                              <button
                                onClick={async () => {
                                  try {
                                    const resp = await fetch(t.downloadUrl!);
                                    const blob = await resp.blob();
                                    const file = new window.File([blob], t.fileName || 'file', { type: t.mimeType });
                                    if (navigator.canShare && navigator.canShare({ files: [file] })) {
                                      await navigator.share({ files: [file], title: t.fileName });
                                    } else {
                                      await navigator.share({ title: t.fileName, url: t.downloadUrl });
                                    }
                                  } catch (e) {
                                    console.warn('Share not completed:', e);
                                  }
                                }}
                                className="p-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-white/15 transition-all flex-shrink-0 active:scale-95"
                                title="Share or Open in App"
                              >
                                <Share2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    ) : isPendingAccept ? (
                      <div className="flex items-center gap-2 text-[10px] text-zinc-400 font-mono">
                        <span className="animate-spin w-3 h-3 border border-white border-t-transparent rounded-full flex-shrink-0" />
                        <span>Awaiting confirmation...</span>
                      </div>
                    ) : isInterrupted ? (
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between p-2 rounded-lg bg-amber-500/10 border border-amber-500/25 text-amber-300 text-[10px] font-mono gap-2">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping flex-shrink-0" />
                            <span className="font-bold truncate">Interrupted · {isSender ? 'Awaiting receiver...' : 'Resuming...'}</span>
                          </div>
                          <button
                            onClick={() => {
                              if (isSender) {
                                // Sender: resolve receiver device ID dynamically if recipient reconnected
                                const devices = useDeviceStore.getState().devices;
                                const targetPeer = devices.get(t.receiverId) || Array.from(devices.values()).find((d) => d.name === t.receiverName);
                                const targetId = targetPeer ? targetPeer.id : t.receiverId;

                                if (targetPeer && targetPeer.id !== t.receiverId) {
                                  useTransferStore.getState().updateTransfer(t.id, { receiverId: targetPeer.id });
                                }

                                useTransferStore.getState().updateTransfer(t.id, {
                                  status: 'transferring',
                                  error: undefined
                                });

                                // Ask receiver where they left off, then resume from there
                                transferManager.sendControlMessage(targetId, {
                                  type: 'file-resume-check',
                                  transferId: t.id,
                                  timestamp: Date.now(),
                                  payload: {}
                                });
                              } else {
                                // Receiver: restore in-flight from IndexedDB and reconnect
                                transferManager.restoreInFlightTransfers();
                              }
                            }}
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

                        {/* Network Internet Status Light Indicator */}
                        {(t.transportMode === 'websocket-relay' || t.transportMode === 'turn-relay') && (
                          <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[9px] font-mono">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse flex-shrink-0 shadow-[0_0_6px_#fbbf24]" />
                            <AlertTriangle className="w-2.5 h-2.5 text-amber-400 flex-shrink-0" />
                            <span className="truncate">Using Mobile / Internet Data (Cloud Relay)</span>
                          </div>
                        )}
                        {t.transportMode === 'lan-p2p' && (
                          <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-[9px] font-mono">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0 shadow-[0_0_6px_#34d399]" />
                            <span className="truncate">Direct Local Wi-Fi • 0 MB Internet Data</span>
                          </div>
                        )}
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
