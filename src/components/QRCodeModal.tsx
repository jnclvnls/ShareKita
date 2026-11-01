import React, { useEffect, useState } from 'react';
import { ArrowLeft, QrCode } from 'lucide-react';
import QRCode from 'qrcode';
import { LocalDeviceIdentity } from '../utils/p2pTransfer';
import { PeerDevice } from '../types/transfer';

interface QRCodeModalProps {
  initialTab: 'show' | 'scan';
  device: LocalDeviceIdentity;
  onConnectPeer: (peer: PeerDevice) => void;
  onBack: () => void;
}

export const QRCodeModal: React.FC<QRCodeModalProps> = ({ initialTab, device, onBack }) => {
  const [qrImage, setQrImage] = useState('');
  useEffect(() => {
    let active = true;
    QRCode.toDataURL(JSON.stringify({ app: 'ShareKita', deviceId: device.id, name: device.name }), {
      width: 220, margin: 2, color: { dark: '#0f172a', light: '#ffffff' },
    }).then((url) => { if (active) setQrImage(url); }).catch(() => { if (active) setQrImage(''); });
    return () => { active = false; };
  }, [device.id, device.name]);

  return (
    <main className="flex-1 w-full max-w-xl mx-auto p-4 flex flex-col gap-5">
      <div className="flex items-center gap-3">
        <button onClick={onBack} aria-label="Go back" className="p-2 rounded-xl border border-slate-200 hover:bg-slate-50"><ArrowLeft className="w-5 h-5" /></button>
        <div><h1 className="text-lg font-bold text-slate-900">Pair devices</h1><p className="text-xs text-slate-500">Scan a ShareKita code to connect</p></div>
      </div>
      <section className="rounded-2xl border border-slate-200 bg-white p-6 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-700"><QrCode className="w-6 h-6" /></div>
        <div className="mb-4 flex justify-center gap-2" role="tablist" aria-label="QR code mode">
          <span role="tab" aria-selected={initialTab === 'show'} className={`rounded-full px-4 py-1.5 text-xs font-semibold ${initialTab === 'show' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-500'}`}>My QR</span>
          <span role="tab" aria-selected={initialTab === 'scan'} className={`rounded-full px-4 py-1.5 text-xs font-semibold ${initialTab === 'scan' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-500'}`}>Scan QR</span>
        </div>
        {initialTab === 'show' ? <>
          {qrImage ? <img src={qrImage} alt="ShareKita device pairing QR code" className="mx-auto h-56 w-56" /> : <div className="mx-auto h-56 w-56 animate-pulse rounded-xl bg-slate-100" />}
          <p className="mt-3 text-sm font-bold text-slate-900">{device.name}</p>
          <p className="mt-1 text-xs text-slate-500">Have the other device scan this code to pair.</p>
        </> : <>
          <div className="mx-auto flex h-56 w-56 flex-col items-center justify-center rounded-2xl bg-slate-50 text-slate-400"><QrCode className="mb-3 h-10 w-10" /><p className="text-sm font-semibold">Use the camera to scan</p><p className="mt-1 text-xs">Camera scanning is not available in this browser.</p></div>
        </>}
      </section>
    </main>
  );
};
