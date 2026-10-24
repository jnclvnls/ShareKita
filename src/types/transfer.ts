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

export type TransferStatus = 
  | 'idle'
  | 'connecting'
  | 'transferring'
  | 'paused'
  | 'interrupted'
  | 'recovering'
  | 'verifying'
  | 'completed'
  | 'failed';

export interface TransferChunk {
  fileId: string;
  chunkIndex: number;
  totalChunks: number;
  size: number;
  checksum: string;
}

export interface PeerDevice {
  id: string;
  name: string;
  deviceType: 'phone' | 'laptop' | 'tablet' | 'desktop';
  os: 'iOS' | 'Android' | 'macOS' | 'Windows' | 'Linux';
  avatar: string;
  ipAddress?: string;
  signalStrength: number; // 1-100
  labLocation?: string;
  isOnline: boolean;
  distanceDesc: string;
}

export interface ActiveTransferSession {
  sessionId: string;
  roomCode: string;
  direction: 'send' | 'receive';
  peer: PeerDevice;
  files: TransferableFile[];
  totalBytes: number;
  transferredBytes: number;
  currentFileIndex: number;
  currentChunkIndex: number;
  totalChunks: number;
  speedBps: number; // bytes per second
  speedHistory: number[];
  startTime: number;
  status: TransferStatus;
  resumedFromChunk?: number;
  interruptedReason?: string;
  encryption: 'AES-GCM-256 (Local P2P)' | 'Direct TLS DataChannel';
}

export interface TransferHistoryRecord {
  id: string;
  sessionId: string;
  direction: 'sent' | 'received';
  peerName: string;
  peerDevice: string;
  timestamp: number;
  files: {
    id: string;
    name: string;
    size: number;
    type: string;
    category: FileCategory;
    previewUrl?: string;
    blobData?: Blob;
  }[];
  totalSize: number;
  durationSeconds: number;
  avgSpeedMBps: number;
  recoveredTimes: number;
}
