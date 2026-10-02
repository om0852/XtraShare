import React, { useState } from 'react';
import { X, User, Palette, LogOut, Check } from 'lucide-react';
import { useUIStore } from '../store/uiStore.js';
import { useDeviceStore } from '../store/deviceStore.js';
import { socketService } from '../services/socket.js';

const AVATAR_PALETTE = [
  { name: 'Pure White', color: '#ffffff' },
  { name: 'Silver Zinc', color: '#d4d4d8' },
  { name: 'Neutral Gray', color: '#a1a1aa' },
  { name: 'Slate Gray', color: '#71717a' },
  { name: 'Charcoal', color: '#3f3f46' },
  { name: 'Deep Zinc', color: '#27272a' },
  { name: 'Obsidian Black', color: '#18181b' }
];

export const SettingsModal: React.FC = () => {
  const { isSettingsModalOpen, setSettingsModalOpen, currentRoomId } = useUIStore();
  const selfDevice = useDeviceStore((state) => state.selfDevice);

  const [name, setName] = useState(selfDevice?.name || '');
  const [selectedColor, setSelectedColor] = useState(selfDevice?.avatarColor || '#ffffff');
  const [isSaved, setIsSaved] = useState(false);

  if (!isSettingsModalOpen) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    localStorage.setItem('xtrashare_device_name', name.trim());
    localStorage.setItem('xtrashare_avatar_color', selectedColor);

    socketService.updateSelfDevice({
      name: name.trim(),
      avatarColor: selectedColor
    });

    if (selfDevice) {
      useDeviceStore.getState().setSelfDevice({
        ...selfDevice,
        name: name.trim(),
        avatarColor: selectedColor
      });
    }

    setIsSaved(true);
    setTimeout(() => {
      setIsSaved(false);
      setSettingsModalOpen(false);
    }, 1000);
  };

  const handleCreateNewRoom = async () => {
    try {
      await socketService.createRoom();
      setSettingsModalOpen(false);
    } catch (err) {
      console.warn('Error creating new room:', err);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in">
      <div className="w-full max-w-md p-6 sm:p-7 rounded-3xl mono-panel border border-white/20 shadow-2xl relative space-y-6">
        <button
          onClick={() => setSettingsModalOpen(false)}
          className="absolute top-5 right-5 p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <h3 className="text-base font-extrabold text-white flex items-center gap-2">
          <User className="w-5 h-5 text-white" />
          <span>Device & Room Settings</span>
        </h3>

        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="text-xs text-zinc-300 font-medium block mb-1.5">Device Display Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Om's MacBook Pro"
              className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-white/15 text-white text-xs focus:outline-none focus:border-white font-medium"
            />
          </div>

          <div>
            <label className="text-xs text-zinc-300 font-medium block mb-2 flex items-center gap-1.5">
              <Palette className="w-3.5 h-3.5 text-white" />
              <span>Avatar Monochrome Tone</span>
            </label>
            <div className="flex items-center space-x-3">
              {AVATAR_PALETTE.map((item) => (
                <button
                  type="button"
                  key={item.color}
                  onClick={() => setSelectedColor(item.color)}
                  className={`w-7 h-7 rounded-full border border-white/20 transition-transform ${
                    selectedColor === item.color ? 'scale-125 ring-2 ring-white ring-offset-2 ring-offset-black' : 'hover:scale-110'
                  }`}
                  style={{ backgroundColor: item.color }}
                  title={item.name}
                />
              ))}
            </div>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              className="w-full py-2.5 rounded-xl bg-white hover:bg-zinc-200 text-black text-xs font-extrabold shadow-lg shadow-white/15 transition-all active:scale-95 flex items-center justify-center space-x-1.5"
            >
              {isSaved ? <Check className="w-4 h-4 text-black" /> : null}
              <span>{isSaved ? 'Saved!' : 'Save Changes'}</span>
            </button>
          </div>
        </form>

        {/* Room Management */}
        <div className="pt-4 border-t border-white/10 space-y-3">
          <div className="flex items-center justify-between text-xs font-mono">
            <span className="text-zinc-400">Current Room:</span>
            <span className="font-bold text-white tracking-wider">{currentRoomId}</span>
          </div>

          <button
            onClick={handleCreateNewRoom}
            className="w-full py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-200 text-xs font-semibold border border-white/15 transition-colors flex items-center justify-center space-x-2"
          >
            <LogOut className="w-3.5 h-3.5 text-white" />
            <span>Generate New Clean Room</span>
          </button>
        </div>
      </div>
    </div>
  );
};
