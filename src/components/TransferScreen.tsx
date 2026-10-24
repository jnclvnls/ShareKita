/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  Pause, 
  Play, 
  RotateCcw, 
  Wifi, 
  WifiOff, 
  CheckCircle2, 
  FileText, 
  Zap, 
  ShieldCheck, 
  ArrowUpRight, 
  ArrowDownLeft, 
  AlertTriangle,
  HardDrive,
  Eye,
  Check
} from 'lucide-react';
import { ActiveTransferSession, TransferableFile, TransferHistoryRecord } from '../types/transfer';
import { LocalDeviceIdentity } from '../utils/p2pTransfer';
import { formatBytes, formatDuration, generateChecksum } from '../utils/fileData';

interface TransferScreenProps {
  session: ActiveTransferSession;
  device: LocalDeviceIdentity;
  onPause: () => void;
  onResume: () => void;
  onSimulateGlitch: () => void;
  onCancel: () => void;
  onComplete: (historyRecord: TransferHistoryRecord) => void;
  onPreviewFile: (file: TransferableFile) => void;
}

export const TransferScreen: React.FC<TransferScreenProps> = ({
  session,
  device,
  onPause,
  onResume,
  onSimulateGlitch,
  onCancel,
  onComplete,
  onPreviewFile,
}) => {
  // Session reactive states
  const [transferredBytes, setTransferredBytes] = useState(session.transferredBytes);
  const [currentFileIndex, setCurrentFileIndex] = useState(session.currentFileIndex);
  const [currentChunkIndex, setCurrentChunkIndex] = useState(session.currentChunkIndex);
  const [status, setStatus] = useState(session.status);
  const [speedMBps, setSpeedMBps] = useState(12.4);
  const [speedHistory, setSpeedHistory] = useState<number[]>([8.2, 11.5, 13.1, 12.4, 14.2]);
  const [recoveredCount, setRecoveredCount] = useState(0);
  const [lastVerifiedHash, setLastVerifiedHash] = useState('8f2a1b9c');
  const [countdown, setCountdown] = useState<number | null>(null);

  const totalBytes = session.totalBytes || 1;
  const progressPercent = Math.min(100, Math.round((transferredBytes / totalBytes) * 100));
  const remainingBytes = Math.max(0, totalBytes - transferredBytes);
  const estimatedSecondsLeft = speedMBps > 0 ? remainingBytes / (speedMBps * 1024 * 1024) : 0;

  const currentFile = session.files[currentFileIndex] || session.files[0];

  // Transfer Loop Simulation
  useEffect(() => {
    if (status !== 'transferring') return;

    const interval = setInterval(() => {
      setTransferredBytes((prev) => {
        // Transfer ~ 1.5 MB to 2.5 MB per tick (every 150ms) = ~12 MB/s
        const jitter = (Math.random() - 0.5) * 4;
        const currentSpeed = Math.max(8.5, Math.min(18.2, 13.5 + jitter));
        setSpeedMBps(parseFloat(currentSpeed.toFixed(1)));
        setSpeedHistory((h) => [...h.slice(-12), parseFloat(currentSpeed.toFixed(1))]);

        const chunkBytes = Math.floor((currentSpeed * 1024 * 1024) * 0.15);
        const nextBytes = prev + chunkBytes;

        // Check if finished current file or all files
        const nextChunk = Math.min(session.totalChunks, Math.floor((nextBytes / totalBytes) * session.totalChunks));
        setCurrentChunkIndex(nextChunk);
        setLastVerifiedHash(generateChecksum(nextChunk));

        // Determine current file
        let accumulated = 0;
        let fileIdx = 0;
        for (let i = 0; i < session.files.length; i++) {
          accumulated += session.files[i].size;
          if (nextBytes <= accumulated) {
            fileIdx = i;
            break;
          }
          if (i === session.files.length - 1) {
            fileIdx = i;
          }
        }
        setCurrentFileIndex(fileIdx);

        if (nextBytes >= totalBytes) {
          clearInterval(interval);
          setStatus('completed');
          // Build history record
          const record: TransferHistoryRecord = {
            id: `hist-${Date.now()}`,
            sessionId: session.sessionId,
            direction: session.direction === 'send' ? 'sent' : 'received',
            peerName: session.peer.name,
            peerDevice: `${session.peer.deviceType} (${session.peer.os})`,
            timestamp: Date.now(),
            totalSize: totalBytes,
            durationSeconds: parseFloat(((Date.now() - session.startTime) / 1000).toFixed(1)),
            avgSpeedMBps: 13.2,
            recoveredTimes: recoveredCount,
            files: session.files.map((f) => ({
              id: f.id,
              name: f.name,
              size: f.size,
              type: f.type,
              category: f.category,
              previewUrl: f.previewUrl,
              blobData: f.blob,
            })),
          };
          onComplete(record);
          return totalBytes;
        }

        return nextBytes;
      });
    }, 150);

    return () => clearInterval(interval);
  }, [status, totalBytes, session, recoveredCount, onComplete]);

  // Handle Wi-Fi drop simulation & auto-recovery
  const triggerInterruption = () => {
    if (status !== 'transferring') return;
    setStatus('interrupted');
    setSpeedMBps(0);
    setCountdown(2);

    const timer = setTimeout(() => {
      setStatus('recovering');
      setRecoveredCount((c) => c + 1);
      
      const resumeTimer = setTimeout(() => {
        setStatus('transferring');
        setCountdown(null);
      }, 1200);

      return () => clearTimeout(resumeTimer);
    }, 2000);

    return () => clearTimeout(timer);
  };

  const handleTogglePause = () => {
    if (status === 'transferring') {
      setStatus('paused');
      setSpeedMBps(0);
      onPause();
    } else if (status === 'paused') {
      setStatus('transferring');
      onResume();
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-white min-h-screen text-slate-900">
      {/* Top Header */}
      <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between sticky top-0 bg-white/95 backdrop-blur-md z-20">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-amber-400 flex items-center justify-center font-black text-slate-950 text-xs">
            SK
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900 leading-tight">
              {status === 'completed'
                ? 'Transfer Completed'
                : session.direction === 'send'
                ? 'Sending Files...'
                : 'Receiving Files...'}
            </h2>
            <p className="text-[11px] text-slate-500">
              Session #{session.roomCode} · {session.encryption}
            </p>
          </div>
        </div>

        {status !== 'completed' && (
          <button
            onClick={onCancel}
            className="text-xs font-semibold text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 px-3 py-1.5 rounded-xl transition-colors"
          >
            Cancel
          </button>
        )}
      </div>

      <div className="flex-1 max-w-xl mx-auto w-full p-4 sm:p-5 flex flex-col gap-4">
        {/* Device To Device Transfer Bridge Banner */}
        <div className="bg-slate-900 text-white rounded-3xl p-5 relative overflow-hidden shadow-lg">
          {/* Subtle background glow */}
          <div className="absolute top-0 right-0 w-44 h-44 bg-amber-400/10 rounded-full blur-2xl pointer-events-none" />

          <div className="relative z-10 flex items-center justify-between">
            {/* Sender Device */}
            <div className="flex flex-col items-center gap-1.5 max-w-[100px] text-center">
              <div className="w-13 h-13 rounded-2xl bg-slate-800 border-2 border-amber-400 flex items-center justify-center text-2xl shadow-md">
                {session.direction === 'send' ? device.avatar : session.peer.avatar}
              </div>
              <span className="text-xs font-bold text-white truncate max-w-full">
                {session.direction === 'send' ? 'You' : session.peer.name.split(' ')[0]}
              </span>
              <span className="text-[10px] text-slate-400">Sender</span>
            </div>

            {/* Glowing Transfer Path */}
            <div className="flex-1 px-4 flex flex-col items-center">
              {status === 'transferring' ? (
                <div className="w-full flex flex-col items-center gap-1">
                  <div className="text-[11px] font-mono font-bold text-amber-400 flex items-center gap-1">
                    <Zap className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                    <span>{speedMBps} MB/s</span>
                  </div>
                  {/* Flowing animated beam */}
                  <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden relative border border-slate-700">
                    <div 
                      className="h-full bg-gradient-to-r from-amber-400 via-yellow-200 to-amber-400 animate-beam rounded-full"
                      style={{ width: '100%' }}
                    />
                  </div>
                  <span className="text-[10px] text-slate-400">Direct Local DataChannel</span>
                </div>
              ) : status === 'interrupted' ? (
                <div className="text-center">
                  <WifiOff className="w-6 h-6 text-rose-400 mx-auto animate-pulse" />
                  <span className="text-[10px] font-bold text-rose-300 mt-1 block">
                    Link Interrupted
                  </span>
                </div>
              ) : status === 'recovering' ? (
                <div className="text-center">
                  <RotateCcw className="w-6 h-6 text-amber-400 mx-auto animate-spin" />
                  <span className="text-[10px] font-bold text-amber-300 mt-1 block">
                    Resuming Chunks...
                  </span>
                </div>
              ) : status === 'paused' ? (
                <div className="text-center">
                  <Pause className="w-6 h-6 text-slate-400 mx-auto" />
                  <span className="text-[10px] font-medium text-slate-400 mt-1 block">Paused</span>
                </div>
              ) : (
                <div className="text-center">
                  <CheckCircle2 className="w-7 h-7 text-emerald-400 mx-auto" />
                  <span className="text-[10px] font-bold text-emerald-300 mt-1 block">Completed</span>
                </div>
              )}
            </div>

            {/* Receiver Device */}
            <div className="flex flex-col items-center gap-1.5 max-w-[100px] text-center">
              <div className="w-13 h-13 rounded-2xl bg-slate-800 border-2 border-slate-700 flex items-center justify-center text-2xl shadow-md">
                {session.direction === 'send' ? session.peer.avatar : device.avatar}
              </div>
              <span className="text-xs font-bold text-white truncate max-w-full">
                {session.direction === 'send' ? session.peer.name.split(' ')[0] : 'You'}
              </span>
              <span className="text-[10px] text-slate-400">Receiver</span>
            </div>
          </div>
        </div>

        {/* Interrupted Wi-Fi Glitch Alert Banner (if triggered) */}
        {status === 'interrupted' && (
          <div className="bg-rose-50 border border-rose-300 rounded-2xl p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <h4 className="text-xs font-bold text-rose-900">
                Connection Glitch Detected! Auto-Recovery Active
              </h4>
              <p className="text-[11px] text-rose-700 mt-0.5 leading-relaxed">
                Interrupted transfer state preserved at Chunk #{currentChunkIndex} (Hash: {lastVerifiedHash}). 
                Auto-reconnecting local mesh socket in {countdown}s without redownloading previous bytes.
              </p>
            </div>
          </div>
        )}

        {status === 'recovering' && (
          <div className="bg-amber-50 border border-amber-300 rounded-2xl p-4 flex items-start gap-3">
            <RotateCcw className="w-5 h-5 text-amber-700 shrink-0 mt-0.5 animate-spin" />
            <div className="flex-1">
              <h4 className="text-xs font-bold text-amber-900">
                Resuming From Checkpoint (Chunk #{currentChunkIndex})
              </h4>
              <p className="text-[11px] text-amber-700 mt-0.5">
                Integrity hash verified. Seamlessly continuing data flow without data corruption.
              </p>
            </div>
          </div>
        )}

        {/* Primary Progress Card */}
        <div className="bg-white rounded-3xl p-5 border border-slate-200/90 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Batch Progress ({session.files.length} Files)
            </span>
            <span className="text-2xl font-black text-slate-900 tabular-nums">
              {progressPercent}%
            </span>
          </div>

          {/* Progress bar */}
          <div className="w-full h-3 rounded-full bg-slate-100 overflow-hidden relative">
            <div
              className={`h-full transition-all duration-200 rounded-full ${
                status === 'completed'
                  ? 'bg-emerald-500'
                  : status === 'interrupted'
                  ? 'bg-rose-500'
                  : 'bg-gradient-to-r from-amber-400 to-yellow-400'
              }`}
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          {/* Transfer stats row */}
          <div className="grid grid-cols-3 gap-2 mt-4 pt-3 border-t border-slate-100 text-center">
            <div>
              <div className="text-xs font-bold text-slate-900 tabular-nums">
                {formatBytes(transferredBytes)} / {formatBytes(totalBytes)}
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">Transferred</div>
            </div>

            <div>
              <div className="text-xs font-bold text-amber-600 tabular-nums">
                {status === 'completed' ? 'Done' : `${speedMBps} MB/s`}
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">Current Speed</div>
            </div>

            <div>
              <div className="text-xs font-bold text-slate-900 tabular-nums">
                {status === 'completed' ? '0s' : formatDuration(estimatedSecondsLeft)}
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">Est. Remaining</div>
            </div>
          </div>

          {/* Chunk details and resilience indicator */}
          <div className="mt-3.5 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
            <div className="flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              <span>Chunk #{currentChunkIndex} of {session.totalChunks} (512 KB)</span>
            </div>
            {recoveredCount > 0 && (
              <span className="text-amber-700 font-bold bg-amber-100 px-2 py-0.5 rounded-full text-[10px]">
                {recoveredCount} {recoveredCount === 1 ? 'Glitch Recovered' : 'Glitches Recovered'}
              </span>
            )}
          </div>
        </div>

        {/* Speed Sparkline History Card */}
        {status === 'transferring' && (
          <div className="bg-slate-50 rounded-2xl p-3 border border-slate-200/80">
            <div className="flex items-center justify-between text-xs mb-2">
              <span className="font-semibold text-slate-600">Local Wi-Fi Throughput</span>
              <span className="text-[11px] font-mono font-medium text-slate-500">
                Peak: {Math.max(...speedHistory)} MB/s
              </span>
            </div>
            {/* Sparkline visualization */}
            <div className="h-10 flex items-end gap-1.5 px-1">
              {speedHistory.map((val, idx) => {
                const heightPct = Math.max(15, Math.min(100, (val / 20) * 100));
                return (
                  <div
                    key={idx}
                    className="flex-1 bg-amber-400 hover:bg-amber-500 rounded-t-xs transition-all"
                    style={{ height: `${heightPct}%` }}
                    title={`${val} MB/s`}
                  />
                );
              })}
            </div>
          </div>
        )}

        {/* Interactive Resiliency & Recovery Controls */}
        {status !== 'completed' && (
          <div className="grid grid-cols-2 gap-2.5">
            {/* Pause / Resume Button */}
            <button
              onClick={handleTogglePause}
              className={`py-3 px-4 rounded-2xl font-bold text-xs flex items-center justify-center gap-2 transition-colors ${
                status === 'paused'
                  ? 'bg-amber-400 text-slate-950 hover:bg-amber-500'
                  : 'bg-slate-100 text-slate-800 hover:bg-slate-200'
              }`}
            >
              {status === 'paused' ? (
                <>
                  <Play className="w-4 h-4 fill-slate-950" />
                  <span>Resume Transfer</span>
                </>
              ) : (
                <>
                  <Pause className="w-4 h-4 fill-slate-800" />
                  <span>Pause Transfer</span>
                </>
              )}
            </button>

            {/* Test Wi-Fi Drop & Interrupted-Transfer Recovery Button */}
            <button
              onClick={triggerInterruption}
              disabled={status !== 'transferring'}
              className="py-3 px-4 rounded-2xl font-bold text-xs bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
              title="Test resilient chunk recovery when Wi-Fi is temporarily disconnected"
            >
              <WifiOff className="w-4 h-4" />
              <span>Simulate Wi-Fi Drop</span>
            </button>
          </div>
        )}

        {/* File Transfer Manifest List */}
        <div className="bg-white rounded-3xl p-4 border border-slate-200/90 shadow-2xs">
          <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-2.5">
            File Queue
          </h3>

          <div className="space-y-2">
            {session.files.map((file, idx) => {
              const isDone = idx < currentFileIndex || status === 'completed';
              const isCurrent = idx === currentFileIndex && status !== 'completed';
              return (
                <div
                  key={file.id}
                  className={`p-2.5 rounded-2xl border flex items-center justify-between gap-3 ${
                    isCurrent
                      ? 'bg-amber-50/50 border-amber-300'
                      : isDone
                      ? 'bg-slate-50 border-slate-200 text-slate-700'
                      : 'bg-white border-slate-100 text-slate-400'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold ${
                        isDone
                          ? 'bg-emerald-100 text-emerald-700'
                          : isCurrent
                          ? 'bg-amber-400 text-slate-950'
                          : 'bg-slate-100 text-slate-400'
                      }`}
                    >
                      {isDone ? <Check className="w-4 h-4 stroke-[3]" /> : idx + 1}
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-xs font-bold truncate text-slate-900">
                        {file.name}
                      </h4>
                      <span className="text-[10px] text-slate-500 tabular-nums">
                        {formatBytes(file.size)}
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={() => onPreviewFile(file)}
                    className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
                    title="Quick preview"
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Completion Action Sheet */}
        {status === 'completed' && (
          <div className="bg-emerald-50 border border-emerald-300 rounded-3xl p-5 text-center shadow-md">
            <div className="w-12 h-12 rounded-full bg-emerald-500 text-white flex items-center justify-center mx-auto mb-2 shadow-sm">
              <Check className="w-6 h-6 stroke-[3]" />
            </div>
            <h3 className="text-base font-black text-emerald-950">
              All Files Transferred Successfully!
            </h3>
            <p className="text-xs text-emerald-800 mt-1">
              Transferred {formatBytes(totalBytes)} at ~{speedMBps} MB/s without cloud uploads.
            </p>

            <div className="mt-4 flex gap-2 justify-center">
              <button
                onClick={() => onPreviewFile(session.files[0])}
                className="px-4 py-2 bg-white text-slate-900 border border-slate-200 rounded-xl text-xs font-bold hover:bg-slate-50 shadow-xs"
              >
                Preview Files
              </button>
              <button
                onClick={onCancel}
                className="px-5 py-2 bg-gradient-to-r from-amber-400 to-yellow-400 text-slate-950 rounded-xl text-xs font-bold hover:brightness-105 shadow-xs"
              >
                Back to Home
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
