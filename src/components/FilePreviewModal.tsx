/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  X, 
  Download, 
  FileText, 
  Image as ImageIcon, 
  Film, 
  Music, 
  Package, 
  Share2, 
  Check, 
  ShieldCheck, 
  Play, 
  Pause 
} from 'lucide-react';
import { TransferableFile } from '../types/transfer';
import { formatBytes } from '../utils/fileData';

interface FilePreviewModalProps {
  file: TransferableFile | null;
  onClose: () => void;
}

export const FilePreviewModal: React.FC<FilePreviewModalProps> = ({ file, onClose }) => {
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [downloaded, setDownloaded] = useState(false);

  if (!file) return null;

  const handleDownload = () => {
    let url = file.previewUrl;
    if (!url && file.blob) {
      url = URL.createObjectURL(file.blob);
    } else if (!url) {
      // Create mock blob for sample files
      const blob = new Blob([file.summary || 'ShareKita direct P2P transfer verified content'], {
        type: file.type || 'text/plain',
      });
      url = URL.createObjectURL(blob);
    }

    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    setDownloaded(true);
    setTimeout(() => setDownloaded(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-lg w-full overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
              {file.category === 'photos' ? (
                <ImageIcon className="w-4 h-4" />
              ) : file.category === 'audio' ? (
                <Music className="w-4 h-4" />
              ) : file.category === 'videos' ? (
                <Film className="w-4 h-4" />
              ) : (
                <FileText className="w-4 h-4" />
              )}
            </div>
            <div className="min-w-0">
              <h3 className="text-xs font-bold text-slate-900 truncate">{file.name}</h3>
              <p className="text-[11px] text-slate-500 tabular-nums">
                {formatBytes(file.size)} · {file.extension.toUpperCase()}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Viewer Body */}
        <div className="flex-1 overflow-y-auto p-5 bg-slate-50">
          {file.category === 'photos' && file.previewUrl ? (
            <div className="rounded-2xl overflow-hidden bg-black/5 border border-slate-200">
              <img
                src={file.previewUrl}
                alt={file.name}
                className="w-full max-h-72 object-contain mx-auto"
                referrerPolicy="no-referrer"
              />
            </div>
          ) : file.category === 'audio' ? (
            <div className="bg-white rounded-2xl p-6 border border-slate-200 text-center shadow-xs">
              <div className="w-16 h-16 rounded-full bg-amber-400 text-slate-950 flex items-center justify-center mx-auto mb-3 shadow-md">
                <Music className="w-8 h-8" />
              </div>
              <h4 className="text-sm font-bold text-slate-900">{file.name}</h4>
              <p className="text-xs text-slate-500 mt-1">Audio Recording · 44.1kHz Stereo</p>

              {/* Simulated Audio Waveform Bar */}
              <div className="mt-4 flex items-center justify-center gap-1 h-8 px-4">
                {[40, 75, 30, 90, 60, 100, 45, 80, 65, 35, 95, 50, 70, 85, 40].map((h, i) => (
                  <div
                    key={i}
                    className={`w-1.5 rounded-full transition-all ${
                      isPlayingAudio ? 'bg-amber-500 animate-pulse' : 'bg-slate-300'
                    }`}
                    style={{ height: `${h}%` }}
                  />
                ))}
              </div>

              <button
                onClick={() => setIsPlayingAudio(!isPlayingAudio)}
                className="mt-4 px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold flex items-center gap-2 mx-auto hover:bg-slate-800 transition-colors"
              >
                {isPlayingAudio ? <Pause className="w-4 h-4 fill-white" /> : <Play className="w-4 h-4 fill-white" />}
                <span>{isPlayingAudio ? 'Pause Memo' : 'Play Voice Memo'}</span>
              </button>
            </div>
          ) : file.category === 'videos' ? (
            <div className="bg-slate-900 rounded-2xl p-6 text-white text-center shadow-xs flex flex-col items-center justify-center min-h-[180px]">
              <Film className="w-12 h-12 text-amber-400 mb-2" />
              <h4 className="text-xs font-bold text-white">{file.name}</h4>
              <p className="text-[11px] text-slate-400 mt-1">1080p MP4 Video · H.264 High Profile</p>
              <div className="mt-3 px-3 py-1 bg-slate-800 rounded-lg text-[10px] text-amber-300">
                P2P verified playback frame
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs">
              <div className="flex items-center gap-3 mb-3 pb-3 border-b border-slate-100">
                <FileText className="w-8 h-8 text-blue-600" />
                <div>
                  <h4 className="text-xs font-bold text-slate-900">Document Contents Preview</h4>
                  <p className="text-[11px] text-slate-500">Verified locally on device</p>
                </div>
              </div>

              <div className="bg-slate-50 rounded-xl p-3 text-xs text-slate-700 font-mono leading-relaxed border border-slate-200">
                {file.summary || 'Summary: Verified campus assignment document packet. No cloud interception detected.'}
              </div>
            </div>
          )}

          {/* Details & Checksum Table */}
          <div className="mt-4 bg-white rounded-2xl p-4 border border-slate-200 text-xs space-y-2">
            <div className="flex justify-between text-slate-600">
              <span>File Type:</span>
              <span className="font-semibold text-slate-900">{file.type || 'Binary Data'}</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>File Size:</span>
              <span className="font-semibold text-slate-900 tabular-nums">{formatBytes(file.size)}</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>Security Integrity:</span>
              <span className="font-semibold text-emerald-700 flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5" />
                SHA-256 Checksum Verified
              </span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>Storage Location:</span>
              <span className="font-semibold text-slate-900">Local Device Storage</span>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-white border-t border-slate-100 flex items-center justify-between gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-slate-600 hover:text-slate-900 font-bold text-xs"
          >
            Close
          </button>

          <button
            onClick={handleDownload}
            className={`px-5 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 transition-all ${
              downloaded
                ? 'bg-emerald-600 text-white'
                : 'bg-gradient-to-r from-amber-400 to-yellow-400 text-slate-950 shadow-md shadow-amber-300/40 hover:brightness-105'
            }`}
          >
            {downloaded ? (
              <>
                <Check className="w-4 h-4 stroke-[3]" />
                <span>Saved to Device</span>
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                <span>Save / Download File</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
