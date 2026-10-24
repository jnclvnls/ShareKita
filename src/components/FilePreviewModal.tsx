/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { X, Download, FileText, Image as ImageIcon, Film, Music, Package, Check } from 'lucide-react';
import { formatBytes } from '../utils/fileData';

// Accepts both live files (blob) and history entries (blobData)
interface PreviewableFile {
  name: string;
  size: number;
  type: string;
  category: string;
  extension?: string;
  previewUrl?: string;
  blob?: Blob;
  blobData?: Blob;
  realFile?: File;
}

interface FilePreviewModalProps {
  file: PreviewableFile | null;
  onClose: () => void;
}

export const FilePreviewModal: React.FC<FilePreviewModalProps> = ({ file, onClose }) => {
  const [saved, setSaved] = useState(false);

  if (!file) return null;

  const data: Blob | undefined = file.blob || file.blobData || file.realFile;
  const ext = (file.extension || file.name.split('.').pop() || 'file').toUpperCase();
  const mediaUrl = file.previewUrl || (data ? URL.createObjectURL(data) : undefined);

  const handleSave = () => {
    if (!data) return;
    const url = URL.createObjectURL(data);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const Icon =
    file.category === 'photos' ? ImageIcon : file.category === 'audio' ? Music : file.category === 'videos' ? Film : FileText;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-lg w-full overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
              <Icon className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="text-xs font-bold text-slate-900 truncate">{file.name}</h3>
              <p className="text-[11px] text-slate-500 tabular-nums">
                {formatBytes(file.size)} · {ext}
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

        <div className="flex-1 overflow-y-auto p-5 bg-slate-50">
          {file.category === 'photos' && mediaUrl ? (
            <div className="rounded-2xl overflow-hidden bg-black/5 border border-slate-200">
              <img src={mediaUrl} alt={file.name} className="w-full max-h-80 object-contain mx-auto" />
            </div>
          ) : file.category === 'audio' && mediaUrl ? (
            <div className="bg-white rounded-2xl p-5 border border-slate-200 text-center">
              <Music className="w-10 h-10 text-amber-500 mx-auto mb-3" />
              <audio controls src={mediaUrl} className="w-full" />
            </div>
          ) : file.category === 'videos' && mediaUrl ? (
            <div className="rounded-2xl overflow-hidden bg-black">
              <video controls src={mediaUrl} className="w-full max-h-80" />
            </div>
          ) : (
            <div className="bg-white rounded-2xl p-6 border border-slate-200 text-center">
              <Package className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              <p className="text-sm font-semibold text-slate-700">No preview for this file type</p>
              <p className="text-xs text-slate-500 mt-1">Save it to your device to open it.</p>
            </div>
          )}

          <div className="mt-4 bg-white rounded-2xl p-4 border border-slate-200 text-xs space-y-2">
            <div className="flex justify-between text-slate-600">
              <span>File type</span>
              <span className="font-semibold text-slate-900">{file.type || 'Unknown'}</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>Size</span>
              <span className="font-semibold text-slate-900 tabular-nums">{formatBytes(file.size)}</span>
            </div>
          </div>
        </div>

        <div className="p-4 bg-white border-t border-slate-100 flex items-center justify-between gap-3">
          <button onClick={onClose} className="px-4 py-2 text-slate-600 hover:text-slate-900 font-bold text-xs">
            Close
          </button>
          <button
            onClick={handleSave}
            disabled={!data}
            className={`px-5 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 transition-all disabled:opacity-40 ${
              saved
                ? 'bg-emerald-600 text-white'
                : 'bg-gradient-to-r from-amber-400 to-yellow-400 text-slate-950 shadow-md shadow-amber-300/40 hover:brightness-105'
            }`}
          >
            {saved ? (
              <>
                <Check className="w-4 h-4 stroke-[3]" />
                <span>Saved</span>
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                <span>Save File</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
