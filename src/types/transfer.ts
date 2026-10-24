/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type FileCategory = 'all' | 'documents' | 'photos' | 'videos' | 'audio' | 'apps';

export interface TransferableFile {
  id: string;
  name: string;
  size: number; // in bytes
  type: string;
  category: FileCategory;
  extension: string;
  previewUrl?: string;
  realFile?: File;
  blob?: Blob;
  dateAdded: string;
  summary?: string;
}

export type TransferStatus = 'transferring' | 'paused' | 'completed' | 'failed';

export interface HistoryFile {
  id: string;
  name: string;
  size: number;
  type: string;
  category: FileCategory;
  extension?: string;
  previewUrl?: string;
  blobData?: Blob;
}

export interface TransferHistoryRecord {
  id: string;
  sessionId: string;
  direction: 'sent' | 'received';
  peerName: string;
  peerDevice: string;
  timestamp: number;
  files: HistoryFile[];
  totalSize: number;
  durationSeconds: number;
  avgSpeedMBps: number;
  recoveredTimes: number;
}
