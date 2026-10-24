/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface LocalDeviceIdentity {
  id: string;
  name: string;
  deviceType: 'phone' | 'laptop' | 'tablet' | 'desktop';
  os: 'iOS' | 'Android' | 'macOS' | 'Windows' | 'Linux';
  avatar: string;
  labLocation: string;
}

const IDENTITY_KEY = 'sharekita_device_identity';

function detectOS(): LocalDeviceIdentity['os'] {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua)) return 'iOS';
  if (/Android/i.test(ua)) return 'Android';
  if (/Mac/i.test(ua)) return 'macOS';
  if (/Win/i.test(ua)) return 'Windows';
  return 'Linux';
}

/**
 * Removes anything older versions of the app may have left in this browser
 * (transfer history, sample data) so every device starts completely clean.
 */
export function purgeLegacyStorage(): void {
  try {
    localStorage.removeItem('sharekita_transfer_history');
  } catch {
    // storage unavailable – nothing to clean
  }
}

export function getStoredDeviceIdentity(): LocalDeviceIdentity {
  const os = detectOS();
  const isMobile = os === 'iOS' || os === 'Android';

  try {
    const stored = localStorage.getItem(IDENTITY_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as LocalDeviceIdentity;
      return { ...parsed, os };
    }
  } catch {
    // fall through to a fresh identity
  }

  const identity: LocalDeviceIdentity = {
    id: 'dev-' + Math.random().toString(36).substring(2, 9),
    name: isMobile ? 'My Phone' : 'My Computer',
    deviceType: isMobile ? 'phone' : 'laptop',
    os,
    avatar: isMobile ? '📱' : '💻',
    labLocation: 'Local Network',
  };
  saveDeviceIdentity(identity);
  return identity;
}

export function saveDeviceIdentity(identity: LocalDeviceIdentity): void {
  try {
    localStorage.setItem(IDENTITY_KEY, JSON.stringify(identity));
  } catch {
    // ignore
  }
}
