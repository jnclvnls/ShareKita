/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { HomeDashboard } from './components/HomeDashboard';
import { FilePickerModal } from './components/FilePickerModal';
import { ReceiveScreen } from './components/ReceiveScreen';
import { SendPairScreen } from './components/SendPairScreen';
import { TransferScreen } from './components/TransferScreen';
import { HistoryDrawer } from './components/HistoryDrawer';
import { FilePreviewModal } from './components/FilePreviewModal';
import { SettingsModal } from './components/SettingsModal';

import { TransferableFile, TransferHistoryRecord } from './types/transfer';
import {
  getStoredDeviceIdentity,
  saveDeviceIdentity,
  purgeLegacyStorage,
  LocalDeviceIdentity,
} from './utils/p2pTransfer';
import { Link, ManifestFile, PeerProfile, parsePin } from './utils/peerSession';
import { createRemoteFileStub } from './utils/fileData';

type AppView = 'home' | 'file-picker' | 'send-pair' | 'receive' | 'transferring' | 'history';

interface ActiveSession {
  direction: 'send' | 'receive';
  link: Link;
  peer: PeerProfile;
  files: TransferableFile[];
}

// Wipe any leftovers from earlier versions once, before first render.
purgeLegacyStorage();

function readPinFromUrl(): string | null {
  try {
    const raw = new URLSearchParams(window.location.search).get('pin');
    return raw ? parsePin(raw) : null;
  } catch {
    return null;
  }
}

export default function App() {
  const [device, setDevice] = useState<LocalDeviceIdentity>(getStoredDeviceIdentity);

  // Opened from a scanned QR link (?pin=123456): pick files first, then auto-connect.
  const [pendingPin, setPendingPin] = useState<string | null>(readPinFromUrl);
  const [currentView, setCurrentView] = useState<AppView>(() => (readPinFromUrl() ? 'file-picker' : 'home'));

  // Starts completely empty: only files the user actually picks from this device.
  const [files, setFiles] = useState<TransferableFile[]>([]);
  const [selectedFileIds, setSelectedFileIds] = useState<string[]>([]);
  // Session-only history. Nothing is stored between visits.
  const [history, setHistory] = useState<TransferHistoryRecord[]>([]);

  const [scanFirst, setScanFirst] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [previewFile, setPreviewFile] = useState<TransferableFile | null>(null);
  const [session, setSession] = useState<ActiveSession | null>(null);

  useEffect(() => {
    if (pendingPin) {
      // remove ?pin= from the address bar so a refresh doesn't reuse an old PIN
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleToggleSelectFile = (id: string) => {
    setSelectedFileIds((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));
  };

  const handleAddUserFiles = (newFiles: TransferableFile[]) => {
    setFiles((prev) => [...newFiles, ...prev]);
  };

  const handleStartSend = () => {
    setScanFirst(false);
    setCurrentView('file-picker');
  };

  const handleOpenScan = () => {
    setScanFirst(true);
    setCurrentView('file-picker');
  };

  const handleSendAccepted = (link: Link, peer: PeerProfile) => {
    const toSend = files.filter((f) => selectedFileIds.includes(f.id));
    setPendingPin(null);
    setSession({ direction: 'send', link, peer, files: toSend });
    setCurrentView('transferring');
  };

  const handleReceiveAccepted = (link: Link, peer: PeerProfile, manifest: ManifestFile[]) => {
    setSession({
      direction: 'receive',
      link,
      peer,
      files: manifest.map(createRemoteFileStub),
    });
    setCurrentView('transferring');
  };

  const handleTransferFinished = (record: TransferHistoryRecord) => {
    setHistory((prev) => [record, ...prev]);
  };

  const handleExitTransfer = () => {
    setSession(null);
    setCurrentView('home');
  };

  const renderCurrentView = () => {
    switch (currentView) {
      case 'file-picker':
        return (
          <FilePickerModal
            files={files}
            selectedFileIds={selectedFileIds}
            onToggleSelect={handleToggleSelectFile}
            onSelectAll={() => setSelectedFileIds(files.map((f) => f.id))}
            onClearSelection={() => setSelectedFileIds([])}
            onAddUserFiles={handleAddUserFiles}
            onBack={() => {
              setPendingPin(null);
              setCurrentView('home');
            }}
            onProceedToSend={() => setCurrentView('send-pair')}
            onPreviewFile={(f) => setPreviewFile(f)}
            proceedLabel={pendingPin ? `Send to PIN ${pendingPin}` : 'Next: Connect'}
          />
        );

      case 'send-pair':
        return (
          <SendPairScreen
            device={device}
            files={files.filter((f) => selectedFileIds.includes(f.id))}
            initialPin={pendingPin}
            initialTab={scanFirst ? 'scan' : 'pin'}
            onAccepted={handleSendAccepted}
            onBack={() => setCurrentView('file-picker')}
          />
        );

      case 'receive':
        return (
          <ReceiveScreen
            device={device}
            onAccepted={handleReceiveAccepted}
            onBack={() => setCurrentView('home')}
          />
        );

      case 'transferring':
        if (!session) return null;
        return (
          <TransferScreen
            direction={session.direction}
            link={session.link}
            device={device}
            peer={session.peer}
            files={session.files}
            onFinish={handleTransferFinished}
            onExit={handleExitTransfer}
            onPreviewFile={(f) => setPreviewFile(f)}
          />
        );

      case 'history':
        return (
          <HistoryDrawer
            history={history}
            onClearHistory={() => setHistory([])}
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
            onStartReceive={() => setCurrentView('receive')}
            onScanQR={handleOpenScan}
            onOpenHistory={() => setCurrentView('history')}
            onOpenSettings={() => setShowSettings(true)}
            recentTransfers={history}
            onPreviewFile={(f) => setPreviewFile(f)}
          />
        );
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col text-slate-900 selection:bg-amber-300">
      <div className="w-full max-w-4xl min-h-screen bg-white mx-auto shadow-xs border-x border-slate-200/60 flex flex-col">
        {currentView === 'home' && (
          <Header
            device={device}
            onOpenQR={() => setCurrentView('receive')}
            onOpenHistory={() => setCurrentView('history')}
            onOpenSettings={() => setShowSettings(true)}
          />
        )}

        <div className="flex-1 flex flex-col">{renderCurrentView()}</div>
      </div>

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

      {previewFile && <FilePreviewModal file={previewFile} onClose={() => setPreviewFile(null)} />}
    </div>
  );
}
