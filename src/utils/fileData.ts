/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { TransferableFile, PeerDevice, FileCategory } from '../types/transfer';

export function formatBytes(bytes: number, decimals = 1): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}m ${secs}s`;
}

export function generateChecksum(input: string | number): string {
  let hash = 0;
  const str = String(input);
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}

export const SAMPLE_CAMPUS_PEERS: PeerDevice[] = [];

export const INITIAL_CAMPUS_FILES: TransferableFile[] = [];

export function categorizeFile(file: File): FileCategory {
  const mime = file.type.toLowerCase();
  const name = file.name.toLowerCase();

  if (mime.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp|svg|bmp)$/i.test(name)) {
    return 'photos';
  }
  if (mime.startsWith('video/') || /\.(mp4|mov|avi|mkv|webm)$/i.test(name)) {
    return 'videos';
  }
  if (mime.startsWith('audio/') || /\.(mp3|wav|ogg|m4a|aac|flac)$/i.test(name)) {
    return 'audio';
  }
  if (
    mime.includes('pdf') ||
    mime.includes('word') ||
    mime.includes('text') ||
    mime.includes('presentation') ||
    mime.includes('spreadsheet') ||
    /\.(pdf|docx?|pptx?|xlsx?|txt|csv|md|json)$/i.test(name)
  ) {
    return 'documents';
  }
  return 'apps';
}

export function createFileFromNativeFile(file: File): TransferableFile {
  const ext = file.name.split('.').pop() || 'dat';
  const category = categorizeFile(file);
  let previewUrl: string | undefined = undefined;

  if (category === 'photos' || category === 'audio' || category === 'videos') {
    previewUrl = URL.createObjectURL(file);
  }

  return {
    id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: file.name,
    size: file.size,
    type: file.type || 'application/octet-stream',
    category,
    extension: ext.toLowerCase(),
    previewUrl,
    realFile: file,
    blob: file,
    dateAdded: 'Just now',
    summary: `Local file uploaded from device (${formatBytes(file.size)})`,
  };
}