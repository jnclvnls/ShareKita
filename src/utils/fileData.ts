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

export const SAMPLE_CAMPUS_PEERS: PeerDevice[] = [
  {
    id: 'peer-laptop-1',
    name: 'MacBook Pro 16"',
    deviceType: 'laptop',
    os: 'macOS',
    avatar: '💻',
    signalStrength: 95,
    labLocation: 'Local Wi-Fi',
    isOnline: true,
    distanceDesc: '1.2 meters away',
  },
  {
    id: 'peer-phone-maria',
    name: 'iPhone 15 Pro',
    deviceType: 'phone',
    os: 'iOS',
    avatar: '📱',
    signalStrength: 88,
    labLocation: 'Nearby Device',
    isOnline: true,
    distanceDesc: '2.5 meters away',
  },
  {
    id: 'peer-pc-12',
    name: 'Workstation PC',
    deviceType: 'desktop',
    os: 'Linux',
    avatar: '🖥️',
    signalStrength: 99,
    labLocation: 'Local Network',
    isOnline: true,
    distanceDesc: '0.8 meters away',
  },
  {
    id: 'peer-galaxy',
    name: 'Galaxy S24 Ultra',
    deviceType: 'phone',
    os: 'Android',
    avatar: '📱',
    signalStrength: 76,
    labLocation: 'Nearby Device',
    isOnline: true,
    distanceDesc: '4.1 meters away',
  },
  {
    id: 'peer-tab',
    name: 'iPad Air',
    deviceType: 'tablet',
    os: 'iOS',
    avatar: '📋',
    signalStrength: 82,
    labLocation: 'Nearby Device',
    isOnline: true,
    distanceDesc: '3.0 meters away',
  },
];

export const INITIAL_CAMPUS_FILES: TransferableFile[] = [
  {
    id: 'doc-1',
    name: 'Project_Specification_Guide.pdf',
    size: 14500000, // 14.5 MB
    type: 'application/pdf',
    category: 'documents',
    extension: 'pdf',
    dateAdded: 'Today, 2:15 PM',
    summary: 'System requirements, network protocol specifications, and security definitions.',
    previewUrl: 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=600&auto=format&fit=crop&q=80',
  },
  {
    id: 'doc-2',
    name: 'Technical_Architecture_Overview.docx',
    size: 4800000, // 4.8 MB
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    category: 'documents',
    extension: 'docx',
    dateAdded: 'Today, 11:30 AM',
    summary: 'Component hierarchy, data flow models, and peer-to-peer connection lifecycle.',
  },
  {
    id: 'photo-1',
    name: 'Team_Planning_Session.jpg',
    size: 6200000, // 6.2 MB
    type: 'image/jpeg',
    category: 'photos',
    extension: 'jpg',
    dateAdded: 'Today, 1:40 PM',
    previewUrl: 'https://images.unsplash.com/photo-1531403009284-440f080d1e12?w=800&auto=format&fit=crop&q=80',
    summary: 'High resolution whiteboard architecture diagram and roadmap milestones.',
  },
  {
    id: 'photo-2',
    name: 'System_Flow_Diagram.png',
    size: 3400000, // 3.4 MB
    type: 'image/png',
    category: 'photos',
    extension: 'png',
    dateAdded: 'Yesterday',
    previewUrl: 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=800&auto=format&fit=crop&q=80',
    summary: 'Network socket topology and WebRTC data channel handshaking flow.',
  },
  {
    id: 'video-1',
    name: 'Quadrotor_Drone_Autonomous_Flight_Test.mp4',
    size: 48500000, // 48.5 MB
    type: 'video/mp4',
    category: 'videos',
    extension: 'mp4',
    dateAdded: 'Yesterday, 4:20 PM',
    summary: '60fps 1080p footage of autonomous indoor hover, optical flow stabilization, and waypoint navigation in the high-bay lab.',
  },
  {
    id: 'audio-1',
    name: 'Group_Discussion_Audio_Record_Oct23.m4a',
    size: 11200000, // 11.2 MB
    type: 'audio/mp4',
    category: 'audio',
    extension: 'm4a',
    dateAdded: '2 days ago',
    summary: '45-minute audio voice memo recording of final year capstone project milestone review and task distribution.',
  },
  {
    id: 'app-1',
    name: 'SensorData_Collector_CampusLab.apk',
    size: 28400000, // 28.4 MB
    type: 'application/vnd.android.package-archive',
    category: 'apps',
    extension: 'apk',
    dateAdded: '3 days ago',
    summary: 'Android mobile sensor diagnostic package for recording accelerometer, gyroscope, and BLE RSSI data.',
  },
  {
    id: 'app-2',
    name: 'Full_Project_Source_Code_Archive.zip',
    size: 38200000, // 38.2 MB
    type: 'application/zip',
    category: 'apps',
    extension: 'zip',
    dateAdded: 'Oct 20',
    summary: 'Complete Git repository zip bundle with React Native frontend, C++ embedded firmware, and Dockerized test harness.',
  },
];

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
