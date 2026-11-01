const unsupported = async (): Promise<never> => {
  throw new Error('Nearby hotspot pairing is available in the Android app, not in a web browser.');
};

export const connectToHotspot = (_ssid: string, _password: string, _wpa3 = false) => unsupported();
export const getLocalAddresses = async (): Promise<string[]> => [];
export const bindCurrentWifi = () => unsupported();
export const disconnectFromHotspot = async () => undefined;
export const openHotspotSettings = unsupported;
export const openWifiSettings = unsupported;
export const generateSessionKey = unsupported;
export const generatePairingToken = unsupported;
export const encryptChunk = (_key: string, _transferId: string, _index: number, _data: string) => unsupported();
export const decryptChunk = (_key: string, _transferId: string, _index: number, _data: string) => unsupported();
