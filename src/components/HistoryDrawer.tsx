/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  ArrowLeft, 
  Trash2, 
  ArrowUpRight, 
  ArrowDownLeft, 
  Search, 
  FileText, 
  ShieldCheck, 
  RotateCcw,
  Eye,
  Download
} from 'lucide-react';
import { TransferHistoryRecord } from '../types/transfer';
import { formatBytes } from '../utils/fileData';

interface HistoryDrawerProps {
  history: TransferHistoryRecord[];
  onClearHistory: () => void;
  onPreviewFile: (file: any) => void;
  onBack: () => void;
}

export const HistoryDrawer: React.FC<HistoryDrawerProps> = ({
  history,
  onClearHistory,
  onPreviewFile,
  onBack,
}) => {
  const [filter, setFilter] = useState<'all' | 'sent' | 'received'>('all');
  const [search, setSearch] = useState('');

  const filtered = history.filter((item) => {
    const matchesFilter = filter === 'all' || item.direction === filter;
    const matchesSearch =
      item.peerName.toLowerCase().includes(search.toLowerCase()) ||
      item.files.some((f) => f.name.toLowerCase().includes(search.toLowerCase()));
    return matchesFilter && matchesSearch;
  });

  const totalBytes = history.reduce((acc, h) => acc + h.totalSize, 0);

  return (
    <div className="flex-1 flex flex-col bg-slate-50 min-h-screen">
      {/* Top Header */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-20">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={onBack}
              className="p-2 -ml-1 text-slate-700 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h2 className="text-base font-bold text-slate-900 leading-tight">Transfer History</h2>
              <p className="text-[11px] text-slate-500">
                {history.length} records · {formatBytes(totalBytes)} shared
              </p>
            </div>
          </div>

          {history.length > 0 && (
            <button
              onClick={onClearHistory}
              title="Clear transfer logs"
              className="text-xs font-semibold text-rose-600 hover:text-rose-700 flex items-center gap-1 p-2 hover:bg-rose-50 rounded-xl transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              <span className="hidden sm:inline">Clear</span>
            </button>
          )}
        </div>

        {/* Filter Controls & Search */}
        <div className="max-w-2xl mx-auto px-4 pb-3 space-y-2">
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setFilter('all')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
                filter === 'all' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:text-slate-900'
              }`}
            >
              All Activity
            </button>
            <button
              onClick={() => setFilter('sent')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
                filter === 'sent' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:text-slate-900'
              }`}
            >
              Sent Files
            </button>
            <button
              onClick={() => setFilter('received')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
                filter === 'received' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:text-slate-900'
              }`}
            >
              Received Files
            </button>
          </div>

          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Filter by file name or device name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-slate-100 text-xs pl-9 pr-4 py-2 rounded-xl border border-transparent focus:border-amber-400 focus:bg-white focus:outline-none transition-all"
            />
          </div>
        </div>
      </div>

      {/* History Items */}
      <div className="flex-1 max-w-2xl mx-auto w-full p-4 space-y-3 pb-20">
        {filtered.length === 0 ? (
          <div className="bg-white rounded-3xl p-10 text-center border border-slate-200 shadow-2xs">
            <FileText className="w-12 h-12 text-slate-300 mx-auto mb-2" />
            <h4 className="text-sm font-bold text-slate-700">No transfer history yet</h4>
            <p className="text-xs text-slate-500 mt-1">
              Files you send or receive will show up here until you close the app.
            </p>
          </div>
        ) : (
          filtered.map((record) => (
            <div
              key={record.id}
              className="bg-white rounded-3xl p-4 border border-slate-200/90 shadow-2xs space-y-3"
            >
              {/* Record Header */}
              <div className="flex items-center justify-between pb-2.5 border-b border-slate-100">
                <div className="flex items-center gap-2.5">
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                      record.direction === 'received'
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {record.direction === 'received' ? (
                      <ArrowDownLeft className="w-4 h-4 text-amber-700" />
                    ) : (
                      <ArrowUpRight className="w-4 h-4 text-slate-700" />
                    )}
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-900">
                      {record.direction === 'received' ? 'Received from' : 'Sent to'}{' '}
                      <span className="text-amber-800">{record.peerName}</span>
                    </h4>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      {new Date(record.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · {record.peerDevice}
                    </div>
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-xs font-bold text-slate-900 tabular-nums">
                    {formatBytes(record.totalSize)}
                  </div>
                  <div className="text-[10px] text-emerald-700 font-semibold tabular-nums mt-0.5">
                    {record.avgSpeedMBps} MB/s
                  </div>
                </div>
              </div>

              {/* Files in this batch */}
              <div className="space-y-1.5">
                {record.files.map((file) => (
                  <div
                    key={file.id}
                    onClick={() => onPreviewFile(file)}
                    className="p-2 rounded-xl bg-slate-50 hover:bg-amber-50/60 border border-slate-100 hover:border-amber-200 flex items-center justify-between gap-2 cursor-pointer transition-colors"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="w-4 h-4 text-slate-500 shrink-0" />
                      <span className="text-xs font-medium text-slate-800 truncate">
                        {file.name}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[11px] text-slate-500 tabular-nums">
                        {formatBytes(file.size)}
                      </span>
                      <Eye className="w-3.5 h-3.5 text-slate-400 hover:text-slate-700" />
                    </div>
                  </div>
                ))}
              </div>

              {/* Resilience note if recovered */}
              {record.recoveredTimes > 0 && (
                <div className="text-[10px] text-amber-800 bg-amber-50 px-2 py-1 rounded-lg flex items-center gap-1 border border-amber-200/60">
                  <RotateCcw className="w-3 h-3 text-amber-600" />
                  <span>
                    Interrupted Wi-Fi connection safely recovered {record.recoveredTimes}x without data loss.
                  </span>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};
