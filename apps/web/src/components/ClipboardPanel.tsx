import React, { useState } from 'react';
import { Clipboard, Copy, Check, ArrowUpRight, ArrowDownLeft, AlertCircle } from 'lucide-react';
import { useClipboardStore } from '../store/clipboardStore.js';
import { clipboardManager } from '../services/clipboardManager.js';

export const ClipboardPanel: React.FC = () => {
  const items = useClipboardStore((state) => state.items);
  const clearItems = useClipboardStore((state) => state.clearItems);

  const [isSending, setIsSending] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ text: string; error?: boolean } | null>(null);

  const handleSendClipboard = async () => {
    setIsSending(true);
    setStatusMessage(null);

    const result = await clipboardManager.sendClipboard();
    setIsSending(false);

    if (result.success) {
      setStatusMessage({ text: 'Clipboard broadcast to connected peers!' });
      setTimeout(() => setStatusMessage(null), 3000);
    } else {
      setStatusMessage({ text: result.error || 'Failed to read clipboard', error: true });
    }
  };

  const handleCopyItem = async (id: string, text: string) => {
    const ok = await clipboardManager.copyToClipboard(text);
    if (ok) {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  return (
    <div className="w-full max-w-4xl 2xl:max-w-5xl mx-auto my-6 space-y-6">
      {/* Top Action Card */}
      <div className="p-6 sm:p-7 rounded-3xl mono-panel border border-white/15 space-y-4 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center space-x-3.5">
            <div className="flex items-center justify-center w-11 h-11 rounded-2xl bg-white text-black shadow-[0_0_20px_rgba(255,255,255,0.2)]">
              <Clipboard className="w-5 h-5 text-black" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-white">Cross-Device Clipboard</h3>
              <p className="text-xs text-zinc-400">Instantly share clipboard text across devices with loop prevention</p>
            </div>
          </div>

          <button
            onClick={handleSendClipboard}
            disabled={isSending}
            className="flex items-center justify-center space-x-2 px-6 py-2.5 rounded-xl bg-white hover:bg-zinc-200 text-black text-xs font-extrabold shadow-lg shadow-white/15 transition-all active:scale-95 disabled:opacity-50"
          >
            <Clipboard className="w-4 h-4 text-black" />
            <span>{isSending ? 'Reading...' : 'Send My Clipboard'}</span>
          </button>
        </div>

        {statusMessage && (
          <div
            className={`p-3 rounded-xl text-xs flex items-center space-x-2 ${
              statusMessage.error
                ? 'bg-zinc-900 text-zinc-300 border border-white/30'
                : 'bg-zinc-900 text-white border border-white/40 font-semibold'
            }`}
          >
            {statusMessage.error ? <AlertCircle className="w-4 h-4 text-zinc-400" /> : <Check className="w-4 h-4 text-white" />}
            <span>{statusMessage.text}</span>
          </div>
        )}
      </div>

      {/* Synced Clipboard History */}
      <div className="p-6 sm:p-7 rounded-3xl mono-panel border border-white/15 space-y-4 shadow-xl">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-400 font-mono">
            Clipboard History ({items.length})
          </h4>
          {items.length > 0 && (
            <button
              onClick={clearItems}
              className="text-xs font-semibold text-zinc-400 hover:text-white transition-colors"
            >
              Clear History
            </button>
          )}
        </div>

        {items.length === 0 ? (
          <div className="py-10 text-center text-zinc-500 text-xs">
            No clipboard items shared yet. Click "Send My Clipboard" to broadcast copied text.
          </div>
        ) : (
          <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
            {items.map((item) => (
              <div
                key={item.id}
                className="p-4 rounded-2xl mono-card border border-white/10 space-y-2 text-xs"
              >
                <div className="flex items-center justify-between text-[11px] text-zinc-400 font-mono">
                  <div className="flex items-center space-x-1.5">
                    {item.type === 'sent' ? (
                      <ArrowUpRight className="w-3.5 h-3.5 text-white" />
                    ) : (
                      <ArrowDownLeft className="w-3.5 h-3.5 text-zinc-400" />
                    )}
                    <span>
                      {item.type === 'sent' ? 'You sent' : `From ${item.sourceDeviceName}`}
                    </span>
                  </div>
                  <span>{new Date(item.timestamp).toLocaleTimeString()}</span>
                </div>

                <p className="p-3 rounded-xl bg-black text-zinc-200 font-mono text-xs whitespace-pre-wrap break-all border border-white/10 line-clamp-3">
                  {item.content}
                </p>

                <div className="flex justify-end">
                  <button
                    onClick={() => handleCopyItem(item.id, item.content)}
                    className="flex items-center space-x-1 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white text-[11px] font-semibold border border-white/10 transition-colors"
                  >
                    {copiedId === item.id ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-white" />
                        <span className="text-white">Copied to Clipboard!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5 text-zinc-400" />
                        <span>Copy to Clipboard</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
