/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  Pause,
  Play,
  WifiOff,
  CheckCircle2,
  Zap,
  ShieldCheck,
  Eye,
  Check,
  Download,
  AlertTriangle,
} from 'lucide-react';
import { TransferableFile, TransferHistoryRecord, TransferStatus } from '../types/transfer';
import { LocalDeviceIdentity } from '../utils/p2pTransfer';
import { CHUNK_SIZE, Link, PeerProfile } from '../utils/peerSession';
import { formatBytes, formatDuration } from '../utils/fileData';

interface TransferScreenProps {
  direction: 'send' | 'receive';
  link: Link;
  device: LocalDeviceIdentity;
  peer: PeerProfile;
  files: TransferableFile[];
  onFinish: (record: TransferHistoryRecord) => void;
  onExit: () => void;
  onPreviewFile: (file: TransferableFile) => void;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function downloadBlob(file: TransferableFile) {
  const blob = file.blob;
  if (!blob) return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

export const TransferScreen: React.FC<TransferScreenProps> = ({
  direction,
  link,
  device,
  peer,
  files,
  onFinish,
  onExit,
  onPreviewFile,
}) => {
  const [status, setStatus] = useState<TransferStatus>('transferring');
  const [transferredBytes, setTransferredBytes] = useState(0);
  const [currentFileIndex, setCurrentFileIndex] = useState(0);
  const [speedMBps, setSpeedMBps] = useState(0);
  const [speedHistory, setSpeedHistory] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [resultFiles, setResultFiles] = useState<TransferableFile[]>(files);

  const progressRef = useRef(0);
  const pausedRef = useRef(false);
  const finishedRef = useRef(false);
  const abortRef = useRef(false);
  const startedRef = useRef(false);
  const startTimeRef = useRef(Date.now());

  const totalBytes = files.reduce((a, f) => a + f.size, 0) || 1;
  const progressPercent = Math.min(100, Math.round((transferredBytes / totalBytes) * 100));
  const remainingBytes = Math.max(0, totalBytes - transferredBytes);
  const estimatedSecondsLeft = speedMBps > 0 ? remainingBytes / (speedMBps * 1024 * 1024) : 0;
  const peerShort = peer.name || 'Other device';

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    const fail = (message: string) => {
      if (finishedRef.current) return;
      finishedRef.current = true;
      abortRef.current = true;
      setError(message);
      setStatus('failed');
    };

    const complete = (finalFiles: TransferableFile[]) => {
      if (finishedRef.current) return;
      finishedRef.current = true;
      const seconds = Math.max(0.1, (Date.now() - startTimeRef.current) / 1000);
      setTransferredBytes(totalBytes);
      setResultFiles(finalFiles);
      setStatus('completed');
      onFinish({
        id: `hist-${Date.now()}`,
        sessionId: `sess-${Date.now()}`,
        direction: direction === 'send' ? 'sent' : 'received',
        peerName: peer.name,
        peerDevice: peer.os ? `${peer.deviceType} (${peer.os})` : peer.deviceType,
        timestamp: Date.now(),
        totalSize: totalBytes,
        durationSeconds: parseFloat(seconds.toFixed(1)),
        avgSpeedMBps: parseFloat((totalBytes / seconds / (1024 * 1024)).toFixed(2)),
        recoveredTimes: 0,
        files: finalFiles.map((f) => ({
          id: f.id,
          name: f.name,
          size: f.size,
          type: f.type,
          category: f.category,
          extension: f.extension,
          previewUrl: f.previewUrl,
          blobData: f.blob,
        })),
      });
    };

    link.onClose = () => fail('The connection to the other device was lost.');

    // Real throughput / progress ticker
    let lastBytes = 0;
    let lastTime = Date.now();
    let smoothed = 0;
    const ticker = setInterval(() => {
      if (finishedRef.current) return;
      const now = Date.now();
      const bytes =
        direction === 'send'
          ? Math.max(0, progressRef.current - link.pendingBytes)
          : progressRef.current;
      const dt = (now - lastTime) / 1000;
      if (dt > 0) {
        const inst = Math.max(0, (bytes - lastBytes) / dt / (1024 * 1024));
        smoothed = smoothed === 0 ? inst : smoothed * 0.6 + inst * 0.4;
        setSpeedMBps(parseFloat(smoothed.toFixed(2)));
        setSpeedHistory((h) => [...h.slice(-14), parseFloat(smoothed.toFixed(2))]);
      }
      lastBytes = bytes;
      lastTime = now;
      setTransferredBytes(Math.min(bytes, totalBytes));
    }, 500);

    if (direction === 'send') {
      let ackResolve: (() => void) | null = null;
      const acked = new Promise<void>((res) => {
        ackResolve = res;
      });

      link.setHandler((msg) => {
        if (msg.t === 'cancel') fail(`${peerShort} cancelled the transfer.`);
        else if (msg.t === 'received-all') ackResolve?.();
      });

      (async () => {
        try {
          for (let i = 0; i < files.length; i++) {
            const f = files[i];
            const source = f.blob || f.realFile;
            if (!source) throw new Error(`Cannot read ${f.name}`);
            setCurrentFileIndex(i);
            link.send({ t: 'file-start', id: f.id });

            for (let offset = 0; offset < source.size; offset += CHUNK_SIZE) {
              while (pausedRef.current && !abortRef.current) await sleep(100);
              if (abortRef.current) return;
              while (link.pendingBytes > 4 * 1024 * 1024 && !abortRef.current) await sleep(15);
              if (abortRef.current) return;
              const buf = await source.slice(offset, offset + CHUNK_SIZE).arrayBuffer();
              link.send({ t: 'chunk', id: f.id, data: buf });
              progressRef.current += buf.byteLength;
            }
            link.send({ t: 'file-end', id: f.id });
          }
          link.send({ t: 'all-done' });

          // wait for receiver confirmation
          await Promise.race([acked, sleep(10 * 60 * 1000)]);
          if (!abortRef.current) complete(files);
        } catch (e: any) {
          fail(e?.message || 'Transfer failed.');
        }
      })();
    } else {
      const parts = new Map<string, BlobPart[]>();
      const done = new Map<string, Blob>();

      link.setHandler((msg) => {
        switch (msg.t) {
          case 'file-start': {
            parts.set(msg.id, []);
            const idx = files.findIndex((f) => f.id === msg.id);
            if (idx >= 0) setCurrentFileIndex(idx);
            break;
          }
          case 'chunk': {
            const list = parts.get(msg.id);
            if (list) {
              list.push(msg.data as BlobPart);
              progressRef.current += (msg.data as ArrayBuffer).byteLength ?? 0;
            }
            break;
          }
          case 'file-end': {
            const meta = files.find((f) => f.id === msg.id);
            done.set(msg.id, new Blob(parts.get(msg.id) || [], { type: meta?.type || 'application/octet-stream' }));
            parts.delete(msg.id);
            break;
          }
          case 'all-done': {
            const finalFiles = files.map((f) => {
              const blob = done.get(f.id);
              const previewable = f.category === 'photos' || f.category === 'audio' || f.category === 'videos';
              return {
                ...f,
                blob,
                previewUrl: blob && previewable ? URL.createObjectURL(blob) : undefined,
              };
            });
            link.send({ t: 'received-all' });
            complete(finalFiles);
            break;
          }
          case 'cancel':
            fail(`${peerShort} cancelled the transfer.`);
            break;
        }
      });
    }

    return () => {
      clearInterval(ticker);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleTogglePause = () => {
    if (direction !== 'send') return;
    if (status === 'transferring') {
      pausedRef.current = true;
      setStatus('paused');
      setSpeedMBps(0);
    } else if (status === 'paused') {
      pausedRef.current = false;
      setStatus('transferring');
    }
  };

  const handleCancel = () => {
    abortRef.current = true;
    if (!finishedRef.current) {
      try {
        link.send({ t: 'cancel' });
      } catch {
        // ignore
      }
    }
    finishedRef.current = true;
    setTimeout(() => link.destroy(), 200);
    onExit();
  };

  const handleDone = () => {
    link.destroy();
    onExit();
  };

  const active = status === 'transferring' || status === 'paused';
  const currentFile = files[currentFileIndex];

  return (
    <div className="flex-1 flex flex-col bg-white min-h-screen text-slate-900">
      <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between sticky top-0 bg-white/95 backdrop-blur-md z-20">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-amber-400 flex items-center justify-center font-black text-slate-950 text-xs">
            SK
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900 leading-tight">
              {status === 'completed'
                ? 'Transfer Completed'
                : status === 'failed'
                ? 'Transfer Stopped'
                : direction === 'send'
                ? 'Sending Files...'
                : 'Receiving Files...'}
            </h2>
            <p className="text-[11px] text-slate-500">Encrypted direct connection</p>
          </div>
        </div>

        {active && (
          <button
            onClick={handleCancel}
            className="text-xs font-semibold text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 px-3 py-1.5 rounded-xl transition-colors"
          >
            Cancel
          </button>
        )}
      </div>

      <div className="flex-1 max-w-xl mx-auto w-full p-4 sm:p-5 flex flex-col gap-4">
        {/* Device bridge */}
        <div className="bg-slate-900 text-white rounded-3xl p-5 relative overflow-hidden shadow-lg">
          <div className="absolute top-0 right-0 w-44 h-44 bg-amber-400/10 rounded-full blur-2xl pointer-events-none" />
          <div className="relative z-10 flex items-center justify-between">
            <div className="flex flex-col items-center gap-1.5 max-w-[100px] text-center">
              <div className="w-14 h-14 rounded-2xl bg-slate-800 border-2 border-amber-400 flex items-center justify-center text-2xl shadow-md">
                {direction === 'send' ? device.avatar : peer.avatar}
              </div>
              <span className="text-xs font-bold text-white truncate max-w-full">
                {direction === 'send' ? 'You' : peerShort}
              </span>
              <span className="text-[10px] text-slate-400">Sender</span>
            </div>

            <div className="flex-1 px-4 flex flex-col items-center">
              {status === 'transferring' ? (
                <div className="w-full flex flex-col items-center gap-1">
                  <div className="text-[11px] font-mono font-bold text-amber-400 flex items-center gap-1">
                    <Zap className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                    <span>{speedMBps} MB/s</span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden relative border border-slate-700">
                    <div className="h-full bg-gradient-to-r from-amber-400 via-yellow-200 to-amber-400 animate-beam rounded-full w-full" />
                  </div>
                  <span className="text-[10px] text-slate-400">Direct connection</span>
                </div>
              ) : status === 'paused' ? (
                <div className="text-center">
                  <Pause className="w-6 h-6 text-slate-400 mx-auto" />
                  <span className="text-[10px] font-medium text-slate-400 mt-1 block">Paused</span>
                </div>
              ) : status === 'failed' ? (
                <div className="text-center">
                  <WifiOff className="w-6 h-6 text-rose-400 mx-auto" />
                  <span className="text-[10px] font-bold text-rose-300 mt-1 block">Stopped</span>
                </div>
              ) : (
                <div className="text-center">
                  <CheckCircle2 className="w-7 h-7 text-emerald-400 mx-auto" />
                  <span className="text-[10px] font-bold text-emerald-300 mt-1 block">Completed</span>
                </div>
              )}
            </div>

            <div className="flex flex-col items-center gap-1.5 max-w-[100px] text-center">
              <div className="w-14 h-14 rounded-2xl bg-slate-800 border-2 border-slate-700 flex items-center justify-center text-2xl shadow-md">
                {direction === 'send' ? peer.avatar : device.avatar}
              </div>
              <span className="text-xs font-bold text-white truncate max-w-full">
                {direction === 'send' ? peerShort : 'You'}
              </span>
              <span className="text-[10px] text-slate-400">Receiver</span>
            </div>
          </div>
        </div>

        {status === 'failed' && (
          <div className="bg-rose-50 border border-rose-300 rounded-2xl p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <h4 className="text-xs font-bold text-rose-900">Transfer didn't finish</h4>
              <p className="text-[11px] text-rose-700 mt-0.5 leading-relaxed">{error}</p>
              <button
                onClick={handleDone}
                className="mt-3 px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold"
              >
                Back to Home
              </button>
            </div>
          </div>
        )}

        {/* Progress */}
        <div className="bg-white rounded-3xl p-5 border border-slate-200/90 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Progress ({files.length} {files.length === 1 ? 'file' : 'files'})
            </span>
            <span className="text-2xl font-black text-slate-900 tabular-nums">
              {status === 'completed' ? 100 : progressPercent}%
            </span>
          </div>

          <div className="w-full h-3 rounded-full bg-slate-100 overflow-hidden">
            <div
              className={`h-full transition-all duration-300 rounded-full ${
                status === 'completed'
                  ? 'bg-emerald-500'
                  : status === 'failed'
                  ? 'bg-rose-500'
                  : 'bg-gradient-to-r from-amber-400 to-yellow-400'
              }`}
              style={{ width: `${status === 'completed' ? 100 : progressPercent}%` }}
            />
          </div>

          <div className="grid grid-cols-3 gap-2 mt-4 pt-3 border-t border-slate-100 text-center">
            <div>
              <div className="text-xs font-bold text-slate-900 tabular-nums">
                {formatBytes(status === 'completed' ? totalBytes : transferredBytes)} / {formatBytes(totalBytes)}
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
                {status === 'completed' ? '0s' : status === 'transferring' && speedMBps > 0 ? formatDuration(estimatedSecondsLeft) : '—'}
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">Est. Remaining</div>
            </div>
          </div>

          <div className="mt-3.5 pt-3 border-t border-slate-100 flex items-center gap-1.5 text-[11px] text-slate-500">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            <span className="truncate">
              {active && currentFile ? `Now: ${currentFile.name}` : 'End-to-end encrypted (WebRTC DTLS)'}
            </span>
          </div>
        </div>

        {status === 'transferring' && speedHistory.length > 1 && (
          <div className="bg-slate-50 rounded-2xl p-3 border border-slate-200/80">
            <div className="flex items-center justify-between text-xs mb-2">
              <span className="font-semibold text-slate-600">Throughput</span>
              <span className="text-[11px] font-mono font-medium text-slate-500">
                Peak: {Math.max(...speedHistory)} MB/s
              </span>
            </div>
            <div className="h-10 flex items-end gap-1.5 px-1">
              {speedHistory.map((val, idx) => {
                const peak = Math.max(...speedHistory, 0.1);
                const heightPct = Math.max(8, Math.min(100, (val / peak) * 100));
                return (
                  <div
                    key={idx}
                    className="flex-1 bg-amber-400 rounded-t-xs transition-all"
                    style={{ height: `${heightPct}%` }}
                    title={`${val} MB/s`}
                  />
                );
              })}
            </div>
          </div>
        )}

        {direction === 'send' && active && (
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
        )}

        {/* File list */}
        <div className="bg-white rounded-3xl p-4 border border-slate-200/90 shadow-2xs">
          <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-2.5">Files</h3>
          <div className="space-y-2">
            {resultFiles.map((file, idx) => {
              const isDone = status === 'completed' || idx < currentFileIndex;
              const isCurrent = idx === currentFileIndex && active;
              const canUse = status === 'completed' && !!(file.blob || file.realFile);
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
                      className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold shrink-0 ${
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
                      <h4 className="text-xs font-bold truncate text-slate-900">{file.name}</h4>
                      <span className="text-[10px] text-slate-500 tabular-nums">{formatBytes(file.size)}</span>
                    </div>
                  </div>

                  {canUse && (
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => onPreviewFile(file)}
                        className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
                        title="Preview"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      {direction === 'receive' && (
                        <button
                          onClick={() => downloadBlob(file)}
                          className="p-1.5 text-amber-700 hover:bg-amber-100 rounded-lg transition-colors"
                          title="Save to this device"
                        >
                          <Download className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {status === 'completed' && (
          <div className="bg-emerald-50 border border-emerald-300 rounded-3xl p-5 text-center shadow-md">
            <div className="w-12 h-12 rounded-full bg-emerald-500 text-white flex items-center justify-center mx-auto mb-2 shadow-sm">
              <Check className="w-6 h-6 stroke-[3]" />
            </div>
            <h3 className="text-base font-black text-emerald-950">
              {direction === 'send' ? 'Files sent successfully!' : 'Files received!'}
            </h3>
            <p className="text-xs text-emerald-800 mt-1">
              {direction === 'receive'
                ? 'Tap the download icon next to each file to save it to this device.'
                : `${formatBytes(totalBytes)} delivered directly to ${peerShort}.`}
            </p>
            <div className="mt-4 flex gap-2 justify-center flex-wrap">
              {direction === 'receive' && (
                <button
                  onClick={() => resultFiles.forEach((f, i) => setTimeout(() => downloadBlob(f), i * 400))}
                  className="px-4 py-2 bg-white text-slate-900 border border-slate-200 rounded-xl text-xs font-bold hover:bg-slate-50 shadow-xs flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" /> Save All
                </button>
              )}
              <button
                onClick={handleDone}
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
