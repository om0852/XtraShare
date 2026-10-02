import React, { useEffect } from 'react';
import { Header } from './components/Header.js';
import { AirDropRadar } from './components/AirDropRadar.js';
import { DeviceGrid } from './components/DeviceGrid.js';
import { DropZone } from './components/DropZone.js';
import { TransferModal } from './components/TransferModal.js';
import { TextSharePanel } from './components/TextSharePanel.js';
import { ClipboardPanel } from './components/ClipboardPanel.js';
import { TransferHistory } from './components/TransferHistory.js';
import { QRCodeModal } from './components/QRCodeModal.js';
import { QRScannerModal } from './components/QRScannerModal.js';
import { SettingsModal } from './components/SettingsModal.js';
import { socketService } from './services/socket.js';
import { useUIStore } from './store/uiStore.js';
import { useDeviceStore } from './store/deviceStore.js';
import { DeviceInfo } from '@xtrashare/protocol';
import { Laptop, Clock, Clipboard, FileText } from 'lucide-react';

export const App: React.FC = () => {
  const { activeTab, viewMode, setActiveTab } = useUIStore();
  const setTargetDeviceId = useDeviceStore((state) => state.setTargetDeviceId);

  useEffect(() => {
    socketService.connect();
  }, []);

  const handleSelectDevice = (device: DeviceInfo) => {
    setTargetDeviceId(device.id);
  };

  return (
    <div className="relative min-h-screen flex flex-col bg-black text-white selection:bg-white selection:text-black overflow-x-hidden pb-16 md:pb-8">
      {/* Subtle Monochrome Ambient Aura Glows */}
      <div
        className="ambient-glow bg-white/5 w-[500px] h-[500px] top-[-100px] left-[-100px]"
        aria-hidden="true"
      />
      <div
        className="ambient-glow bg-white/5 w-[600px] h-[600px] top-[30%] right-[-150px]"
        aria-hidden="true"
      />
      <div
        className="ambient-glow bg-white/5 w-[500px] h-[500px] bottom-[-100px] left-[20%]"
        aria-hidden="true"
      />

      {/* Main Top Header */}
      <Header />

      {/* Main Responsive Container (Mobile, Tablet, Laptop, 2XL Ultrawide) */}
      <main className="flex-1 w-full max-w-6xl 2xl:max-w-[1550px] mx-auto px-4 sm:px-6 lg:px-8 py-5 z-10">
        {activeTab === 'devices' && (
          <div className="space-y-6 2xl:space-y-0 2xl:grid 2xl:grid-cols-12 2xl:gap-8 items-start">
            {/* Visual Radar / Grid peer discovery view */}
            <div className="2xl:col-span-7">
              {viewMode === 'radar' ? (
                <AirDropRadar onSelectDeviceForTransfer={handleSelectDevice} />
              ) : (
                <DeviceGrid onSelectDeviceForTransfer={handleSelectDevice} />
              )}
            </div>

            {/* Direct Drag & Drop Zone */}
            <div className="2xl:col-span-5">
              <DropZone />
            </div>
          </div>
        )}

        {activeTab === 'transfers' && <TransferHistory />}

        {activeTab === 'clipboard' && <ClipboardPanel />}

        {activeTab === 'text' && <TextSharePanel />}
      </main>

      {/* Modals & Transfer Drawers */}
      <TransferModal />
      <QRCodeModal />
      <QRScannerModal />
      <SettingsModal />

      {/* Mobile Bottom Navigation Bar (Pure Monochrome) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 mono-panel border-t border-white/15 px-3 py-2 flex items-center justify-around text-[10px] font-medium backdrop-blur-xl">
        <button
          onClick={() => setActiveTab('devices')}
          className={`flex flex-col items-center space-y-1 py-1.5 px-3 rounded-xl transition-all ${
            activeTab === 'devices' ? 'text-black bg-white font-black shadow-sm' : 'text-zinc-400 hover:text-white'
          }`}
        >
          <Laptop className="w-4 h-4" />
          <span>Devices</span>
        </button>
        <button
          onClick={() => setActiveTab('transfers')}
          className={`flex flex-col items-center space-y-1 py-1.5 px-3 rounded-xl transition-all ${
            activeTab === 'transfers' ? 'text-black bg-white font-black shadow-sm' : 'text-zinc-400 hover:text-white'
          }`}
        >
          <Clock className="w-4 h-4" />
          <span>History</span>
        </button>
        <button
          onClick={() => setActiveTab('clipboard')}
          className={`flex flex-col items-center space-y-1 py-1.5 px-3 rounded-xl transition-all ${
            activeTab === 'clipboard' ? 'text-black bg-white font-black shadow-sm' : 'text-zinc-400 hover:text-white'
          }`}
        >
          <Clipboard className="w-4 h-4" />
          <span>Clipboard</span>
        </button>
        <button
          onClick={() => setActiveTab('text')}
          className={`flex flex-col items-center space-y-1 py-1.5 px-3 rounded-xl transition-all ${
            activeTab === 'text' ? 'text-black bg-white font-black shadow-sm' : 'text-zinc-400 hover:text-white'
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>Text</span>
        </button>
      </nav>
    </div>
  );
};
export default App;
