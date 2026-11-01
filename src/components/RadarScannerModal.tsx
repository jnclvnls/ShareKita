import React from 'react';
import { ArrowLeft, Laptop, Radio, Smartphone, Tablet, Wifi } from 'lucide-react';
import { LocalDeviceIdentity } from '../utils/p2pTransfer';
import { PeerDevice, TransferableFile } from '../types/transfer';

interface RadarScannerModalProps {
  mode: 'send' | 'receive';
  device: LocalDeviceIdentity;
  filesToSend: TransferableFile[];
  onSelectPeer: (peer: PeerDevice) => void;
  onOpenQRCode: () => void;
  onBack: () => void;
  realPeers: PeerDevice[];
}

const DeviceIcon = ({ type }: { type: PeerDevice['deviceType'] }) => {
  const Icon = type === 'phone' ? Smartphone : type === 'tablet' ? Tablet : Laptop;
  return <Icon className="w-5 h-5" />;
};

export const RadarScannerModal: React.FC<RadarScannerModalProps> = ({
  mode, device, filesToSend, onSelectPeer, onOpenQRCode, onBack, realPeers,
}) => (
  <main className="flex-1 w-full max-w-xl mx-auto p-4 flex flex-col gap-5">
    <div className="flex items-center gap-3">
      <button onClick={onBack} aria-label="Go back" className="p-2 rounded-xl border border-slate-200 hover:bg-slate-50"><ArrowLeft className="w-5 h-5" /></button>
      <div>
        <h1 className="text-lg font-bold text-slate-900">{mode === 'send' ? 'Choose a receiver' : 'Nearby senders'}</h1>
        <p className="text-xs text-slate-500">{mode === 'send' ? `${filesToSend.length} files selected` : 'Waiting for a device to connect'}</p>
      </div>
    </div>

    <section className="rounded-2xl border border-slate-200 bg-white p-5 text-center">
      <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-600"><Radio className="w-7 h-7 animate-pulse" /></div>
      <h2 className="font-bold text-slate-900">Searching for nearby devices</h2>
      <p className="mt-1 text-xs text-slate-500">Keep ShareKita open on both devices and connected to the same network.</p>
      <button onClick={onOpenQRCode} className="mt-4 text-sm font-semibold text-amber-700 hover:text-amber-800">Pair with QR code</button>
    </section>

    <section className="flex flex-col gap-2">
      <h2 className="text-xs font-bold uppercase tracking-wide text-slate-600">Available devices ({realPeers.length})</h2>
      {realPeers.filter((peer) => peer.id !== device.id).map((peer) => (
        <button key={peer.id} onClick={() => onSelectPeer(peer)} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 text-left hover:border-amber-300 hover:bg-amber-50/30">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-50 text-amber-700"><DeviceIcon type={peer.deviceType} /></div>
          <span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold text-slate-900">{peer.name}</span><span className="text-xs text-slate-500">{peer.os} · {peer.distanceDesc || 'Nearby'}</span></span>
          <Wifi className="w-4 h-4 text-emerald-600" />
        </button>
      ))}
      {realPeers.filter((peer) => peer.id !== device.id).length === 0 && (
        <p className="rounded-xl bg-slate-50 p-4 text-center text-xs text-slate-500">No other devices found yet.</p>
      )}
    </section>
  </main>
);
