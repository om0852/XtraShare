import React, { useEffect } from 'react';
import { ArrowUpRight, ArrowDownLeft, CheckCircle2, XCircle, Clock, Trash2, Download } from 'lucide-react';
import { formatBytes } from '@xtrashare/protocol';
import { useTransferStore } from '../store/transferStore.js';
import { useDeviceStore } from '../store/deviceStore.js';

export const TransferHistory: React.FC = () => {
  const history = useTransferStore((state) => state.history);
  const transfers = useTransferStore((state) => state.transfers);
  const loadHistory = useTransferStore((state) => state.loadHistory);
  const clearHistory = useTransferStore((state) => state.clearHistory);
  const selfDevice = useDeviceStore((state) => state.selfDevice);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return (
          <span className="flex items-center space-x-1 text-white bg-white/15 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold border border-white/30 shadow-[0_0_10px_rgba(255,255,255,0.1)]">
            <CheckCircle2 className="w-3 h-3 text-white" />
            <span>COMPLETED</span>
          </span>
        );
      case 'rejected':
        return (
          <span className="flex items-center space-x-1 text-zinc-400 bg-zinc-900 px-2.5 py-0.5 rounded-full text-[10px] font-mono border border-white/10">
            <XCircle className="w-3 h-3 text-zinc-400" />
            <span>DECLINED</span>
          </span>
        );
      case 'failed':
      case 'cancelled':
        return (
          <span className="flex items-center space-x-1 text-zinc-400 bg-zinc-900 px-2.5 py-0.5 rounded-full text-[10px] font-mono border border-white/10">
            <XCircle className="w-3 h-3 text-zinc-400" />
            <span>CANCELLED</span>
          </span>
        );
      default:
        return (
          <span className="flex items-center space-x-1 text-black bg-white px-2.5 py-0.5 rounded-full text-[10px] font-mono font-extrabold shadow-sm animate-pulse">
            <Clock className="w-3 h-3 text-black" />
            <span>{status.toUpperCase()}</span>
          </span>
        );
    }
  };

  return (
    <div className="w-full max-w-4xl 2xl:max-w-5xl mx-auto my-6 space-y-4">
      <div className="p-6 sm:p-7 rounded-3xl mono-panel border border-white/15 shadow-xl space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-extrabold text-white">Transfer History ({history.length})</h3>
            <p className="text-xs text-zinc-400">Past sent and received files stored securely in browser</p>
          </div>

          {history.length > 0 && (
            <button
              onClick={clearHistory}
              className="flex items-center space-x-1 text-xs text-zinc-400 hover:text-white transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clear History</span>
            </button>
          )}
        </div>

        {history.length === 0 ? (
          <div className="py-12 text-center text-zinc-500 text-xs">
            No transfers recorded yet. Drop files or select a peer to begin!
          </div>
        ) : (
          <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
            {history.map((t) => {
              const isSender = t.senderId === selfDevice?.id;
              const liveTransfer = transfers.get(t.id);
              const downloadUrl = liveTransfer?.downloadUrl || t.downloadUrl;
              const canDownload = !isSender && t.status === 'completed' && Boolean(downloadUrl);

              return (
                <div
                  key={t.id}
                  className="flex items-center justify-between p-3.5 rounded-2xl mono-card border border-white/10 text-xs transition-all hover:bg-zinc-900"
                >
                  <div className="flex items-center space-x-3 truncate">
                    <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-black border border-white/15 flex-shrink-0">
                      {isSender ? (
                        <ArrowUpRight className="w-4 h-4 text-white" />
                      ) : (
                        <ArrowDownLeft className="w-4 h-4 text-zinc-400" />
                      )}
                    </div>

                    <div className="truncate">
                      <p className="text-white font-bold truncate">{t.fileName || t.textContent || 'File'}</p>
                      <p className="text-[11px] text-zinc-400 font-mono">
                        {isSender ? `To: ${t.receiverName}` : `From: ${t.senderName}`} •{' '}
                        {t.fileSize ? formatBytes(t.fileSize) : 'Text'} •{' '}
                        {new Date(t.startedAt || Date.now()).toLocaleTimeString()}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                    {canDownload && (
                      <a
                        href={downloadUrl}
                        download={t.fileName || 'download'}
                        className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-white hover:bg-zinc-200 text-black text-xs font-bold shadow-md shadow-white/10 transition-all active:scale-95"
                        title="Save File"
                      >
                        <Download className="w-3.5 h-3.5 text-black" />
                        <span>Save</span>
                      </a>
                    )}
                    {getStatusBadge(t.status)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
