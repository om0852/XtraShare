import React, { useState, useRef } from 'react';
import { UploadCloud, File, Folder, X, Send, AlertCircle, CheckCircle2 } from 'lucide-react';
import { formatBytes } from '@xtrashare/protocol';
import { useDeviceStore } from '../store/deviceStore.js';
import { transferManager } from '../services/transferManager.js';

export const DropZone: React.FC = () => {
  const [isDragOver, setIsDragOver] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [sentSuccess, setSentSuccess] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const devices = useDeviceStore((state) => state.devices);
  const targetDeviceId = useDeviceStore((state) => state.targetDeviceId);
  const setTargetDeviceId = useDeviceStore((state) => state.setTargetDeviceId);

  const deviceList = Array.from(devices.values());
  const targetDevice = targetDeviceId ? devices.get(targetDeviceId) : null;

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      addFiles(Array.from(e.dataTransfer.files));
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      addFiles(Array.from(e.target.files));
    }
  };

  const handleFolderInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      addFiles(Array.from(e.target.files));
    }
  };

  const addFiles = (newFiles: File[]) => {
    setSelectedFiles((prev) => [...prev, ...newFiles]);
    setErrorMessage(null);
  };

  const removeFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSend = async () => {
    if (selectedFiles.length === 0) {
      setErrorMessage('Please select at least one file to send');
      return;
    }

    if (!targetDeviceId) {
      setErrorMessage('Please select a target device to send to');
      return;
    }

    setIsSending(true);
    setErrorMessage(null);

    try {
      for (const file of selectedFiles) {
        await transferManager.offerFile(targetDeviceId, file);
      }
      setSelectedFiles([]);
      setSentSuccess(true);
      setTimeout(() => setSentSuccess(false), 3000);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to initiate transfer');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="w-full max-w-4xl 2xl:max-w-5xl mx-auto my-6 space-y-4">
      {/* Drag & Drop Area */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`relative flex flex-col items-center justify-center p-8 sm:p-10 rounded-3xl border-2 border-dashed cursor-pointer transition-all duration-300 ${
          isDragOver
            ? 'border-white bg-white/10 scale-[1.01] shadow-2xl mono-border-glow'
            : 'border-white/15 bg-zinc-950/70 hover:border-white/40 hover:bg-zinc-900/60'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          onChange={handleFileInput}
          className="hidden"
        />
        <input
          ref={folderInputRef}
          type="file"
          // @ts-expect-error webkitdirectory is standard in browsers but non-standard TS attribute
          webkitdirectory=""
          directory=""
          multiple
          onChange={handleFolderInput}
          className="hidden"
        />

        <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-white/10 text-white mb-4 group-hover:scale-110 transition-transform shadow-inner">
          <UploadCloud className="w-8 h-8 text-white" />
        </div>

        <h3 className="text-base sm:text-lg font-bold text-white text-center">
          Drop files or folders here, or{' '}
          <span className="underline decoration-white/40 underline-offset-4 hover:decoration-white transition-all">browse files</span>
        </h3>
        <p className="text-xs text-zinc-400 mt-1.5 text-center max-w-md">
          Direct P2P streaming for any file type (PDFs, Videos, Photos, Code, ZIPs) with zero cloud upload
        </p>

        {/* Buttons for picking files vs folders */}
        <div className="mt-5 flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center space-x-1.5 px-3.5 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-white/15 text-xs text-zinc-200 hover:text-white transition-colors"
          >
            <File className="w-3.5 h-3.5 text-white" />
            <span>Select Files</span>
          </button>
          <button
            type="button"
            onClick={() => folderInputRef.current?.click()}
            className="flex items-center space-x-1.5 px-3.5 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-white/15 text-xs text-zinc-200 hover:text-white transition-colors"
          >
            <Folder className="w-3.5 h-3.5 text-white" />
            <span>Select Folder</span>
          </button>
        </div>
      </div>

      {/* Selected Files List & Recipient Bar */}
      {selectedFiles.length > 0 && (
        <div className="p-5 sm:p-6 rounded-3xl mono-panel border border-white/15 space-y-4 animate-fade-in shadow-2xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono font-bold text-white tracking-wide">
              SELECTED ({selectedFiles.length}) • TOTAL: {formatBytes(selectedFiles.reduce((acc, f) => acc + f.size, 0))}
            </span>
            <button
              onClick={() => setSelectedFiles([])}
              className="text-xs font-semibold text-zinc-400 hover:text-white transition-colors"
            >
              Clear all
            </button>
          </div>

          {/* Files Tags List */}
          <div className="max-h-48 overflow-y-auto space-y-2 pr-1">
            {selectedFiles.map((file, i) => (
              <div
                key={i}
                className="flex items-center justify-between p-3 rounded-2xl bg-zinc-900/80 border border-white/10 text-xs"
              >
                <div className="flex items-center space-x-3 truncate">
                  <File className="w-4 h-4 text-white flex-shrink-0" />
                  <span className="text-white font-medium truncate">{file.name}</span>
                  <span className="text-zinc-400 font-mono text-[11px] flex-shrink-0">({formatBytes(file.size)})</span>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removeFile(i);
                  }}
                  className="p-1 rounded text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>

          {/* Target Device Selector & Send Button */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-3 border-t border-white/10">
            <div className="flex items-center space-x-2">
              <span className="text-xs text-zinc-400 font-medium">Recipient:</span>
              <select
                value={targetDeviceId || ''}
                onChange={(e) => setTargetDeviceId(e.target.value || null)}
                className="bg-zinc-900 border border-white/20 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-white font-semibold"
              >
                <option value="">-- Choose Discovered Device --</option>
                {deviceList.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({d.platform})
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={handleSend}
              disabled={isSending || !targetDeviceId}
              className={`flex items-center justify-center space-x-2 px-6 py-2.5 rounded-xl text-xs font-bold transition-all shadow-lg ${
                targetDeviceId
                  ? 'bg-white hover:bg-zinc-200 text-black shadow-white/15 active:scale-95'
                  : 'bg-zinc-800 text-zinc-500 cursor-not-allowed border border-white/5'
              }`}
            >
              <Send className="w-4 h-4 text-black" />
              <span>{isSending ? 'Sending Offer...' : `Send to ${targetDevice ? targetDevice.name : 'Peer'}`}</span>
            </button>
          </div>

          {errorMessage && (
            <div className="flex items-center space-x-2 text-rose-400 text-xs mt-2 font-medium">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {sentSuccess && (
            <div className="flex items-center space-x-2 text-emerald-400 text-xs mt-2 font-medium">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              <span>Offers sent! Waiting for peer confirmation...</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
