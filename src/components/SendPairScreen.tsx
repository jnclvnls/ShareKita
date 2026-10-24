/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { ArrowLeft, Camera, Loader2, ShieldCheck, AlertCircle, KeyRound, ScanLine } from 'lucide-react';
import { LocalDeviceIdentity } from '../utils/p2pTransfer';
import { Link, PeerProfile, isValidPin, joinPin, parsePin } from '../utils/peerSession';
import { TransferableFile } from '../types/transfer';
import { formatBytes } from '../utils/fileData';

interface SendPairScreenProps {
  device: LocalDeviceIdentity;
  files: TransferableFile[];
  initialPin?: string | null;
  initialTab?: 'pin' | 'scan';
  onAccepted: (link: Link, peer: PeerProfile) => void;
  onBack: () => void;
}

type Phase = 'idle' | 'connecting' | 'waiting' | 'error';

export const SendPairScreen: React.FC<SendPairScreenProps> = ({
  device,
  files,
  initialPin,
  initialTab = 'pin',
  onAccepted,
  onBack,
}) => {
  const [tab, setTab] = useState<'pin' | 'scan'>(initialPin ? 'pin' : initialTab);
  const [pin, setPin] = useState(initialPin || '');
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [peerName, setPeerName] = useState<string>('');
  const [cameraError, setCameraError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const linkRef = useRef<Link | null>(null);
  const cancelledRef = useRef(false);
  const handedOff = useRef(false);
  const busyRef = useRef(false);
  const autoStarted = useRef(false);

  const totalBytes = files.reduce((a, f) => a + f.size, 0);

  const connect = useCallback(
    async (targetPin: string) => {
      if (busyRef.current) return;
      if (!isValidPin(targetPin)) {
        setError('Enter the 6-digit PIN shown on the receiving device.');
        setPhase('error');
        return;
      }
      busyRef.current = true;
      cancelledRef.current = false;
      setError(null);
      setPhase('connecting');

      try {
        const { link } = await joinPin(targetPin);
        if (cancelledRef.current) {
          link.destroy();
          return;
        }
        linkRef.current = link;

        let peer: PeerProfile = { name: 'Unknown device', avatar: '📱', deviceType: 'phone', os: '' };

        const failWith = (msg: string) => {
          if (handedOff.current) return;
          link.destroy();
          linkRef.current = null;
          busyRef.current = false;
          setError(msg);
          setPhase('error');
        };

        link.onClose = () => failWith('The other device disconnected.');
        link.setHandler((msg) => {
          if (msg.t === 'hello') {
            peer = msg.profile;
            setPeerName(msg.profile.name);
          } else if (msg.t === 'accept') {
            handedOff.current = true;
            onAccepted(link, peer);
          } else if (msg.t === 'decline') {
            failWith(`${peer.name} declined the transfer.`);
          }
        });

        link.send({
          t: 'hello',
          profile: { name: device.name, avatar: device.avatar, deviceType: device.deviceType, os: device.os },
        });
        link.send({
          t: 'manifest',
          totalBytes,
          files: files.map((f) => ({ id: f.id, name: f.name, size: f.size, type: f.type })),
        });
        setPhase('waiting');
      } catch (e: any) {
        busyRef.current = false;
        if (cancelledRef.current) return;
        setError(e?.message || 'Could not connect.');
        setPhase('error');
      }
    },
    [device, files, totalBytes, onAccepted]
  );

  // Auto-connect when opened from a scanned/shared link
  useEffect(() => {
    if (initialPin && !autoStarted.current) {
      autoStarted.current = true;
      connect(initialPin);
    }
  }, [initialPin, connect]);

  // Camera + QR scanning
  useEffect(() => {
    if (tab !== 'scan' || phase === 'connecting' || phase === 'waiting') return;

    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    const tick = () => {
      if (stopped) return;
      const video = videoRef.current;
      if (video && ctx && video.readyState === video.HAVE_ENOUGH_DATA && video.videoWidth > 0) {
        const scale = Math.min(1, 480 / video.videoWidth);
        canvas.width = Math.floor(video.videoWidth * scale);
        canvas.height = Math.floor(video.videoHeight * scale);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
        if (code) {
          const found = parsePin(code.data);
          if (found) {
            stopped = true;
            setPin(found);
            connect(found);
            return;
          }
        }
      }
      timer = setTimeout(tick, 150);
    };

    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error('Camera is not available in this browser. Enter the PIN instead.');
        }
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (stopped) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        setCameraError(null);
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => undefined);
        }
        tick();
      } catch (e: any) {
        setCameraError(e?.message || 'Camera permission was not granted. Enter the PIN instead.');
      }
    })();

    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [tab, phase, connect]);

  useEffect(() => {
    return () => {
      cancelledRef.current = true;
      if (!handedOff.current) linkRef.current?.destroy();
    };
  }, []);

  const handleBack = () => {
    cancelledRef.current = true;
    if (!handedOff.current) linkRef.current?.destroy();
    onBack();
  };

  const handleRetry = () => {
    linkRef.current = null;
    busyRef.current = false;
    setError(null);
    setPhase('idle');
  };

  const handleCancel = () => {
    cancelledRef.current = true;
    linkRef.current?.destroy();
    handleRetry();
  };

  const busy = phase === 'connecting' || phase === 'waiting';

  return (
    <div className="flex-1 flex flex-col bg-slate-900 text-white min-h-screen">
      <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between bg-slate-900/90 backdrop-blur-md">
        <button
          onClick={handleBack}
          className="p-2 text-slate-300 hover:text-white hover:bg-slate-800 rounded-xl transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="text-center">
          <h2 className="text-sm font-bold tracking-wide">Connect to Receiver</h2>
          <p className="text-[11px] text-amber-400 font-medium">Enter PIN or scan QR</p>
        </div>
        <div className="w-9" />
      </div>

      <div className="bg-amber-400 text-slate-950 px-4 py-2 flex items-center justify-between text-xs font-bold">
        <span>Ready to send:</span>
        <span className="bg-slate-950 text-white px-2 py-0.5 rounded-md text-[11px]">
          {files.length} {files.length === 1 ? 'file' : 'files'} ({formatBytes(totalBytes)})
        </span>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center p-4 max-w-md mx-auto w-full">
        {busy ? (
          <div className="flex flex-col items-center gap-3 text-center">
            <Loader2 className="w-10 h-10 animate-spin text-amber-400" />
            <p className="text-sm font-semibold">
              {phase === 'connecting' ? 'Connecting…' : `Waiting for ${peerName || 'the receiver'} to accept…`}
            </p>
            <p className="text-xs text-slate-400">
              {phase === 'waiting' ? 'They need to tap Accept on their screen.' : 'This can take a few seconds.'}
            </p>
            <button
              onClick={handleCancel}
              className="mt-2 text-xs font-bold text-amber-400 hover:text-amber-300"
            >
              Cancel
            </button>
          </div>
        ) : (
          <div className="w-full">
            <div className="flex items-center gap-1 bg-slate-800 p-1 rounded-xl mb-4">
              <button
                onClick={() => setTab('pin')}
                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all ${
                  tab === 'pin' ? 'bg-amber-400 text-slate-950' : 'text-slate-400 hover:text-white'
                }`}
              >
                <KeyRound className="w-3.5 h-3.5" /> Enter PIN
              </button>
              <button
                onClick={() => setTab('scan')}
                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all ${
                  tab === 'scan' ? 'bg-amber-400 text-slate-950' : 'text-slate-400 hover:text-white'
                }`}
              >
                <ScanLine className="w-3.5 h-3.5" /> Scan QR
              </button>
            </div>

            {phase === 'error' && error && (
              <div className="mb-4 bg-rose-950/50 border border-rose-500/40 rounded-2xl p-3 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <p className="text-xs text-rose-100">{error}</p>
              </div>
            )}

            {tab === 'pin' ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  connect(pin);
                }}
                className="bg-slate-800/90 rounded-2xl p-4 border border-slate-700"
              >
                <label className="text-[11px] font-semibold text-slate-300 block mb-2">
                  Enter the 6-digit PIN shown on the receiving device
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={6}
                  placeholder="000000"
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  className="w-full bg-slate-900 border border-slate-700 focus:border-amber-400 rounded-xl px-3 py-3 text-center text-2xl font-mono tracking-[0.4em] text-white focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={pin.length !== 6}
                  className="mt-3 w-full py-2.5 bg-amber-400 disabled:bg-slate-700 text-slate-950 disabled:text-slate-500 font-bold text-sm rounded-xl transition-colors"
                >
                  Connect & Send
                </button>
              </form>
            ) : (
              <div className="flex flex-col items-center">
                <div className="relative w-64 h-64 sm:w-72 sm:h-72 rounded-3xl overflow-hidden border-2 border-amber-400/80 bg-black flex items-center justify-center">
                  <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
                  {cameraError && (
                    <div className="absolute inset-0 p-4 flex flex-col items-center justify-center text-center bg-black">
                      <Camera className="w-9 h-9 text-amber-400/80 mb-2" />
                      <p className="text-xs text-slate-300">{cameraError}</p>
                    </div>
                  )}
                </div>
                <p className="text-xs text-slate-400 mt-3 text-center">
                  Point the camera at the QR code on the receiving device.
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="p-3 text-center border-t border-slate-800/90 bg-slate-900/95 text-xs text-slate-400 flex items-center justify-center gap-1.5">
        <ShieldCheck className="w-4 h-4 text-amber-400" />
        <span>Files go directly device-to-device over an encrypted connection</span>
      </div>
    </div>
  );
};
