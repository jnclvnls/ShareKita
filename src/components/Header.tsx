/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { 
  QrCode, 
  History, 
  Settings, 
  Wifi
} from 'lucide-react';
import { LocalDeviceIdentity } from '../utils/p2pTransfer';

interface HeaderProps {
  device: LocalDeviceIdentity;
  onOpenQR: () => void;
  onOpenHistory: () => void;
  onOpenSettings: () => void;
  networkStatus?: 'connected' | 'mesh' | 'offline';
  peersCount?: number;
}

export const Header: React.FC<HeaderProps> = ({
  device,
  onOpenQR,
  onOpenHistory,
  onOpenSettings,
}) => {
  return (
    <header className="bg-white border-b border-slate-200/80 sticky top-0 z-30 shadow-xs">
      <div className="max-w-4xl mx-auto px-4 py-2.5 flex items-center justify-between gap-3">
        {/* Brand Zone */}
        <div className="flex items-center gap-2.5 shrink-0">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-amber-400 to-yellow-400 flex items-center justify-center shadow-xs">
            {/* ShareKita iconic 3-ring logo */}
            <div className="relative w-5 h-5 flex items-center justify-center">
              <span className="absolute -top-0.5 -left-0.5 w-2.5 h-2.5 rounded-full bg-slate-900 border border-white" />
              <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-slate-900 border border-white" />
              <span className="absolute -bottom-0.5 w-2.5 h-2.5 rounded-full bg-slate-900 border border-white" />
              <svg className="w-3.5 h-3.5 text-slate-900" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                <path d="M7 9l5 6 5-6" />
              </svg>
            </div>
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-extrabold text-base tracking-tight text-slate-900">
                Share<span className="text-amber-500">Kita</span>
              </span>
              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 bg-amber-100/90 px-1.5 py-0.2 rounded-md">
                P2P
              </span>
            </div>
            <p className="text-[11px] text-slate-500 flex items-center gap-1 leading-none mt-0.5">
              <span className="font-medium">Nearby File Transfer</span>
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 shrink-0">
          {/* QR Code Quick Pairing */}
          <button
            onClick={onOpenQR}
            title="Show my pairing PIN & QR code"
            className="p-2 text-slate-700 hover:text-slate-900 hover:bg-amber-50 rounded-xl transition-colors border border-amber-200/70 flex items-center gap-1.5 text-xs font-semibold"
          >
            <QrCode className="w-4 h-4 text-amber-600" />
            <span className="hidden sm:inline">My PIN</span>
          </button>

          {/* History */}
          <button
            onClick={onOpenHistory}
            title="Transferred Files History"
            className="p-2 text-slate-700 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-colors flex items-center gap-1.5 text-xs font-semibold border border-slate-200/70"
          >
            <History className="w-4 h-4 text-slate-600" />
            <span className="hidden sm:inline">History</span>
          </button>

          {/* Settings / Lab Room */}
          <button
            onClick={onOpenSettings}
            title="Settings"
            className="p-2 text-slate-700 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-colors border border-slate-200/70"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
};
