/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import { 
  ArrowLeft, 
  Camera, 
  QrCode, 
  Copy, 
  Check, 
  Sparkles, 
  RefreshCw, 
  Upload, 
  ShieldCheck,
  AlertCircle
} from 'lucide-react';
import { LocalDeviceIdentity } from '../utils/p2pTransfer';
import { SAMPLE_CAMPUS_PEERS } from '../utils/fileData';
import { PeerDevice } from '../types/transfer';

interface QRCodeModalProps {
  initialTab?: 'show' | 'scan';
  device: LocalDeviceIdentity;
  onConnectPeer: (peer: PeerDevice) => void;
  onBack: () => void;
}

export const QRCodeModal: React.FC<QRCodeModalProps> = ({
  initialTab = 'show',
  device,
  onConnectPeer,
  onBack,
}) => {
  const [tab, setTab] = useState<'show' | 'scan'>(initialTab);
  const [roomCode, setRoomCode] = useState(() => Math.floor(100000 + Math.random() * 900000).toString());
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Generate QR Code data URL when room code or tab changes
  useEffect(() => {
    if (tab === 'show') {
      const payload = JSON.stringify({
        protocol: 'sharekita-p2p',
        room: roomCode,
        deviceId: device.id,
        name: device.name,
        lab: device.labLocation,
      });

      QRCode.toDataURL(payload, {
        width: 260,
        margin: 2,
        color: {
          dark: '#0F172A',
          light: '#FFFFFF',
        },
      })
        .then((url) => setQrDataUrl(url))
        .catch((err) => console.error('QR generation error', err));
    }
  }, [tab, roomCode, device]);

  // Handle Camera initialization for scan mode
  useEffect(() => {
    if (tab === 'scan') {
      startCamera();
    } else {
      stopCamera();
    }

    return () => {
      stopCamera();
    };
  }, [tab]);

  const startCamera = async () => {
    setCameraError(null);
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera access is not supported in this browser environment.');
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      setCameraActive(true);
    } catch (err: any) {
      console.warn('Camera error or blocked:', err);
      setCameraError(err.message || 'Camera permission not granted. Use the 6-digit campus code below.');
      setCameraActive(false);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(roomCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleManualConnect = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualCode.trim().length >= 4) {
      // Pick matching or default peer
      onConnectPeer(SAMPLE_CAMPUS_PEERS[0]);
    }
  };

  const handleSimulateScanSuccess = () => {
    // Connect to sample peer
    onConnectPeer(SAMPLE_CAMPUS_PEERS[1]);
  };

  return (
    <div className="flex-1 flex flex-col bg-slate-900 text-white min-h-screen">
      {/* Top Bar */}
      <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between bg-slate-900/90 backdrop-blur-md">
        <button
          onClick={onBack}
          className="p-2 text-slate-300 hover:text-white hover:bg-slate-800 rounded-xl transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-1 bg-slate-800 p-1 rounded-xl">
          <button
            onClick={() => setTab('show')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              tab === 'show' ? 'bg-amber-400 text-slate-950 shadow-xs' : 'text-slate-400 hover:text-white'
            }`}
          >
            Show QR Code
          </button>
          <button
            onClick={() => setTab('scan')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              tab === 'scan' ? 'bg-amber-400 text-slate-950 shadow-xs' : 'text-slate-400 hover:text-white'
            }`}
          >
            Scan QR Code
          </button>
        </div>

        <div className="w-9" />
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col items-center justify-center p-4 max-w-md mx-auto w-full">
        {tab === 'show' ? (
          /* SHOW QR CODE TAB */
          <div className="w-full flex flex-col items-center text-center">
            <div className="bg-white p-5 rounded-3xl shadow-xl shadow-amber-400/10 border-4 border-amber-400 relative">
              {qrDataUrl ? (
                <img
                  src={qrDataUrl}
                  alt="ShareKita Transfer QR Code"
                  className="w-56 h-56 rounded-xl mx-auto"
                />
              ) : (
                <div className="w-56 h-56 flex items-center justify-center text-slate-400">
                  Generating QR...
                </div>
              )}

              {/* ShareKita Mini Emblem in Center */}
              <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                <span className="text-xs font-extrabold text-slate-900">ShareKita Direct Pairing</span>
              </div>
            </div>

            {/* 6-Digit PIN Pairing Code */}
            <div className="mt-5 w-full bg-slate-800/90 border border-slate-700/80 rounded-2xl p-4">
              <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                Or Pair With 6-Digit PIN
              </div>
              <div className="flex items-center justify-center gap-3">
                <span className="text-2xl font-black tracking-widest text-amber-400 font-mono">
                  {roomCode.slice(0, 3)} {roomCode.slice(3)}
                </span>
                <button
                  onClick={handleCopyCode}
                  className="p-2 bg-slate-700 hover:bg-slate-600 text-white rounded-xl transition-colors flex items-center gap-1 text-xs"
                >
                  {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-[11px] text-slate-400 mt-2">
                Have the receiver/sender point their camera or enter this code on their device.
              </p>
            </div>

            <button
              onClick={() => setRoomCode(Math.floor(100000 + Math.random() * 900000).toString())}
              className="mt-3 text-xs font-bold text-amber-400 hover:text-amber-300 flex items-center gap-1.5 py-1.5 px-3 rounded-xl hover:bg-slate-800/60 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Generate New Room Code
            </button>
          </div>
        ) : (
          /* SCAN QR CODE TAB */
          <div className="w-full flex flex-col items-center">
            {/* Viewfinder */}
            <div className="relative w-64 h-64 sm:w-72 sm:h-72 rounded-3xl overflow-hidden border-2 border-amber-400/80 bg-black shadow-2xl flex items-center justify-center">
              {cameraActive ? (
                <video
                  ref={videoRef}
                  className="w-full h-full object-cover"
                  playsInline
                  autoPlay
                  muted
                />
              ) : (
                <div className="p-4 text-center">
                  <Camera className="w-10 h-10 text-amber-400/80 mx-auto mb-2 animate-bounce" />
                  <p className="text-xs text-slate-300 font-medium">
                    {cameraError || 'Align QR Code within frame'}
                  </p>
                  <button
                    onClick={startCamera}
                    className="mt-3 px-3 py-1.5 bg-amber-400 text-slate-950 font-bold text-xs rounded-xl hover:bg-amber-300 transition-colors"
                  >
                    Enable Camera
                  </button>
                </div>
              )}

              {/* Viewfinder Target Frame Overlays */}
              <div className="absolute inset-4 pointer-events-none border border-white/20 rounded-2xl flex flex-col justify-between p-2">
                <div className="flex justify-between">
                  <div className="w-6 h-6 border-t-4 border-l-4 border-amber-400 rounded-tl" />
                  <div className="w-6 h-6 border-t-4 border-r-4 border-amber-400 rounded-tr" />
                </div>
                {/* Scanning laser beam */}
                <div className="w-full h-0.5 bg-gradient-to-r from-transparent via-amber-400 to-transparent shadow-[0_0_8px_#facc15] animate-pulse" />
                <div className="flex justify-between">
                  <div className="w-6 h-6 border-b-4 border-l-4 border-amber-400 rounded-bl" />
                  <div className="w-6 h-6 border-b-4 border-r-4 border-amber-400 rounded-br" />
                </div>
              </div>
            </div>

            {/* Quick Demo Scan Button */}
            <button
              onClick={handleSimulateScanSuccess}
              className="mt-4 w-full py-2.5 px-4 bg-gradient-to-r from-amber-400 to-yellow-400 hover:from-amber-300 hover:to-yellow-300 text-slate-950 font-extrabold text-xs rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <Sparkles className="w-4 h-4" />
              <span>Simulate Detected Nearby QR Code (Auto-Pair)</span>
            </button>

            {/* Manual PIN Code Form */}
            <form onSubmit={handleManualConnect} className="mt-4 w-full bg-slate-800/90 rounded-2xl p-4 border border-slate-700">
              <label className="text-[11px] font-semibold text-slate-300 block mb-1.5">
                Or enter peer's 6-digit campus PIN:
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  maxLength={6}
                  placeholder="e.g. 849201"
                  value={manualCode}
                  onChange={(e) => setManualCode(e.target.value)}
                  className="flex-1 bg-slate-900 border border-slate-700 focus:border-amber-400 rounded-xl px-3 py-2 text-center text-sm font-mono tracking-widest text-white focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={manualCode.trim().length < 4}
                  className="px-4 py-2 bg-amber-400 disabled:bg-slate-700 text-slate-950 disabled:text-slate-500 font-bold text-xs rounded-xl transition-colors"
                >
                  Join
                </button>
              </div>
            </form>
          </div>
        )}
      </div>

      {/* Security Footer */}
      <div className="p-3 text-center border-t border-slate-800/90 bg-slate-900/95 text-xs text-slate-400 flex items-center justify-center gap-1.5">
        <ShieldCheck className="w-4 h-4 text-amber-400" />
        <span>End-to-End Encrypted · Direct Local Wi-Fi P2P Session</span>
      </div>
    </div>
  );
};
