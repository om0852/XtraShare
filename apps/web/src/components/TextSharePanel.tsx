import React, { useState } from 'react';
import { Send, FileText, Check, Copy } from 'lucide-react';
import { useDeviceStore } from '../store/deviceStore.js';
import { transferManager } from '../services/transferManager.js';
import { useTransferStore } from '../store/transferStore.js';

export const TextSharePanel: React.FC = () => {
  const [text, setText] = useState('');
  const [targetId, setTargetId] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const devices = useDeviceStore((state) => state.devices);
  const targetDeviceId = useDeviceStore((state) => state.targetDeviceId);
  const transfers = useTransferStore((state) => state.transfers);

  const deviceList = Array.from(devices.values());
  const selectedTarget = targetId || targetDeviceId || (deviceList[0]?.id ?? '');

  // Filter text messages
  const textMessages = Array.from(transfers.values())
    .filter((t) => t.type === 'text')
    .sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0));

  const handleSendText = () => {
    if (!text.trim() || !selectedTarget) return;
    transferManager.sendText(selectedTarget, text.trim());
    setText('');
  };

  const handleCopy = (id: string, content: string) => {
    navigator.clipboard.writeText(content);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="w-full max-w-4xl 2xl:max-w-5xl mx-auto my-6 space-y-6">
      {/* Compose Box */}
      <div className="p-6 sm:p-7 rounded-3xl mono-panel border border-white/15 space-y-4 shadow-xl">
        <div className="flex items-center space-x-3.5">
          <div className="flex items-center justify-center w-11 h-11 rounded-2xl bg-white text-black shadow-[0_0_20px_rgba(255,255,255,0.2)]">
            <FileText className="w-5 h-5 text-black" />
          </div>
          <div>
            <h3 className="text-base font-extrabold text-white">Quick Text & Link Share</h3>
            <p className="text-xs text-zinc-400">Send snippets, URLs, or notes directly to a peer</p>
          </div>
        </div>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Paste or type text, link, code snippet, or command here..."
          rows={4}
          className="w-full p-4 rounded-2xl bg-zinc-950 border border-white/15 text-white placeholder-zinc-500 text-xs focus:outline-none focus:border-white font-mono resize-none"
        />

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="flex items-center space-x-2">
            <span className="text-xs text-zinc-400 font-medium">Send to:</span>
            <select
              value={selectedTarget}
              onChange={(e) => setTargetId(e.target.value)}
              className="bg-zinc-900 border border-white/20 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-white font-semibold"
            >
              {deviceList.length === 0 && <option value="">No peers online</option>}
              {deviceList.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.platform})
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={handleSendText}
            disabled={!text.trim() || !selectedTarget}
            className={`flex items-center justify-center space-x-2 px-6 py-2.5 rounded-xl text-xs font-extrabold shadow-lg transition-all ${
              text.trim() && selectedTarget
                ? 'bg-white hover:bg-zinc-200 text-black shadow-white/15 active:scale-95'
                : 'bg-zinc-900 text-zinc-600 cursor-not-allowed border border-white/5'
            }`}
          >
            <Send className="w-4 h-4 text-black" />
            <span>Send Text</span>
          </button>
        </div>
      </div>

      {/* Shared Text Messages Feed */}
      {textMessages.length > 0 && (
        <div className="p-6 sm:p-7 rounded-3xl mono-panel border border-white/15 space-y-3 shadow-xl">
          <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-400 font-mono">
            Recent Text Transferred
          </h4>

          <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
            {textMessages.map((msg) => (
              <div
                key={msg.id}
                className="p-4 rounded-2xl mono-card border border-white/10 space-y-2 text-xs"
              >
                <div className="flex items-center justify-between text-[11px] text-zinc-400 font-mono">
                  <span>
                    From: <strong className="text-white">{msg.senderName}</strong>
                  </span>
                  <span>{new Date(msg.startedAt || Date.now()).toLocaleTimeString()}</span>
                </div>

                <pre className="p-3 rounded-xl bg-black text-zinc-200 font-mono text-xs whitespace-pre-wrap break-all border border-white/10">
                  {msg.textContent}
                </pre>

                <div className="flex justify-end">
                  <button
                    onClick={() => handleCopy(msg.id, msg.textContent || '')}
                    className="flex items-center space-x-1 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white text-[11px] font-semibold border border-white/10 transition-colors"
                  >
                    {copiedId === msg.id ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-white" />
                        <span className="text-white">Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5 text-zinc-400" />
                        <span>Copy</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
