/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { 
  ArrowUpRight, 
  ArrowDownLeft, 
  QrCode, 
  ShieldCheck, 
  Radio, 
  FileText, 
  HardDrive, 
  Layers, 
  ChevronRight, 
  Sparkles,
  Wifi,
  Laptop
} from 'lucide-react';
import { LocalDeviceIdentity } from '../utils/p2pTransfer';
import { TransferHistoryRecord } from '../types/transfer';
import { formatBytes } from '../utils/fileData';

interface HomeDashboardProps {
  device: LocalDeviceIdentity;
  onStartSend: () => void;
  onStartReceive: () => void;
  onScanQR: () => void;
  onOpenHistory: () => void;
  onOpenSettings: () => void;
  recentTransfers: TransferHistoryRecord[];
  onPreviewFile: (file: any) => void;
}

export const HomeDashboard: React.FC<HomeDashboardProps> = ({
  device,
  onStartSend,
  onStartReceive,
  onScanQR,
  onOpenHistory,
  onOpenSettings,
  recentTransfers,
  onPreviewFile,
}) => {
  // Aggregate stats
  const totalFilesTransferred = recentTransfers.reduce((acc, r) => acc + r.files.length, 0);
  const totalBytesTransferred = recentTransfers.reduce((acc, r) => acc + r.totalSize, 0);

  return (
    <div className="flex-1 flex flex-col p-4 sm:p-5 max-w-xl mx-auto w-full gap-5 pb-8">
      {/* Device Identity Pill Card */}
      <div className="bg-white rounded-2xl p-3.5 border border-slate-200/80 shadow-xs flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center text-xl shadow-xs">
            {device.avatar}
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-slate-900 text-sm">{device.name}</span>
              <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded-md border border-emerald-200">
                Ready
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-0.5">
              <span>{device.os}</span>
              <span>·</span>
              <span className="text-emerald-700 font-medium">Ready to share</span>
            </div>
          </div>
        </div>

        <button 
          onClick={onOpenSettings}
          className="text-xs font-semibold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-xl transition-colors"
        >
          Edit
        </button>
      </div>

      {/* SHAREit Signature Giant Dual Action Buttons */}
      <div className="grid grid-cols-2 gap-3.5">
        {/* SEND BUTTON */}
        <button
          onClick={onStartSend}
          className="group relative overflow-hidden bg-gradient-to-br from-amber-400 via-amber-400 to-yellow-500 p-5 rounded-3xl text-left shadow-md shadow-amber-300/40 hover:shadow-lg hover:shadow-amber-400/50 active:scale-[0.98] transition-all duration-200 flex flex-col justify-between h-44 cursor-pointer"
        >
          <div className="flex items-center justify-between w-full">
            <div className="w-12 h-12 rounded-2xl bg-slate-900/10 backdrop-blur-xs flex items-center justify-center text-slate-900 transition-transform group-hover:scale-110">
              <ArrowUpRight className="w-6 h-6 stroke-[2.5]" />
            </div>
            <span className="w-2.5 h-2.5 rounded-full bg-slate-900/20" />
          </div>

          <div>
            <h2 className="text-2xl font-black text-slate-950 tracking-tight">SEND</h2>
            <p className="text-xs text-slate-800 font-medium mt-1 leading-snug">
              Select files, photos, videos & apps
            </p>
          </div>
        </button>

        {/* RECEIVE BUTTON */}
        <button
          onClick={onStartReceive}
          className="group relative overflow-hidden bg-white border-2 border-amber-300 p-5 rounded-3xl text-left shadow-sm hover:border-amber-400 hover:shadow-md active:scale-[0.98] transition-all duration-200 flex flex-col justify-between h-44 cursor-pointer"
        >
          {/* Subtle radar ripple effect */}
          <div className="absolute -right-4 -bottom-4 w-28 h-28 rounded-full bg-amber-100/60 pointer-events-none group-hover:scale-125 transition-transform duration-500" />
          
          <div className="flex items-center justify-between w-full relative z-10">
            <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600 transition-transform group-hover:scale-110">
              <ArrowDownLeft className="w-6 h-6 stroke-[2.5]" />
            </div>
            <div className="flex items-center gap-1 text-[11px] font-bold text-amber-800 bg-amber-100/80 px-2 py-0.5 rounded-full">
              <Radio className="w-3 h-3 animate-pulse text-amber-600" />
              Listen
            </div>
          </div>

          <div className="relative z-10">
            <h2 className="text-2xl font-black text-slate-900 tracking-tight">RECEIVE</h2>
            <p className="text-xs text-slate-600 font-medium mt-1 leading-snug">
              Show a PIN and wait for a sender
            </p>
          </div>
        </button>
      </div>

      {/* Quick Tools Carousel */}
      <div className="grid grid-cols-4 gap-2">
        <button
          onClick={onScanQR}
          className="bg-white border border-slate-200/90 rounded-2xl p-3 flex flex-col items-center justify-center gap-1.5 hover:bg-amber-50/50 hover:border-amber-200 transition-colors shadow-2xs"
        >
          <div className="w-9 h-9 rounded-xl bg-amber-100/80 flex items-center justify-center text-amber-700">
            <QrCode className="w-4 h-4" />
          </div>
          <span className="text-[11px] font-semibold text-slate-800 text-center">Scan QR</span>
        </button>

        <button
          onClick={onStartReceive}
          className="bg-white border border-slate-200/90 rounded-2xl p-3 flex flex-col items-center justify-center gap-1.5 hover:bg-amber-50/50 hover:border-amber-200 transition-colors shadow-2xs"
        >
          <div className="w-9 h-9 rounded-xl bg-amber-100/80 flex items-center justify-center text-amber-700">
            <Radio className="w-4 h-4" />
          </div>
          <span className="text-[11px] font-semibold text-slate-800 text-center">My PIN</span>
        </button>

        <button
          onClick={onOpenHistory}
          className="bg-white border border-slate-200/90 rounded-2xl p-3 flex flex-col items-center justify-center gap-1.5 hover:bg-amber-50/50 hover:border-amber-200 transition-colors shadow-2xs"
        >
          <div className="w-9 h-9 rounded-xl bg-amber-100/80 flex items-center justify-center text-amber-700">
            <FileText className="w-4 h-4" />
          </div>
          <span className="text-[11px] font-semibold text-slate-800 text-center">History</span>
        </button>

        <button
          onClick={onOpenSettings}
          className="bg-white border border-slate-200/90 rounded-2xl p-3 flex flex-col items-center justify-center gap-1.5 hover:bg-amber-50/50 hover:border-amber-200 transition-colors shadow-2xs"
        >
          <div className="w-9 h-9 rounded-xl bg-amber-100/80 flex items-center justify-center text-amber-700">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <span className="text-[11px] font-semibold text-slate-800 text-center">Privacy</span>
        </button>
      </div>

      {/* Storage & Transfer Metric Summary */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <HardDrive className="w-4 h-4 text-slate-700" />
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">This Session</h3>
          </div>
          <span className="text-xs text-slate-500 font-medium">Resets when you close the app</span>
        </div>

        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
            <div className="text-lg font-black text-slate-900 tabular-nums">
              {formatBytes(totalBytesTransferred)}
            </div>
            <div className="text-[11px] text-slate-500 font-medium mt-0.5">Shared Data</div>
          </div>
          <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
            <div className="text-lg font-black text-amber-600 tabular-nums">
              {totalFilesTransferred}
            </div>
            <div className="text-[11px] text-slate-500 font-medium mt-0.5">Total Files</div>
          </div>
          <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
            <div className="text-lg font-black text-emerald-600 tabular-nums">
              {recentTransfers.length}
            </div>
            <div className="text-[11px] text-slate-500 font-medium mt-0.5">Transfers</div>
          </div>
        </div>
      </div>

      {/* Recent Transferred Items */}
      <div>
        <div className="flex items-center justify-between mb-2.5 px-0.5">
          <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Recent Transfers</h3>
          {recentTransfers.length > 0 && (
            <button 
              onClick={onOpenHistory}
              className="text-xs font-bold text-amber-700 hover:text-amber-800 flex items-center gap-0.5"
            >
              See All <ChevronRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {recentTransfers.length === 0 ? (
          <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-2xs text-center flex flex-col items-center justify-center">
            <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-400 mb-2">
              <FileText className="w-5 h-5 text-slate-400" />
            </div>
            <p className="text-xs font-bold text-slate-700">No recent transfers</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Files you send or receive in this session will appear here</p>
          </div>
        ) : (
          <div className="space-y-2">
            {recentTransfers.slice(0, 3).map((item) => (
              <div 
                key={item.id} 
                className="bg-white rounded-2xl p-3 border border-slate-200/80 shadow-2xs flex items-center justify-between gap-3 hover:border-amber-300 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                    item.direction === 'received' 
                      ? 'bg-amber-100 text-amber-800' 
                      : 'bg-slate-100 text-slate-700'
                  }`}>
                    {item.direction === 'received' ? (
                      <ArrowDownLeft className="w-5 h-5 text-amber-700" />
                    ) : (
                      <ArrowUpRight className="w-5 h-5 text-slate-700" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-xs font-bold text-slate-900 truncate">
                      {item.files[0]?.name || 'Files package'}
                      {item.files.length > 1 && ` +${item.files.length - 1} more`}
                    </h4>
                    <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-0.5">
                      <span>{item.peerName}</span>
                      <span>·</span>
                      <span className="tabular-nums">{formatBytes(item.totalSize)}</span>
                      <span>·</span>
                      <span className="text-emerald-700 font-medium tabular-nums">{item.avgSpeedMBps} MB/s</span>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => onPreviewFile(item.files[0])}
                  className="text-xs font-semibold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-amber-100 px-3 py-1.5 rounded-xl transition-colors shrink-0"
                >
                  View
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
