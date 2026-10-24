/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef } from 'react';
import { 
  ArrowLeft, 
  Upload, 
  Check, 
  FileText, 
  Image as ImageIcon, 
  Film, 
  Music, 
  Package, 
  Search, 
  Eye, 
  FolderPlus,
  ArrowRight
} from 'lucide-react';
import { TransferableFile, FileCategory } from '../types/transfer';
import { formatBytes, createFileFromNativeFile } from '../utils/fileData';

interface FilePickerModalProps {
  files: TransferableFile[];
  selectedFileIds: string[];
  onToggleSelect: (id: string) => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onAddUserFiles: (newFiles: TransferableFile[]) => void;
  onBack: () => void;
  onProceedToSend: () => void;
  onPreviewFile: (file: TransferableFile) => void;
  proceedLabel?: string;
}

export const FilePickerModal: React.FC<FilePickerModalProps> = ({
  files,
  selectedFileIds,
  onToggleSelect,
  onSelectAll,
  onClearSelection,
  onAddUserFiles,
  onBack,
  onProceedToSend,
  onPreviewFile,
  proceedLabel = 'Next: Connect',
}) => {
  const [activeCategory, setActiveCategory] = useState<FileCategory>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const categories: { id: FileCategory; label: string; icon: React.ReactNode }[] = [
    { id: 'all', label: 'All Files', icon: <Package className="w-4 h-4" /> },
    { id: 'documents', label: 'Documents', icon: <FileText className="w-4 h-4" /> },
    { id: 'photos', label: 'Photos', icon: <ImageIcon className="w-4 h-4" /> },
    { id: 'videos', label: 'Videos', icon: <Film className="w-4 h-4" /> },
    { id: 'audio', label: 'Audio', icon: <Music className="w-4 h-4" /> },
    { id: 'apps', label: 'Apps / Zip', icon: <Package className="w-4 h-4" /> },
  ];

  const filteredFiles = files.filter((f) => {
    const matchesCat = activeCategory === 'all' || f.category === activeCategory;
    const matchesSearch = f.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCat && matchesSearch;
  });

  const selectedFiles = files.filter((f) => selectedFileIds.includes(f.id));
  const totalSelectedBytes = selectedFiles.reduce((acc, f) => acc + f.size, 0);

  const handleNativeFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const newFiles: TransferableFile[] = [];
    for (let i = 0; i < e.target.files.length; i++) {
      const nativeFile = e.target.files[i];
      const parsed = createFileFromNativeFile(nativeFile);
      newFiles.push(parsed);
      // Automatically select newly uploaded files
      if (!selectedFileIds.includes(parsed.id)) {
        onToggleSelect(parsed.id);
      }
    }
    onAddUserFiles(newFiles);
  };

  const getFileCategoryIcon = (category: FileCategory) => {
    switch (category) {
      case 'documents':
        return <FileText className="w-5 h-5 text-blue-600" />;
      case 'photos':
        return <ImageIcon className="w-5 h-5 text-amber-600" />;
      case 'videos':
        return <Film className="w-5 h-5 text-purple-600" />;
      case 'audio':
        return <Music className="w-5 h-5 text-rose-600" />;
      default:
        return <Package className="w-5 h-5 text-emerald-600" />;
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-slate-50 min-h-screen">
      {/* Top Header */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-20">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              onClick={onBack}
              className="p-2 -ml-1 text-slate-700 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h2 className="text-base font-bold text-slate-900 leading-tight">Select Files</h2>
              <p className="text-[11px] text-slate-500">Choose files from this device</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Native Device File Picker */}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleNativeFileUpload}
              multiple
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-3 py-1.5 bg-amber-400 hover:bg-amber-500 text-slate-950 rounded-xl font-bold text-xs flex items-center gap-1.5 shadow-xs transition-colors"
            >
              <FolderPlus className="w-4 h-4" />
              <span>Browse Device</span>
            </button>
          </div>
        </div>

        {/* Category Tabs */}
        <div className="max-w-2xl mx-auto px-3 flex items-center gap-1 overflow-x-auto pb-2 pt-1 no-scrollbar">
          {categories.map((cat) => {
            const count = cat.id === 'all' ? files.length : files.filter((f) => f.category === cat.id).length;
            const isActive = activeCategory === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors shrink-0 ${
                  isActive
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'bg-white text-slate-600 hover:text-slate-900 border border-slate-200'
                }`}
              >
                {cat.icon}
                <span>{cat.label}</span>
                <span className={`text-[10px] px-1 rounded-sm ${isActive ? 'bg-slate-700 text-white' : 'text-slate-400'}`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Search Input */}
        <div className="max-w-2xl mx-auto px-4 pb-2.5 pt-1">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search files by name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-100 hover:bg-slate-100/80 focus:bg-white text-xs pl-9 pr-4 py-2 rounded-xl border border-transparent focus:border-amber-400 focus:outline-none transition-all text-slate-900"
            />
          </div>
        </div>
      </div>

      {/* File List */}
      <div className="flex-1 max-w-2xl mx-auto w-full p-4 space-y-2.5 pb-28">
        <div className="flex items-center justify-between text-xs px-1 text-slate-500">
          <span>{filteredFiles.length} {filteredFiles.length === 1 ? 'file' : 'files'}</span>
          <div className="flex items-center gap-3">
            <button
              onClick={onSelectAll}
              className="text-amber-700 hover:text-amber-800 font-bold"
            >
              Select All
            </button>
            {selectedFileIds.length > 0 && (
              <button
                onClick={onClearSelection}
                className="text-slate-500 hover:text-slate-700 font-medium"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {filteredFiles.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 text-center border border-slate-200">
            <Package className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            <p className="text-sm font-semibold text-slate-700">
              {files.length === 0 ? 'No files chosen yet' : 'No files found'}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              {files.length === 0
                ? 'Tap the button below to choose files from your phone or computer.'
                : 'Try another category or search.'}
            </p>
            {files.length === 0 && (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="mt-4 px-4 py-2 bg-amber-400 hover:bg-amber-500 text-slate-950 rounded-xl font-bold text-xs inline-flex items-center gap-1.5"
              >
                <FolderPlus className="w-4 h-4" />
                Browse Device
              </button>
            )}
          </div>
        ) : (
          filteredFiles.map((file) => {
            const isSelected = selectedFileIds.includes(file.id);
            return (
              <div
                key={file.id}
                onClick={() => onToggleSelect(file.id)}
                className={`bg-white rounded-2xl p-3 border transition-all cursor-pointer flex items-center justify-between gap-3 shadow-2xs ${
                  isSelected
                    ? 'border-amber-400 ring-2 ring-amber-400/20 bg-amber-50/20'
                    : 'border-slate-200/90 hover:border-amber-200'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  {/* Category / Preview Icon */}
                  <div className="w-11 h-11 rounded-xl bg-slate-100 flex items-center justify-center shrink-0 overflow-hidden relative border border-slate-200">
                    {file.previewUrl && file.category === 'photos' ? (
                      <img
                        src={file.previewUrl}
                        alt={file.name}
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      getFileCategoryIcon(file.category)
                    )}
                  </div>

                  {/* File Metadata */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <h4 className="text-xs font-bold text-slate-900 truncate">
                        {file.name}
                      </h4>
                      <span className="text-[10px] font-bold uppercase text-slate-600 bg-slate-100 px-1.5 py-0.2 rounded shrink-0">
                        {file.extension}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-0.5">
                      <span className="tabular-nums font-medium text-slate-700">
                        {formatBytes(file.size)}
                      </span>
                      <span>·</span>
                      <span className="truncate">{file.dateAdded}</span>
                    </div>

                    {file.summary && (
                      <p className="text-[11px] text-slate-400 truncate mt-0.5 max-w-sm">
                        {file.summary}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {/* Quick Preview Button */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onPreviewFile(file);
                    }}
                    className="p-2 text-slate-400 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
                    title="Preview file"
                  >
                    <Eye className="w-4 h-4" />
                  </button>

                  {/* Selection Checkbox */}
                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center transition-colors ${
                      isSelected
                        ? 'bg-amber-400 text-slate-950 font-bold shadow-xs'
                        : 'border-2 border-slate-300 bg-white'
                    }`}
                  >
                    {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Sticky Bottom Multi-Select Bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t border-slate-200/90 p-3 z-30 shadow-lg">
        <div className="max-w-2xl mx-auto flex items-center justify-between gap-4">
          <div>
            <div className="text-xs font-bold text-slate-900">
              {selectedFiles.length} {selectedFiles.length === 1 ? 'file' : 'files'} selected
            </div>
            <div className="text-[11px] text-slate-500 tabular-nums">
              Total size: {formatBytes(totalSelectedBytes)}
            </div>
          </div>

          <button
            onClick={onProceedToSend}
            disabled={selectedFiles.length === 0}
            className={`px-5 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 transition-all ${
              selectedFiles.length > 0
                ? 'bg-gradient-to-r from-amber-400 to-yellow-400 text-slate-950 shadow-md shadow-amber-300/50 hover:brightness-105 active:scale-95 cursor-pointer'
                : 'bg-slate-200 text-slate-400 cursor-not-allowed'
            }`}
          >
            <span>{proceedLabel}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
