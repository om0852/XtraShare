import { create } from 'zustand';

export type ActiveTab = 'devices' | 'transfers' | 'clipboard' | 'text';
export type ViewMode = 'radar' | 'grid';
export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';

interface UIState {
  activeTab: ActiveTab;
  viewMode: ViewMode;
  isQrModalOpen: boolean;
  isQrScannerOpen: boolean;
  isSettingsModalOpen: boolean;
  isRoomModalOpen: boolean;
  currentRoomId: string;
  connectionStatus: ConnectionStatus;
  lanIp: string;
  serverPort: number;

  setActiveTab: (tab: ActiveTab) => void;
  setViewMode: (mode: ViewMode) => void;
  setQrModalOpen: (open: boolean) => void;
  setQrScannerOpen: (open: boolean) => void;
  setSettingsModalOpen: (open: boolean) => void;
  setRoomModalOpen: (open: boolean) => void;
  setCurrentRoomId: (roomId: string) => void;
  setConnectionStatus: (status: ConnectionStatus) => void;
  setServerNetworkInfo: (lanIp: string, serverPort: number) => void;
}

export const useUIStore = create<UIState>((set) => ({
  activeTab: 'devices',
  viewMode: 'radar',
  isQrModalOpen: false,
  isQrScannerOpen: false,
  isSettingsModalOpen: false,
  isRoomModalOpen: false,
  currentRoomId: '',
  connectionStatus: 'connecting',
  lanIp: window.location.hostname,
  serverPort: window.location.port ? parseInt(window.location.port, 10) : 3000,

  setActiveTab: (activeTab) => set({ activeTab }),
  setViewMode: (viewMode) => set({ viewMode }),
  setQrModalOpen: (isQrModalOpen) => set({ isQrModalOpen }),
  setQrScannerOpen: (isQrScannerOpen) => set({ isQrScannerOpen }),
  setSettingsModalOpen: (isSettingsModalOpen) => set({ isSettingsModalOpen }),
  setRoomModalOpen: (isRoomModalOpen) => set({ isRoomModalOpen }),
  setCurrentRoomId: (currentRoomId) => set({ currentRoomId }),
  setConnectionStatus: (connectionStatus) => set({ connectionStatus }),
  setServerNetworkInfo: (lanIp, serverPort) => set({ lanIp, serverPort })
}));
