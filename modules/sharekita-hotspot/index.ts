import { Linking, Platform } from 'react-native';
import { requireNativeModule } from 'expo-modules-core';

type HotspotModule = {
  bindCurrentWifi(): Promise<string>;
  localAddresses(): Promise<string[]>;
  connect(ssid: string, password: string, wpa3: boolean, hidden: boolean): Promise<string>;
  disconnect(): Promise<void>;
  openHotspotSettings(): Promise<void>;
  openWifiSettings(): Promise<void>;
  generateSessionKey(): Promise<string>;
  generatePairingToken(): Promise<string>;
  encryptChunk(key: string, transferId: string, index: number, data: string): Promise<string>;
  decryptChunk(key: string, transferId: string, index: number, data: string): Promise<string>;
};

const mod = () => requireNativeModule<HotspotModule>('ShareKitaHotspot');

/** Resolves with the receiver's gateway IP ('' if Android did not report one). */
export function connectToHotspot(ssid = '', password = '', wpa3 = false, hidden = false) {
  return mod().connect(ssid, password, wpa3, hidden);
}

/** Binds to the Wi-Fi network the user joined manually; resolves with its gateway IP. */
export function bindCurrentWifi() {
  return mod().bindCurrentWifi();
}

export function disconnectFromHotspot() {
  return mod().disconnect();
}

/** Android opens the tethering screen; iOS can only open this app's Settings page (turn on Personal Hotspot there). */
export function openHotspotSettings() {
  if (Platform.OS === 'ios') return Linking.openSettings();
  return mod().openHotspotSettings();
}

/** Private IPv4 addresses of this phone (used as dial targets in the pairing QR). */
export function getLocalAddresses() {
  return mod().localAddresses();
}

export function openWifiSettings() {
  if (Platform.OS === 'ios') return Linking.openSettings();
  return mod().openWifiSettings();
}

export function generateSessionKey() {
  return mod().generateSessionKey();
}

export function generatePairingToken() {
  return mod().generatePairingToken();
}

export function encryptChunk(key: string, transferId: string, index: number, data: string) {
  return mod().encryptChunk(key, transferId, index, data);
}

export function decryptChunk(key: string, transferId: string, index: number, data: string) {
  return mod().decryptChunk(key, transferId, index, data);
}

