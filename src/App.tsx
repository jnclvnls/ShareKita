/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { Header } from './components/Header';
import { HomeDashboard } from './components/HomeDashboard';
import { FilePickerModal } from './components/FilePickerModal';
import { RadarScannerModal } from './components/RadarScannerModal';
import { QRCodeModal } from './components/QRCodeModal';
import { TransferScreen } from './components/TransferScreen';
import { HistoryDrawer } from './components/HistoryDrawer';
import { FilePreviewModal } from './components/FilePreviewModal';
import { SettingsModal } from './components/SettingsModal';

import { 
  TransferableFile, 
  PeerDevice, 
  ActiveTransferSession, 
  TransferHistoryRecord 
} from './types/transfer';
import { 
  getStoredDeviceIdentity, 
  saveDeviceIdentity, 
  getTransferHistory, 
  saveHistoryRecord, 
  clearHistoryStorage, 
  createTransferSession,
  LocalDeviceIdentity
} from './utils/p2pTransfer';
import { INITIAL_CAMPUS_FILES } from './utils/fileData';

type AppView = 
  | 'home' 
  | 'file-picker' 
  | 'radar-send' 
  | 'radar-receive' 
  | 'qr-modal' 
  | 'transferring' 
  | 'history';

export default function App() {
  // App state
  const [device, setDevice] = useState<LocalDeviceIdentity>(getStoredDeviceIdentity);
  const [currentView, setCurrentView] = useState<AppView>('home');
  const [files, setFiles] = useState<TransferableFile[]>(INITIAL_CAMPUS_FILES);
  const [selectedFileIds, setSelectedFileIds] = useState<string[]>([
    INITIAL_CAMPUS_FILES[0].id,
    INITIAL_CAMPUS_FILES[2].id,
  ]);
  const [history, setHistory] = useState<TransferHistoryRecord[]>(getTransferHistory);
  
  // Modals & sub-flows
  const [qrTab, setQrTab] = useState<'show' | 'scan'>('show');
  const [showSettings, setShowSettings] = useState(false);
  const [previewFile, setPreviewFile] = useState<TransferableFile | null>(null);

  // Active Transfer State
  const [activeSession, setActiveSession] = useState<ActiveTransferSession | null>(null);

  // Real-time Node.js backend & WebSocket state
  const [realPeers, setRealPeers] = useState<PeerDevice[]>([]);
  const wsRef = useRef<WebSocket | null>(null);

  // Connect to Node.js backend & WebSocket
  useEffect(() => {
    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        // Register current device with the Node.js server
        ws.send(
          JSON.stringify({
            type: 'register',
            device: {
              id: device.id,
              name: device.name,
              deviceType: device.deviceType,
              os: device.os,
              avatar: device.avatar,
              labLocation: device.labLocation,
            },
          })
        );
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'registered' && msg.peers) {
            setRealPeers(msg.peers);
          } else if (msg.type === 'peer-joined' && msg.peer) {
            setRealPeers((prev) => {
              if (prev.some((p) => p.id === msg.peer.id)) return prev;
              return [msg.peer, ...prev];
            });
          } else if (msg.type === 'peer-left' && msg.peerId) {
            setRealPeers((prev) => prev.filter((p) => p.id !== msg.peerId));
          }
        } catch (e) {
          console.error('WS message error:', e);
        }
      };

      ws.onerror = () => {
        // WebSocket error
      };

      return () => {
        ws.close();
      };
    } catch (e) {
      console.warn('WebSocket connection not initialized:', e);
    }
  }, [device]);

  // File selection handlers
  const handleToggleSelectFile = (id: string) => {
    setSelectedFileIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    setSelectedFileIds(files.map((f) => f.id));
  };

  const handleClearSelection = () => {
    setSelectedFileIds([]);
  };

  const handleAddUserFiles = (newFiles: TransferableFile[]) => {
    setFiles((prev) => [...newFiles, ...prev]);
  };

  // Flow triggers
  const handleStartSend = () => {
    setCurrentView('file-picker');
  };

  const handleStartReceive = () => {
    setCurrentView('radar-receive');
  };

  const handleOpenQR = (mode: 'show' | 'scan' = 'show') => {
    setQrTab(mode);
    setCurrentView('qr-modal');
  };

  const handleOpenHistory = () => {
    setCurrentView('history');
  };

  // Peer chosen on Radar or QR pairing
  const handleInitiateTransfer = (peer: PeerDevice, direction: 'send' | 'receive' = 'send') => {
    const selectedFiles = files.filter((f) => selectedFileIds.includes(f.id));
    const filesToTransfer = selectedFiles.length > 0 ? selectedFiles : [files[0], files[1]];
    const session = createTransferSession(direction, peer, filesToTransfer);
    session.status = 'transferring';
    setActiveSession(session);
    setCurrentView('transferring');
  };

  const handleTransferComplete = (record: TransferHistoryRecord) => {
    saveHistoryRecord(record);
    setHistory(getTransferHistory());
  };

  const handleClearHistory = () => {
    clearHistoryStorage();
    setHistory([]);
  };

  // Render view router
  const renderCurrentView = () => {
    switch (currentView) {
      case 'file-picker':
        return (
          <FilePickerModal
            files={files}
            selectedFileIds={selectedFileIds}
            onToggleSelect={handleToggleSelectFile}
            onSelectAll={handleSelectAll}
            onClearSelection={handleClearSelection}
            onAddUserFiles={handleAddUserFiles}
            onBack={() => setCurrentView('home')}
            onProceedToSend={() => setCurrentView('radar-send')}
            onPreviewFile={(f) => setPreviewFile(f)}
          />
        );

      case 'radar-send':
        return (
          <RadarScannerModal
            mode="send"
            device={device}
            filesToSend={files.filter((f) => selectedFileIds.includes(f.id))}
            onSelectPeer={(peer) => handleInitiateTransfer(peer, 'send')}
            onOpenQRCode={() => handleOpenQR('scan')}
            onBack={() => setCurrentView('file-picker')}
            realPeers={realPeers}
          />
        );

      case 'radar-receive':
        return (
          <RadarScannerModal
            mode="receive"
            device={device}
            filesToSend={[]}
            onSelectPeer={(peer) => handleInitiateTransfer(peer, 'receive')}
            onOpenQRCode={() => handleOpenQR('show')}
            onBack={() => setCurrentView('home')}
            realPeers={realPeers}
          />
        );

      case 'qr-modal':
        return (
          <QRCodeModal
            initialTab={qrTab}
            device={device}
            onConnectPeer={(peer) => handleInitiateTransfer(peer, qrTab === 'scan' ? 'send' : 'receive')}
            onBack={() => setCurrentView('home')}
          />
        );

      case 'transferring':
        if (!activeSession) return null;
        return (
          <TransferScreen
            session={activeSession}
            device={device}
            onPause={() => {
              setActiveSession((s) => s ? { ...s, status: 'paused' } : null);
            }}
            onResume={() => {
              setActiveSession((s) => s ? { ...s, status: 'transferring' } : null);
            }}
            onSimulateGlitch={() => {
              // handled inside TransferScreen state
            }}
            onCancel={() => {
              setActiveSession(null);
              setCurrentView('home');
            }}
            onComplete={handleTransferComplete}
            onPreviewFile={(f) => setPreviewFile(f)}
          />
        );

      case 'history':
        return (
          <HistoryDrawer
            history={history}
            onClearHistory={handleClearHistory}
            onPreviewFile={(f) => setPreviewFile(f)}
            onBack={() => setCurrentView('home')}
          />
        );

      case 'home':
      default:
        return (
          <HomeDashboard
            device={device}
            onStartSend={handleStartSend}
            onStartReceive={handleStartReceive}
            onOpenQR={handleOpenQR}
            onOpenHistory={handleOpenHistory}
            onOpenSettings={() => setShowSettings(true)}
            recentTransfers={history}
            onPreviewFile={(f) => setPreviewFile(f)}
          />
        );
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col text-slate-900 selection:bg-amber-300">
      {/* Main Container */}
      <div className="w-full max-w-4xl min-h-screen bg-white mx-auto shadow-xs border-x border-slate-200/60 flex flex-col">
        {/* Global App Header (shown on Home or as top navigation) */}
        {currentView === 'home' && (
          <Header
            device={device}
            onOpenQR={() => handleOpenQR('show')}
            onOpenHistory={handleOpenHistory}
            onOpenSettings={() => setShowSettings(true)}
            networkStatus="connected"
            peersCount={realPeers.length}
          />
        )}

        {/* Dynamic Screen View */}
        <div className="flex-1 flex flex-col">
          {renderCurrentView()}
        </div>
      </div>

      {/* Settings Modal */}
      {showSettings && (
        <SettingsModal
          device={device}
          onUpdateDevice={(updated) => {
            saveDeviceIdentity(updated);
            setDevice(updated);
          }}
          onClose={() => setShowSettings(false)}
        />
      )}

      {/* File Preview Modal */}
      {previewFile && (
        <FilePreviewModal
          file={previewFile}
          onClose={() => setPreviewFile(null)}
        />
      )}
    </div>
  );
}
