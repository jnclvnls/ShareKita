/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { 
  TransferableFile, 
  PeerDevice, 
  ActiveTransferSession, 
  TransferHistoryRecord 
} from '../types/transfer';
import { generateChecksum } from './fileData';

// BroadcastChannel for cross-tab / cross-window true local transfer
const CHANNEL_NAME = 'sharekita_local_mesh_channel';

export interface LocalDeviceIdentity {
  id: string;
  name: string;
  deviceType: 'phone' | 'laptop' | 'tablet' | 'desktop';
  os: 'iOS' | 'Android' | 'macOS' | 'Windows' | 'Linux';
  avatar: string;
  labLocation: string;
}

export function getStoredDeviceIdentity(): LocalDeviceIdentity {
  const stored = localStorage.getItem('sharekita_device_identity');
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch {
      // fallback
    }
  }

  const isMobile = typeof window !== 'undefined' && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  const defaultIdentity: LocalDeviceIdentity = {
    id: 'dev-' + Math.random().toString(36).substring(2, 9),
    name: isMobile ? 'My Phone' : 'My Device',
    deviceType: isMobile ? 'phone' : 'laptop',
    os: isMobile ? 'Android' : 'Windows',
    avatar: isMobile ? '📱' : '💻',
    labLocation: 'Local Network',
  };

  localStorage.setItem('sharekita_device_identity', JSON.stringify(defaultIdentity));
  return defaultIdentity;
}

export function saveDeviceIdentity(identity: LocalDeviceIdentity): void {
  localStorage.setItem('sharekita_device_identity', JSON.stringify(identity));
}

export function getTransferHistory(): TransferHistoryRecord[] {
  const stored = localStorage.getItem('sharekita_transfer_history');
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        // Filter out legacy mock data if present
        return parsed.filter(item => !item.id?.startsWith('hist-'));
      }
    } catch {
      // fallback
    }
  }

  return [];
}

export function saveHistoryRecord(record: TransferHistoryRecord): void {
  const history = getTransferHistory();
  const updated = [record, ...history.slice(0, 49)];
  localStorage.setItem('sharekita_transfer_history', JSON.stringify(updated));
}

export function clearHistoryStorage(): void {
  localStorage.removeItem('sharekita_transfer_history');
}

/**
 * Creates a unique transfer session
 */
export function createTransferSession(
  direction: 'send' | 'receive',
  peer: PeerDevice,
  files: TransferableFile[]
): ActiveTransferSession {
  const totalBytes = files.reduce((acc, f) => acc + f.size, 0);
  const CHUNK_SIZE = 512 * 1024; // 512 KB chunks for realistic recovery
  const totalChunks = Math.max(1, Math.ceil(totalBytes / CHUNK_SIZE));
  const roomCode = Math.floor(100000 + Math.random() * 900000).toString();

  return {
    sessionId: `sess-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    roomCode,
    direction,
    peer,
    files,
    totalBytes,
    transferredBytes: 0,
    currentFileIndex: 0,
    currentChunkIndex: 0,
    totalChunks,
    speedBps: 0,
    speedHistory: [0],
    startTime: Date.now(),
    status: 'connecting',
    encryption: 'AES-GCM-256 (Local P2P)',
  };
}
