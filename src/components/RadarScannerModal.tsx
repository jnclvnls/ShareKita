/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  ArrowLeft, 
  QrCode, 
  Wifi, 
  RefreshCw, 
  Smartphone, 
  Laptop, 
  Monitor, 
  Tablet, 
  Sparkles,
  Signal,
  CheckCircle2,
  ShieldCheck
} from 'lucide-react';
import { PeerDevice, TransferableFile } from '../types/transfer';
import { LocalDeviceIdentity } from '../utils/p2pTransfer';
import { SAMPLE_CAMPUS_PEERS, formatBytes } from '../utils/fileData';

interface RadarScannerModalProps {
  mode: 'send' | 'receive';
  device: LocalDeviceIdentity;
  filesToSend: TransferableFile[];
  onSelectPeer: (peer: PeerDevice) => void;
  onOpenQRCode: () => void;
  onBack: () => void;
  realPeers?: PeerDevice[];
}

export const RadarScannerModal: React.FC<RadarScannerModalProps> = ({
  mode,
  device,
  filesToSend,
  onSelectPeer,
  onOpenQRCode,
  onBack,
  realPeers = [],
}) => {
  const [discoveredPeers, setDiscoveredPeers] = useState<PeerDevice[]>([]);
  const [isScanning, setIsScanning] = useState(true);

  // Staggered peer discovery animation merged with real Node.js network peers
  useEffect(() => {
    setDiscoveredPeers([]);
    setIsScanning(true);

    const basePeers = realPeers.length > 0 ? realPeers : SAMPLE_CAMPUS_PEERS;

    const timer1 = setTimeout(() => {
      setDiscoveredPeers([basePeers[0]]);
    }, 600);

    const timer2 = setTimeout(() => {
      setDiscoveredPeers(basePeers.slice(0, 2));
    }, 1200);

    const timer3 = setTimeout(() => {
      // Merge unique peers
      const combined = [...realPeers];
      for (const sample of SAMPLE_CAMPUS_PEERS) {
        if (!combined.some(p => p.id === sample.id)) {
          combined.push(sample);
        }
      }
      setDiscoveredPeers(combined);
      setIsScanning(false);
    }, 2000);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
    };
  }, [mode, realPeers]);

  const totalBytes = filesToSend.reduce((acc, f) => acc + f.size, 0);

  // Position peers around radar circle
  const getPeerRadarStyle = (index: number, total: number) => {
    // Distribute around radar radius
    const angles = [-45, 45, 140, 220, 310];
    const angle = angles[index % angles.length] * (Math.PI / 180);
    const radius = 105 + (index % 2) * 35; // px from center
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;

    return {
      transform: `translate(${x}px, ${y}px)`,
    };
  };

  const getDeviceIcon = (deviceType: PeerDevice['deviceType']) => {
    switch (deviceType) {
      case 'laptop':
        return <Laptop className="w-3.5 h-3.5 text-slate-700" />;
      case 'desktop':
        return <Monitor className="w-3.5 h-3.5 text-slate-700" />;
      case 'tablet':
        return <Tablet className="w-3.5 h-3.5 text-slate-700" />;
      default:
        return <Smartphone className="w-3.5 h-3.5 text-slate-700" />;
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-slate-900 text-white min-h-screen relative overflow-hidden select-none">
      {/* Top Navbar */}
      <div className="relative z-20 px-4 py-3 flex items-center justify-between border-b border-slate-800 bg-slate-900/90 backdrop-blur-md">
        <button
          onClick={onBack}
          className="p-2 text-slate-300 hover:text-white hover:bg-slate-800 rounded-xl transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

        <div className="text-center">
          <h2 className="text-sm font-bold text-white tracking-wide">
            {mode === 'send' ? 'Scanning for Receivers' : 'Waiting for Sender'}
          </h2>
          <p className="text-[11px] text-amber-400 font-medium">
            Direct Peer-to-Peer
          </p>
        </div>

        <button
          onClick={onOpenQRCode}
          title="Open QR Pairing"
          className="p-2 text-amber-400 hover:text-amber-300 hover:bg-slate-800 rounded-xl transition-colors border border-amber-400/40"
        >
          <QrCode className="w-4 h-4" />
        </button>
      </div>

      {/* Mode Sub-banner */}
      {mode === 'send' && (
        <div className="relative z-10 bg-amber-400 text-slate-950 px-4 py-2 flex items-center justify-between text-xs font-bold">
          <div className="flex items-center gap-1.5">
            <span>Ready to send:</span>
            <span className="bg-slate-950 text-white px-2 py-0.5 rounded-md text-[11px]">
              {filesToSend.length} {filesToSend.length === 1 ? 'file' : 'files'} ({formatBytes(totalBytes)})
            </span>
          </div>
          <span className="text-[11px] opacity-80">Tap any avatar below</span>
        </div>
      )}

      {/* Main Radar Screen */}
      <div className="flex-1 flex flex-col items-center justify-center relative p-6">
        {/* Radar Rings Container */}
        <div className="relative w-72 h-72 sm:w-80 sm:h-80 flex items-center justify-center">
          {/* Animated sonar wave pulse rings */}
          <div className="absolute inset-0 rounded-full border border-amber-400/20 animate-sonar-1 pointer-events-none" />
          <div className="absolute inset-0 rounded-full border border-amber-400/15 animate-sonar-2 pointer-events-none" />
          <div className="absolute inset-0 rounded-full border border-amber-400/10 animate-sonar-3 pointer-events-none" />

          {/* Static Concentric Grid Circles */}
          <div className="absolute w-72 h-72 rounded-full border border-slate-700/60" />
          <div className="absolute w-52 h-52 rounded-full border border-slate-700/80" />
          <div className="absolute w-32 h-32 rounded-full border border-amber-400/40 bg-amber-400/5" />

          {/* Radar Sweep Line */}
          <div className="absolute inset-0 rounded-full overflow-hidden pointer-events-none">
            <div 
              className="w-full h-full origin-center animate-spin"
              style={{
                animationDuration: '4s',
                background: 'conic-gradient(from 0deg, rgba(250, 204, 21, 0.25) 0deg, transparent 60deg, transparent 360deg)',
              }}
            />
          </div>

          {/* Center Avatar (Self) */}
          <div className="relative z-10 flex flex-col items-center">
            <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-amber-400 to-yellow-400 p-0.5 shadow-lg shadow-amber-400/30">
              <div className="w-full h-full rounded-full bg-slate-900 flex items-center justify-center text-2xl border-2 border-amber-400">
                {device.avatar}
              </div>
            </div>
            <div className="mt-1 px-2 py-0.5 rounded-full bg-slate-800/90 border border-slate-700 text-[10px] font-bold text-amber-300">
              You ({device.name.split(' ')[0]})
            </div>
          </div>

          {/* Orbiting Discovered Peers */}
          {discoveredPeers.map((peer, idx) => {
            const posStyle = getPeerRadarStyle(idx, discoveredPeers.length);
            return (
              <div
                key={peer.id}
                style={posStyle}
                onClick={() => onSelectPeer(peer)}
                className="absolute z-20 flex flex-col items-center cursor-pointer group transition-transform hover:scale-110 active:scale-95"
              >
                <div className="relative">
                  {/* Glowing halo */}
                  <div className="absolute -inset-1 rounded-full bg-amber-400/40 blur-xs group-hover:bg-amber-400/70 transition-all" />
                  
                  <div className="relative w-12 h-12 rounded-full bg-slate-800 border-2 border-amber-400 flex items-center justify-center text-xl shadow-md">
                    {peer.avatar}
                    <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-white flex items-center justify-center shadow-xs">
                      {getDeviceIcon(peer.deviceType)}
                    </div>
                  </div>
                </div>

                <div className="mt-1 max-w-[85px] text-center">
                  <div className="text-[10px] font-bold text-white truncate px-1 rounded bg-slate-950/80 border border-slate-800">
                    {peer.name}
                  </div>
                  <div className="text-[9px] text-amber-400 font-medium truncate">
                    {peer.distanceDesc.split(' ')[0]} {peer.distanceDesc.split(' ')[1]}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Discovery Status Message */}
        <div className="mt-6 text-center max-w-xs relative z-10">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-800/90 border border-slate-700 text-xs text-slate-300">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
            <span>
              {isScanning 
                ? 'Listening on nearby mesh frequency...' 
                : `${discoveredPeers.length} nearby devices ready to transfer`}
            </span>
          </div>
        </div>
      </div>

      {/* Bottom Peer Cards List */}
      <div className="relative z-20 bg-slate-800/95 border-t border-slate-700/80 p-4 max-w-xl mx-auto w-full rounded-t-3xl shadow-2xl">
        <div className="flex items-center justify-between mb-2.5">
          <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
            Detected Devices ({discoveredPeers.length})
          </h3>
          <button
            onClick={onOpenQRCode}
            className="text-xs font-bold text-amber-400 hover:text-amber-300 flex items-center gap-1"
          >
            <QrCode className="w-3.5 h-3.5" />
            Pair by QR Code
          </button>
        </div>

        <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
          {discoveredPeers.map((peer) => (
            <div
              key={peer.id}
              onClick={() => onSelectPeer(peer)}
              className="bg-slate-900/90 hover:bg-slate-900 p-2.5 rounded-2xl border border-slate-700/70 hover:border-amber-400 flex items-center justify-between gap-3 cursor-pointer transition-all"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-slate-800 border border-amber-400/40 flex items-center justify-center text-lg shrink-0">
                  {peer.avatar}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-white truncate">{peer.name}</span>
                    <span className="text-[10px] text-slate-400">({peer.os})</span>
                  </div>
                  <div className="text-[11px] text-slate-400 truncate mt-0.5">
                    {peer.distanceDesc}
                  </div>
                </div>
              </div>

              <button className="px-3 py-1.5 bg-amber-400 hover:bg-amber-300 text-slate-950 rounded-xl font-bold text-xs shrink-0 transition-colors">
                {mode === 'send' ? 'Send' : 'Connect'}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
