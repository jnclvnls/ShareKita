/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { ArrowLeft, Copy, Check, RefreshCw, ShieldCheck, Loader2, AlertCircle, FileText } from 'lucide-react';
import { LocalDeviceIdentity } from '../utils/p2pTransfer';
import {
  HostController,
  HostState,
  Link,
  ManifestFile,
  PeerProfile,
  buildPairingLink,
  openHost,
} from '../utils/peerSession';
import { formatBytes } from '../utils/fileData';

interface ReceiveScreenProps {
  device: LocalDeviceIdentity;
  onAccepted: (link: Link, peer: PeerProfile, files: ManifestFile[]) => void;
  onBack: () => void;
}

interface Incoming {
  link: Link;
  peer: PeerProfile | null;
  files: ManifestFile[] | null;
}

export const ReceiveScreen: React.FC<ReceiveScreenProps> = ({ device, onAccepted, onBack }) => {
  const [host, setHost] = useState<HostState>({ state: 'starting' });
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const [incoming, setIncoming] = useState<Incoming | null>(null);

  const hostRef = useRef<HostController | null>(null);
  const handedOff = useRef(false);
  const deviceRef = useRef(device);
  deviceRef.current = device;

  useEffect(() => {
    const controller = openHost(
      (link) => {
        const profile: PeerProfile = {
          name: deviceRef.current.name,
          avatar: deviceRef.current.avatar,
          deviceType: deviceRef.current.deviceType,
          os: deviceRef.current.os,
        };
        const entry: Incoming = { link, peer: null, files: null };
        setIncoming({ ...entry });

        link.onClose = () => setIncoming((cur) => (cur && cur.link === link ? null : cur));
        link.setHandler((msg) => {
          if (msg.t === 'hello') {
            entry.peer = msg.profile;
            setIncoming({ ...entry });
          } else if (msg.t === 'manifest') {
            entry.files = msg.files;
            setIncoming({ ...entry });
          }
        });
        link.send({ t: 'hello', profile });
      },
      (state) => setHost(state)
    );
    hostRef.current = controller;

    return () => {
      if (!handedOff.current) controller.destroy();
    };
  }, []);

  useEffect(() => {
    if (host.state !== 'ready' || !host.pin) {
      setQrDataUrl('');
      return;
    }
    QRCode.toDataURL(buildPairingLink(host.pin), {
      width: 240,
      margin: 2,
      color: { dark: '#0F172A', light: '#FFFFFF' },
    })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(''));
  }, [host.state, host.pin]);

  const handleCopy = () => {
    if (!host.pin) return;
    navigator.clipboard?.writeText(host.pin).catch(() => undefined);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const handleAccept = () => {
    if (!incoming || !incoming.files) return;
    incoming.link.send({ t: 'accept' });
    handedOff.current = true;
    onAccepted(
      incoming.link,
      incoming.peer || { name: 'Unknown device', avatar: '📱', deviceType: 'phone', os: '' },
      incoming.files
    );
  };

  const handleDecline = () => {
    if (!incoming) return;
    incoming.link.send({ t: 'decline' });
    const link = incoming.link;
    setIncoming(null);
    setTimeout(() => {
      try {
        link.conn.close();
      } catch {
        // ignore
      }
    }, 300);
  };

  const totalBytes = incoming?.files?.reduce((a, f) => a + f.size, 0) ?? 0;

  return (
    <div className="flex-1 flex flex-col bg-slate-900 text-white min-h-screen">
      <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between bg-slate-900/90 backdrop-blur-md">
        <button
          onClick={onBack}
          className="p-2 text-slate-300 hover:text-white hover:bg-slate-800 rounded-xl transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="text-center">
          <h2 className="text-sm font-bold tracking-wide">Receive Files</h2>
          <p className="text-[11px] text-amber-400 font-medium">Waiting for a sender</p>
        </div>
        <div className="w-9" />
      </div>

      <div className="flex-1 flex flex-col items-center justify-center p-4 max-w-md mx-auto w-full">
        {host.state === 'starting' && (
          <div className="flex flex-col items-center gap-3 text-slate-300">
            <Loader2 className="w-8 h-8 animate-spin text-amber-400" />
            <p className="text-sm">Getting your pairing PIN ready…</p>
          </div>
        )}

        {host.state === 'error' && (
          <div className="w-full bg-rose-950/50 border border-rose-500/40 rounded-2xl p-5 text-center">
            <AlertCircle className="w-8 h-8 text-rose-400 mx-auto mb-2" />
            <p className="text-sm text-rose-100">{host.error}</p>
            <button
              onClick={() => hostRef.current?.restart()}
              className="mt-4 px-4 py-2 bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs rounded-xl"
            >
              Try again
            </button>
          </div>
        )}

        {host.state === 'ready' && !incoming && (
          <div className="w-full flex flex-col items-center text-center">
            <div className="bg-white p-4 rounded-3xl shadow-xl border-4 border-amber-400">
              {qrDataUrl ? (
                <img src={qrDataUrl} alt="Pairing QR code" className="w-52 h-52 rounded-xl" />
              ) : (
                <div className="w-52 h-52 flex items-center justify-center text-slate-400 text-sm">Generating…</div>
              )}
            </div>

            <div className="mt-5 w-full bg-slate-800/90 border border-slate-700/80 rounded-2xl p-4">
              <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                Your pairing PIN
              </div>
              <div className="flex items-center justify-center gap-3">
                <span className="text-3xl font-black tracking-widest text-amber-400 font-mono">
                  {host.pin!.slice(0, 3)} {host.pin!.slice(3)}
                </span>
                <button
                  onClick={handleCopy}
                  className="p-2 bg-slate-700 hover:bg-slate-600 text-white rounded-xl transition-colors"
                  title="Copy PIN"
                >
                  {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-[11px] text-slate-400 mt-2">
                On the other device, tap <b>Send</b>, choose files, then enter this PIN or scan the QR code.
              </p>
            </div>

            <div className="mt-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-800/90 border border-slate-700 text-xs text-slate-300">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
              <span>Waiting for a device to connect…</span>
            </div>

            <button
              onClick={() => hostRef.current?.restart()}
              className="mt-3 text-xs font-bold text-amber-400 hover:text-amber-300 flex items-center gap-1.5 py-1.5 px-3 rounded-xl hover:bg-slate-800/60 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              New PIN
            </button>
          </div>
        )}

        {incoming && (
          <div className="w-full bg-slate-800/90 border border-amber-400/50 rounded-3xl p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-2xl bg-slate-900 border-2 border-amber-400 flex items-center justify-center text-2xl">
                {incoming.peer?.avatar || '📱'}
              </div>
              <div className="min-w-0">
                <div className="text-sm font-bold truncate">{incoming.peer?.name || 'Device connected'}</div>
                <div className="text-[11px] text-emerald-400 font-semibold">Connected</div>
              </div>
            </div>

            {!incoming.files ? (
              <div className="flex items-center gap-2 text-sm text-slate-300">
                <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
                <span>Waiting for them to choose files…</span>
              </div>
            ) : (
              <>
                <p className="text-sm text-slate-200 mb-2">
                  wants to send you <b>{incoming.files.length}</b> {incoming.files.length === 1 ? 'file' : 'files'} (
                  {formatBytes(totalBytes)})
                </p>
                <div className="max-h-40 overflow-y-auto space-y-1.5 mb-4">
                  {incoming.files.map((f) => (
                    <div key={f.id} className="flex items-center justify-between gap-2 bg-slate-900/80 rounded-xl px-3 py-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <FileText className="w-4 h-4 text-slate-400 shrink-0" />
                        <span className="text-xs truncate">{f.name}</span>
                      </div>
                      <span className="text-[11px] text-slate-400 tabular-nums shrink-0">{formatBytes(f.size)}</span>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={handleDecline}
                    className="py-2.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-white font-bold text-xs"
                  >
                    Decline
                  </button>
                  <button
                    onClick={handleAccept}
                    className="py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs"
                  >
                    Accept
                  </button>
                </div>
              </>
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
