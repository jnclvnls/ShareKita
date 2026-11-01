import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, Alert, Platform, StatusBar, PermissionsAndroid, Image, SafeAreaView, useWindowDimensions, Modal,
} from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import { CameraView, useCameraPermissions } from 'expo-camera';
import QRCode from 'react-native-qrcode-svg';
import TcpSocket from 'react-native-tcp-socket';
import { bindCurrentWifi, connectToHotspot, decryptChunk, disconnectFromHotspot, encryptChunk, generatePairingToken, generateSessionKey, getLocalAddresses, openHotspotSettings, openWifiSettings } from '../../modules/sharekita-hotspot/index';

void SplashScreen.preventAutoHideAsync().catch(() => undefined);

const TRANSFER_PORT = 43821;
// Typical hotspot gateway addresses, tried when Android does not report one.
const IS_NATIVE = Platform.OS === 'android' || Platform.OS === 'ios';
const FALLBACK_HOTSPOT_HOSTS = ['192.168.43.1', '192.168.49.1', '192.168.137.1', '172.20.10.1', '192.168.1.1', '192.168.0.1', '10.0.0.1'];
const CHUNK = 96 * 1024;
const WINDOW = 4;

type Item = {
  id: string; name: string; size: number; done: number;
  dir: 'send' | 'receive'; status: 'waiting' | 'active' | 'paused' | 'done' | 'failed' | 'declined';
  speed: number; uri?: string; mimeType?: string | null;
};
type Peer = { id: string; name: string };
type HistoryEntry = { id: string; name: string; size: number; dir: 'send' | 'receive'; status: 'done' | 'failed' | 'declined'; at: number; peer: string; uri?: string; mimeType?: string | null };
const HISTORY_LIMIT = 100;
// Chunk indexes <-> compact [start,end] ranges, used when resuming an interrupted file.
function toRanges(indexes: Iterable<number>): [number, number][] {
  const sorted = Array.from(indexes).sort((a, b) => a - b);
  const out: [number, number][] = [];
  for (const i of sorted) {
    const last = out[out.length - 1];
    if (last && i === last[1] + 1) last[1] = i; else out.push([i, i]);
  }
  return out;
}
type PendingFile = { id: string; uri: string; name: string; size?: number | null; mimeType?: string | null };
type PreviewFile = { uri: string; name: string; mimeType?: string | null; kind: 'image' | 'text'; text?: string };

// ---------- base64 helpers ----------
function toB64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 8192) {
    bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + 8192)) as any);
  }
  return btoa(bin);
}
function fromB64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function parseReceiverQr(data: string): { ssid?: string; password?: string; host: string; port: number; token: string; wpa3: boolean; hidden: boolean; key: string; expiresAt: number } | null {
  const text = data.trim().replace(/^\uFEFF/, '');
  let payload: any;
  try {
    payload = JSON.parse(text);
  } catch {
    const s = text.indexOf('{');
    const e = text.lastIndexOf('}');
    if (s < 0 || e <= s) return null;
    try { payload = JSON.parse(text.slice(s, e + 1)); }
    catch { return null; }
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  if (payload.v !== 2) return null;
  // compact keys (s,p,h,o,t,w) with fallback to the old long keys
  const ssid = payload.s ?? payload.ssid;
  const password = payload.p ?? payload.password;
  const rawHost = payload.h ?? payload.host ?? '';
  const host = Array.isArray(rawHost) ? rawHost.map(String).join(',') : rawHost;
  const token = payload.t ?? payload.token;
  const port = Number(payload.o ?? payload.port);
  const key = payload.k;
  const expiresAt = Number(payload.x);
  if (Boolean(ssid) !== Boolean(password) || !token || !key || !Number.isFinite(expiresAt)) return null;
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
  return { ...(ssid ? { ssid: String(ssid), password: String(password) } : {}), host: String(host), port, token: String(token), wpa3: payload.w === 3, hidden: payload.hidden === true, key: String(key), expiresAt };
}

const fmt = (n: number) =>
  n > 1e9 ? (n / 1e9).toFixed(2) + ' GB' : n > 1e6 ? (n / 1e6).toFixed(1) + ' MB' : n > 1e3 ? (n / 1e3).toFixed(0) + ' KB' : n + ' B';
const uid = () => Math.random().toString(36).slice(2, 10);

export default function NativeApp() {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const qrSize = Math.max(200, Math.min(270, windowWidth - 96));
  const scanBoxSize = Math.max(220, Math.min(300, windowWidth - 56, windowHeight * 0.38));
  const [booting, setBooting] = useState(true);
  const [bootProgress, setBootProgress] = useState(0);
  const [deviceName, setDeviceName] = useState(`${Platform.OS === 'web' ? 'Web' : Platform.OS === 'ios' ? 'iPhone' : 'Android'}-${uid().slice(0, 3)}`);
  const [deviceNameLoaded, setDeviceNameLoaded] = useState(false);
  const nameSaveQueue = useRef<Promise<void>>(Promise.resolve());
  const [conn, setConn] = useState<'offline' | 'connecting' | 'online'>('offline');
  const [myCode, setMyCode] = useState<string | null>(null);
  const [qrPayload, setQrPayload] = useState('');
  const [peer, setPeer] = useState<Peer | null>(null);
  const [screen, setScreen] = useState<'home' | 'send-pair' | 'receive-pair'>('home');
  const [items, setItems] = useState<Item[]>([]);
  const [pendingItems, setPendingItems] = useState<PendingFile[]>([]);
  const [filePreview, setFilePreview] = useState<PreviewFile | null>(null);
  const [pickerCategoriesVisible, setPickerCategoriesVisible] = useState(false);
  const [incomingRequest, setIncomingRequest] = useState<{ files: any[]; targetId?: string } | null>(null);
  const [scanning, setScanning] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [locationPermissionGranted, setLocationPermissionGranted] = useState(false);
  const [showAllItems, setShowAllItems] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const historyQueue = useRef<Promise<void>>(Promise.resolve());
  const recordedIds = useRef(new Set<string>());
  const lostAlert = useRef(false);
  const completedIncoming = useRef(new Map<string, number>());
  const [scanHint, setScanHint] = useState<string | null>(null);
  const [perm, requestPerm] = useCameraPermissions();

  const persistDeviceName = (value: string) => {
    const nameToSave = value.trim();
    if (!nameToSave) return;
    nameSaveQueue.current = nameSaveQueue.current.then(async () => {
      if (Platform.OS === 'web') {
        globalThis.localStorage?.setItem('sharekita-device-name', nameToSave);
        return;
      }
      const { File, Paths } = await import('expo-file-system');
      const file = new File(Paths.document, 'sharekita-device-name.txt');
      file.create({ intermediates: true, overwrite: true });
      await file.write(nameToSave);
    }).catch(() => undefined);
  };

  useEffect(() => {
    let mounted = true;
    const loadName = async () => {
      try {
        if (Platform.OS === 'web') {
          const savedName = globalThis.localStorage?.getItem('sharekita-device-name')?.trim();
          if (mounted && savedName) setDeviceName(savedName);
          return;
        }
        const { File, Paths } = await import('expo-file-system');
        const file = new File(Paths.document, 'sharekita-device-name.txt');
        if (file.exists) {
          const savedName = (await file.text()).trim();
          if (mounted && savedName) setDeviceName(savedName);
        }
      } catch {
        // Keep the generated default if local settings cannot be read.
      } finally {
        if (mounted) setDeviceNameLoaded(true);
      }
    };
    void loadName();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (!deviceNameLoaded || !deviceName.trim()) return;
    const timer = setTimeout(() => {
      persistDeviceName(deviceName);
    }, 250);
    return () => clearTimeout(timer);
  }, [deviceName, deviceNameLoaded]);

  useEffect(() => {
    let mounted = true;
    const loadHistory = async () => {
      try {
        let raw: string | null = null;
        if (Platform.OS === 'web') raw = globalThis.localStorage?.getItem('sharekita-history') ?? null;
        else {
          const { File, Paths } = await import('expo-file-system');
          const file = new File(Paths.document, 'sharekita-history.json');
          if (file.exists) raw = await file.text();
        }
        const parsed = raw ? JSON.parse(raw) : [];
        if (mounted && Array.isArray(parsed)) {
          const entries = parsed.filter((e: any) => e && typeof e.id === 'string' && typeof e.name === 'string').slice(0, HISTORY_LIMIT) as HistoryEntry[];
          entries.forEach((e) => recordedIds.current.add(e.id));
          setHistory(entries);
        }
      } catch {
        // Corrupt or unreadable history just starts empty.
      } finally {
        if (mounted) setHistoryLoaded(true);
      }
    };
    void loadHistory();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (!historyLoaded) return;
    const snapshot = JSON.stringify(history);
    historyQueue.current = historyQueue.current.then(async () => {
      if (Platform.OS === 'web') { globalThis.localStorage?.setItem('sharekita-history', snapshot); return; }
      const { File, Paths } = await import('expo-file-system');
      const file = new File(Paths.document, 'sharekita-history.json');
      file.create({ intermediates: true, overwrite: true });
      file.write(snapshot);
    }).catch(() => undefined);
  }, [history, historyLoaded]);

  // Move every finished transfer (done / failed / declined) into the persistent history exactly once.
  useEffect(() => {
    if (!historyLoaded) return;
    const finished = items.filter((i) => (i.status === 'done' || i.status === 'failed' || i.status === 'declined') && !recordedIds.current.has(i.id));
    if (!finished.length) return;
    finished.forEach((i) => recordedIds.current.add(i.id));
    const at = Date.now();
    const peerName = pairedPeerName.current;
    const entries: HistoryEntry[] = finished.map((i) => ({ id: i.id, name: i.name, size: i.size, dir: i.dir, status: i.status as HistoryEntry['status'], at, peer: peerName, uri: i.uri, mimeType: i.mimeType }));
    setHistory((prev) => [...entries, ...prev].slice(0, HISTORY_LIMIT));
  }, [items, historyLoaded]);

  useEffect(() => {
    const startedAt = Date.now();
    let finishTimer: ReturnType<typeof setTimeout> | undefined;
    const progressTimer = setInterval(() => {
      const progress = Math.min(100, Math.floor(((Date.now() - startedAt) / 1600) * 100));
      setBootProgress(progress);
      if (progress >= 100) {
        clearInterval(progressTimer);
        finishTimer = setTimeout(() => setBooting(false), 350);
      }
    }, 32);
    return () => {
      clearInterval(progressTimer);
      if (finishTimer) clearTimeout(finishTimer);
    };
  }, []);

  useEffect(() => () => {
    directSocket.current?.destroy();
    transferServer.current?.close();
  }, []);

  const myId = useRef(uid());
  const directSocket = useRef<any>(null);
  const transferServer = useRef<any>(null);
  const sessionToken = useRef<string | null>(null);
  const sessionKey = useRef<string | null>(null);
  const sessionExpiresAt = useRef(0);
  const pairingUsed = useRef(false);
  const pairedPeerId = useRef<string | null>(null);
  const pairedPeerName = useRef('A nearby device');
  const pairMode = useRef<'send' | 'receive' | null>(null);
  const pendingFiles = useRef<PendingFile[]>([]);
  const outgoing = useRef(new Map<string, any>());
  const incoming = useRef(new Map<string, any>());
  const scanLock = useRef(false);
  const screenRef = useRef<'home' | 'send-pair' | 'receive-pair'>('home');
  useEffect(() => { screenRef.current = screen; }, [screen]);

  const send = (msg: object): boolean => {
    const socket = directSocket.current;
    if (!socket || socket.destroyed) return false;
    try {
      socket.write(`${JSON.stringify(msg)}\n`);
      return true;
    } catch {
      return false;
    }
  };
  const sendToPeer = (msg: object, targetId = pairedPeerId.current): boolean => {
    if (!targetId) return false;
    return send(msg);
  };
  // The link dropped: keep partially-transferred files so they can resume after re-pairing.
  const pauseActiveTransfers = (): number => {
    let count = 0;
    outgoing.current.forEach((o, id) => {
      o.epoch++; o.pumping = false; o.inflight = 0;
      if (o.accepted) { o.paused = true; count++; patch(id, { status: 'paused', speed: 0 }); }
    });
    incoming.current.forEach((r, id) => { r.paused = true; count++; patch(id, { status: 'paused', speed: 0 }); });
    // Offers the receiver never answered cannot resume; the sender simply re-offers them.
    setItems((prev) => prev.map((i) => (i.dir === 'receive' && i.status === 'waiting' ? { ...i, status: 'failed' } : i)));
    setIncomingRequest(null);
    return count;
  };
  // Cancel every in-flight transfer (user disconnected / partner left).
  const failActiveTransfers = () => {
    outgoing.current.forEach((o, id) => { try { o.handle?.close(); } catch {} patch(id, { status: 'failed' }); });
    outgoing.current.clear();
    incoming.current.forEach((r, id) => { try { r.handle?.close(); } catch {} try { r.file?.delete(); } catch {} patch(id, { status: 'failed' }); });
    incoming.current.clear();
    completedIncoming.current.clear();
  };
  const patch = (id: string, p: Partial<Item>) =>
    setItems(prev => prev.map(i => (i.id === id ? { ...i, ...p } : i)));

  // ---------- direct local-network pairing ----------
  const bindSocket = (socket: any, hostSide: boolean) => {
    directSocket.current = socket;
    socket.setEncoding?.('utf8');
    let buffer = '';
    socket.on('data', (chunk: string | { toString(encoding?: string): string }) => {
      buffer += typeof chunk === 'string' ? chunk : chunk.toString('utf8');
      let newline = buffer.indexOf('\n');
      while (newline >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (line) {
          try {
            const message = JSON.parse(line);
            if (hostSide && message.type === 'register') {
              if (Date.now() > sessionExpiresAt.current) {
                socket.write(`${JSON.stringify({ type: 'pairing-error', message: 'This pairing code expired. Ask the receiver to refresh it.' })}\n`);
                socket.destroy();
                return;
              }
              if (pairingUsed.current || pairedPeerId.current) {
                socket.write(`${JSON.stringify({ type: 'pairing-error', message: 'This pairing code has already been used.' })}\n`);
                socket.destroy();
                return;
              }
              if (message.token !== sessionToken.current && message.token !== sessionToken.current?.slice(0, 8)) {
                socket.write(`${JSON.stringify({ type: 'pairing-error', message: 'The pairing code is incorrect.' })}\n`);
                socket.destroy();
                return;
              }
              if (typeof message.device?.id !== 'string' || typeof message.device?.name !== 'string') {
                socket.write(`${JSON.stringify({ type: 'pairing-error', message: 'The sender identity is invalid.' })}\n`);
                socket.destroy();
                return;
              }
              if (!sessionKey.current) { socket.destroy(); return; }
              pairingUsed.current = true;
              pairedPeerId.current = message.device.id;
              pairedPeerName.current = message.device.name;
              setPeer({ id: message.device.id, name: message.device.name });
              setConn('online');
              socket.write(`${JSON.stringify({ type: 'paired', peer: { id: myId.current, name: deviceName } })}\n`);
            } else handleMessage(message);
          } catch {
            socket.destroy();
            Alert.alert('Connection error', 'The nearby device sent invalid pairing data.');
            return;
          }
        }
        newline = buffer.indexOf('\n');
      }
    });
    try { socket.setNoDelay?.(true); socket.setKeepAlive?.(true); } catch {}
    socket.on('error', (error: Error) => {
      if (directSocket.current === socket) {
        setConn('offline');
        const paused = pauseActiveTransfers();
        if (!lostAlert.current && (paused > 0 || screenRef.current !== 'home')) {
          lostAlert.current = true;
          Alert.alert('Nearby connection lost', `${error.message || 'The other device disconnected.'}${paused > 0 ? '\n\nYour unfinished files are paused. Scan a fresh QR code to resume them.' : ''}`);
        }
      }
    });
    socket.on('close', () => {
      if (directSocket.current === socket) {
        const paused = pauseActiveTransfers();
        if (paused > 0 && !lostAlert.current) {
          lostAlert.current = true;
          Alert.alert('Nearby connection lost', 'Your unfinished files are paused. Scan a fresh QR code to resume them.');
        }
        directSocket.current = null;
        pairedPeerId.current = null;
        setPeer(null);
        setConn('offline');
        // Receiver: publish a fresh code so the sender can reconnect and resume.
        if (hostSide && transferServer.current) void createReceiverQr();
      }
    });
  };

  const startReceiver = async () => {
    if (!IS_NATIVE) {
      Alert.alert('Mobile app required', 'The web version has the same ShareKita design. Direct hotspot pairing is available in the Android and iPhone apps.');
      return;
    }
    try {
      setConn('connecting');
      if (Platform.OS === 'android' && Platform.Version >= 37) {
        try { await PermissionsAndroid.request('android.permission.ACCESS_LOCAL_NETWORK' as any); } catch {}
      }
      transferServer.current?.close();
      const server = TcpSocket.createServer((socket: any) => bindSocket(socket, true));
      transferServer.current = server;
      await new Promise<void>((resolve, reject) => {
        server.once('listening', resolve);
        server.once('error', reject);
        server.listen({ port: TRANSFER_PORT, host: '0.0.0.0', reuseAddress: true });
      });
      setConn('offline');
      setMyCode(null);
      setQrPayload('');
      await openHotspotSettings();
    } catch (error: any) {
      transferServer.current?.close();
      transferServer.current = null;
      setConn('offline');
      setMyCode(null);
      setQrPayload('');
      Alert.alert('Could not open hotspot settings', error?.message || 'Open Settings and turn on your mobile hotspot (Personal Hotspot on iPhone).');
    }
  };

  const createReceiverQr = async () => {
    try {
      if (!transferServer.current) await startReceiver();
      const token = await generatePairingToken();
      const encryptionKey = await generateSessionKey();
      const expiresAt = Date.now() + 3 * 60 * 1000;
      sessionToken.current = token;
      sessionKey.current = encryptionKey;
      sessionExpiresAt.current = expiresAt;
      pairingUsed.current = false;
      // The receiver is the hotspot owner: its own addresses are the sender's best targets.
      let addresses: string[] = [];
      try { addresses = (await getLocalAddresses()).slice(0, 4); } catch {}
      setMyCode(token);
      setQrPayload(JSON.stringify({ v: 2, o: TRANSFER_PORT, t: token, k: encryptionKey, x: expiresAt, ...(addresses.length ? { h: addresses } : {}) }));
      setConn('offline');
    } catch (error: any) {
      Alert.alert('Could not prepare pairing code', error?.message || 'Check that your phone hotspot is on, then try again.');
    }
  };

  const openSocket = (host: string, port: number, token: string) =>
    new Promise<void>((resolve, reject) => {
      let settled = false;
      const fail = (err: Error) => { if (!settled) { settled = true; try { socket.destroy(); } catch {} reject(err); } };
      const timer = setTimeout(() => fail(new Error(`Timed out connecting to ${host}`)), 4000);
      const socket: any = TcpSocket.createConnection({ host, port, connectTimeout: 3000 } as any, () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        bindSocket(socket, false);
        socket.write(`${JSON.stringify({ type: 'register', token, device: { id: myId.current, name: deviceName } })}\n`);
        resolve();
      });
      socket.on('error', (err: Error) => { clearTimeout(timer); fail(err); });
      socket.on('close', () => { clearTimeout(timer); fail(new Error(`Connection to ${host} closed`)); });
    });

  const connectToReceiver = async (pairing: NonNullable<ReturnType<typeof parseReceiverQr>>) => {
    if (!IS_NATIVE) throw new Error('Direct hotspot pairing is available in the Android and iPhone apps.');
    setScanning(false);
    setConn('connecting');
    // Android shows a system prompt before joining the receiver's hotspot.
    let gateway = '';
    let manual = false;
    let joinError: any = null;
    try {
      // iOS cannot join a hotspot without a Wi-Fi entitlement, so the user joins it in Settings first.
      if (Platform.OS === 'ios') { manual = true; }
      else gateway = await connectToHotspot(pairing.ssid ?? '', pairing.password ?? '', pairing.wpa3, pairing.hidden);
    } catch (error) {
      // Some phones (Xiaomi/Samsung skins) reject or hide the in-app Wi-Fi picker. If the user already joined
      // the receiver's hotspot in Android Wi-Fi settings, use that connection instead.
      joinError = error;
      try { gateway = await bindCurrentWifi(); manual = true; }
      catch { throw joinError; }
    }
    // Gateway first (reported by Android), then the QR host, then (in-app join only) common hotspot addresses.
    const qrHosts = pairing.host.split(',').map((h) => h.trim()).filter(Boolean);
    const hosts = Array.from(new Set([gateway, ...qrHosts, ...(!gateway ? FALLBACK_HOTSPOT_HOSTS : manual ? [] : FALLBACK_HOTSPOT_HOSTS)].filter(Boolean) as string[]));
    let lastError: any = null;
    for (let attempt = 0; attempt < (manual ? 2 : 3); attempt++) {
      for (const host of hosts) {
        try { await openSocket(host, pairing.port, pairing.token); return; }
        catch (err) { lastError = err; }
      }
      await new Promise((r) => setTimeout(r, 1500));
    }
    await disconnectFromHotspot().catch(() => undefined);
    if (manual) throw new Error(`${joinError?.message ? `${joinError.message}\n\n` : ''}Your phone is not on the receiver's hotspot yet (${lastError?.message || 'timeout'}). Join it in Wi-Fi settings, then scan again.`);
    throw new Error(`Joined the hotspot but could not reach the receiver (${lastError?.message || 'timeout'}).`);
  };

  const refreshReceiverQr = async () => {
    if (peer) return;
    await createReceiverQr();
  };

  const onScan = async ({ data }: { data: string }) => {
    if (scanLock.current) return;
    scanLock.current = true;
    const pairing = parseReceiverQr(data);
    if (!pairing) {
      setScanHint('Scan the QR displayed on the receiver’s ShareKita Receive screen.');
      setTimeout(() => (scanLock.current = false), 1200);
      return;
    }
    if (pairing.expiresAt <= Date.now()) {
      setScanHint('That pairing code has expired. Ask the receiver to refresh it.');
      setTimeout(() => (scanLock.current = false), 1200);
      return;
    }
    sessionKey.current = pairing.key;
    setScanHint(null);
    try { await connectToReceiver(pairing); }
    catch (error: any) {
      setScanning(false);
      setConn('offline');
      Alert.alert('Could not connect', `${error?.message || 'Check that the receiver hotspot is active.'}\n\nJoin the receiver's hotspot in your phone's Wi-Fi settings, then return and scan the QR again.`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Wi-Fi settings', onPress: () => { void openWifiSettings().catch(() => undefined); } },
      ]);
    }
    setTimeout(() => (scanLock.current = false), 1500);
  };
  const disconnectPeer = () => {
    send({ type: 'unpair' });
    failActiveTransfers();
    directSocket.current?.destroy();
    directSocket.current = null;
    pairedPeerId.current = null;
    pairedPeerName.current = 'A nearby device';
    pairMode.current = null;
    setPeer(null); setMyCode(null); setQrPayload(''); setScreen('home');
    transferServer.current?.close();
    transferServer.current = null;
    if (Platform.OS === 'android') disconnectFromHotspot().catch(() => undefined);
    completedIncoming.current.clear();
  };
  const openReceivePairing = async () => {
    pairMode.current = 'receive';
    setScreen('receive-pair');
    if (!peer && !myCode) await startReceiver();
  };
  const openSendPairing = () => {
    pairMode.current = 'send';
    setScreen('send-pair');
  };
  const startScanning = async () => {
    openSendPairing();
    const granted = perm?.granted || (await requestPerm()).granted;
    if (!granted) {
      Alert.alert('Camera permission required', 'Allow camera access to scan a ShareKita pairing code.');
      return;
    }
    if (Platform.OS === 'android') {
      const location = await requestLocationPermission();
      if (!location) {
        Alert.alert('Location permission required', 'Allow location access to qualify this device for nearby Wi-Fi pairing.');
        return;
      }
    }
    scanLock.current = false;
    setScanHint(null);
    setScanning(true);
  };

  const requestLocationPermission = async () => {
    if (Platform.OS !== 'android') return true;
    try {
      const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION, {
        title: 'Nearby Wi-Fi permission',
        message: 'ShareKita needs location permission to qualify this device for nearby hotspot pairing.',
        buttonPositive: 'Allow',
        buttonNegative: 'Cancel',
      });
      if (result !== PermissionsAndroid.RESULTS.GRANTED) {
        setLocationPermissionGranted(false);
        return false;
      }
      if (Platform.Version >= 33) {
        const nearby = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.NEARBY_WIFI_DEVICES, {
          title: 'Nearby Wi-Fi devices',
          message: 'ShareKita needs nearby Wi-Fi access to pair over a hotspot.',
          buttonPositive: 'Allow',
          buttonNegative: 'Cancel',
        });
        if (nearby !== PermissionsAndroid.RESULTS.GRANTED) {
          setLocationPermissionGranted(false);
          return false;
        }
      }
      // Android 17+ gates LAN socket access behind ACCESS_LOCAL_NETWORK. Older versions ignore this.
      try {
        const localNetwork = (PermissionsAndroid.PERMISSIONS as any).ACCESS_LOCAL_NETWORK || 'android.permission.ACCESS_LOCAL_NETWORK';
        if (Platform.Version >= 37) await PermissionsAndroid.request(localNetwork);
      } catch {}
      const granted = true;
      setLocationPermissionGranted(granted);
      return granted;
    } catch {
      setLocationPermissionGranted(false);
      return false;
    }
  };

  const requestCameraPermission = async () => {
    const result = await requestPerm();
    if (!result.granted) Alert.alert('Camera permission needed', 'Allow camera access to scan the receiver QR code.');
  };

  // ---------- incoming messages ----------
  function handleMessage(m: any) {
    switch (m.type) {
      case 'session-created': setMyCode(m.code); break;
      case 'session-error': Alert.alert('Pairing failed', m.message); break;
      case 'pairing-error':
        setConn('offline');
        Alert.alert('Pairing failed', m.message || 'Refresh the receiver pairing code and try again.');
        break;
      case 'paired': {
        setConn('online');
        pairedPeerId.current = m.peer.id;
        pairedPeerName.current = m.peer.name;
        setPeer({ id: m.peer.id, name: m.peer.name });
        setMyCode(null);
        lostAlert.current = false;
        setScreen(pairMode.current === 'receive' ? 'receive-pair' : 'send-pair');
        resumeInterrupted();
        if (pairMode.current === 'send' && pendingFiles.current.length) sendPreparedFiles();
        break;
      }
      case 'unpair':
      case 'peer-unpaired': failActiveTransfers(); setIncomingRequest(null); pairedPeerId.current = null; pairedPeerName.current = 'A nearby device'; setPeer(null); setMyCode(null); Alert.alert('Partner disconnected'); break;

      case 'transfer-request': {
        const { transferId, name, size } = m;
        if (m.fromPeerId) pairedPeerId.current = m.fromPeerId;
        setScreen('receive-pair');
        setItems(p => [{ id: transferId, name, size, done: 0, dir: 'receive', status: 'waiting', speed: 0, mimeType: m.mime }, ...p]);
        setIncomingRequest({ files: [{ id: transferId, name, size, mime: m.mime }], targetId: m.fromPeerId });
        break;
      }
      case 'transfer-batch-request': {
        const files = Array.isArray(m.files) ? m.files.filter((file: any) => file?.id && file?.name) : [];
        if (!files.length) break;
        if (m.fromPeerId) pairedPeerId.current = m.fromPeerId;
        setScreen('receive-pair');
        setItems(previous => [
          ...files.map((file: any) => ({ id: file.id, name: file.name, size: Number(file.size) || 0, done: 0, dir: 'receive' as const, status: 'waiting' as const, speed: 0, mimeType: file.mime })),
          ...previous.filter((item) => !files.some((file: any) => file.id === item.id)),
        ]);
        files.forEach((file: any) => recordedIds.current.delete(file.id));
        setIncomingRequest({ files, targetId: m.fromPeerId });
        break;
      }
      case 'transfer-response': {
        const o = outgoing.current.get(m.transferId);
        if (!o) break;
        if (!m.accepted) { patch(m.transferId, { status: 'declined' }); o.handle?.close(); outgoing.current.delete(m.transferId); break; }
        o.accepted = true; o.start = Date.now(); patch(m.transferId, { status: 'active' }); void pump(m.transferId);
        break;
      }
      case 'transfer-resume': {
        const id = m.transferId;
        const r = incoming.current.get(id);
        const finishedChunks = completedIncoming.current.get(id);
        if (finishedChunks !== undefined) {
          sendToPeer({ type: 'transfer-resume-response', transferId: id, accepted: true, have: finishedChunks > 0 ? [[0, finishedChunks - 1]] : [] });
        } else if (r) {
          r.paused = false; r.start = Date.now(); r.base = r.received;
          patch(id, { status: 'active' });
          sendToPeer({ type: 'transfer-resume-response', transferId: id, accepted: true, have: toRanges(r.seen) });
        } else {
          sendToPeer({ type: 'transfer-resume-response', transferId: id, accepted: false });
        }
        break;
      }
      case 'transfer-resume-response': {
        const o = outgoing.current.get(m.transferId);
        if (!o) break;
        if (!m.accepted) {
          try { o.handle.close(); } catch {}
          outgoing.current.delete(m.transferId);
          patch(m.transferId, { status: 'failed' });
          Alert.alert('Could not resume', `${o.name} is no longer available on the receiver. Send it again.`);
          break;
        }
        o.skip = new Set<number>();
        for (const range of Array.isArray(m.have) ? m.have : []) {
          const a = Math.max(0, Number(range?.[0])); const b = Math.min(o.total - 1, Number(range?.[1]));
          for (let i = a; i <= b; i++) o.skip.add(i);
        }
        o.next = 0; o.inflight = 0; o.acked = 0; o.paused = false; o.pumping = false; o.epoch++;
        o.start = Date.now(); o.base = Math.min(o.size, o.skip.size * CHUNK);
        patch(m.transferId, { status: 'active' });
        void pump(m.transferId);
        break;
      }
      case 'transfer-chunk': void receiveChunk(m); break;
      case 'transfer-ack': onAck(m); break;
      case 'transfer-complete': {
        if (m.cancelled) {
          const r = incoming.current.get(m.transferId);
          r?.handle?.close(); incoming.current.delete(m.transferId);
          patch(m.transferId, { status: 'failed' });
        }
        break;
      }
      case 'transfer-error': {
        const inc = incoming.current.get(m.transferId);
        if (inc) { try { inc.handle?.close(); } catch {} try { inc.file?.delete(); } catch {} incoming.current.delete(m.transferId); patch(m.transferId, { status: 'failed' }); }
        const o = outgoing.current.get(m.transferId);
        if (o) {
          o.handle?.close();
          outgoing.current.delete(m.transferId);
          patch(m.transferId, { status: 'failed' });
        }
        Alert.alert('Transfer failed', m.message || 'The transfer could not be completed.');
        break;
      }
    }
  }

  // ---------- receive ----------
  const declineFiles = (files: any[], targetId?: string) => files.forEach((file) => {
    sendToPeer({ type: 'transfer-response', transferId: file.id, accepted: false }, targetId);
    patch(file.id, { status: 'declined' });
  });

  const acceptIncomingFiles = async (files: any[], targetId?: string) => {
    try {
      if (Platform.OS === 'ios') {
        // iOS has no folder picker for apps: files are kept in ShareKita's folder (visible in the Files app).
        for (const file of files) await acceptFile(file.id, file.name, Number(file.size) || 0, 'ios-documents', file.mime || null, targetId);
        return;
      }
      if (Platform.OS !== 'android') throw new Error('Receiving is available in the Android and iPhone apps.');
      const FileSystemLegacy = await import('expo-file-system/legacy');
      const downloads = FileSystemLegacy.StorageAccessFramework.getUriForDirectoryInRoot('Download');
      const permission = await FileSystemLegacy.StorageAccessFramework.requestDirectoryPermissionsAsync(downloads);
      if (!permission.granted) {
        declineFiles(files, targetId);
        Alert.alert('Receive cancelled', 'Choose a folder to receive the files. No files were accepted or saved.');
        return;
      }
      for (const file of files) {
        await acceptFile(file.id, file.name, Number(file.size) || 0, permission.directoryUri, file.mime || null, targetId);
      }
    } catch (error: any) {
      declineFiles(files, targetId);
      Alert.alert('Cannot choose receive folder', error?.message || 'Select a folder and accept the files again.');
    }
  };

  const acceptFile = async (id: string, name: string, size: number, destinationUri: string, mimeType?: string | null, targetId?: string) => {
    try {
      if (Platform.OS === 'web') throw new Error('Receiving over a phone hotspot is available in the Android and iPhone apps.');
      const { File, Directory, Paths } = await import('expo-file-system');
      const alreadyReserved = Array.from(incoming.current.values()).reduce((total, item) => total + Math.max(0, item.size - item.received), 0);
      const available = Paths.availableDiskSpace;
      const reserve = 1024 * 1024;
      if (!Number.isFinite(size) || size < 0) throw new Error('The sender reported an invalid file size.');
      if (Number.isFinite(available) && available < alreadyReserved + size + reserve) {
        throw new Error(`Not enough free storage. This file needs ${fmt(size)}; only ${fmt(Math.max(0, available - alreadyReserved))} is available.`);
      }
      const dir = new Directory(Paths.document, 'ShareKita');
      dir.create({ idempotent: true } as any);
      const safe = name.replace(/[^\w.\- ]/g, '_');
      const file = new File(dir, `${Date.now()}_${uid()}_${safe}`);
      file.create();
      incoming.current.set(id, { file, handle: file.open(), received: 0, size, start: Date.now(), destinationUri, mimeType, name, seen: new Set<number>(), finishing: false });
      patch(id, { status: 'active' });
      // Tell the sender to start BEFORE doing any further work for this file.
      if (!sendToPeer({ type: 'transfer-response', transferId: id, accepted: true }, targetId)) {
        throw new Error('Lost connection to the sender. Pair again and retry.');
      }
      if (size === 0) await finishReceive(id);
    } catch (e: any) {
      const stale = incoming.current.get(id);
      if (stale) { try { stale.handle?.close(); } catch {} try { stale.file?.delete(); } catch {} incoming.current.delete(id); }
      patch(id, { status: 'failed' });
      sendToPeer({ type: 'transfer-response', transferId: id, accepted: false }, targetId);
      Alert.alert('Cannot save file', e.message);
    }
  };
  const copyFileToSaf = async (FileSystemLegacy: any, from: string, to: string, size: number) => {
    const chunkSize = 256 * 1024;
    for (let offset = 0; offset < size; offset += chunkSize) {
      const length = Math.min(chunkSize, size - offset);
      const chunk = await FileSystemLegacy.readAsStringAsync(from, {
        encoding: FileSystemLegacy.EncodingType.Base64,
        position: offset,
        length,
      });
      await FileSystemLegacy.writeAsStringAsync(to, chunk, {
        encoding: FileSystemLegacy.EncodingType.Base64,
        append: offset > 0,
      });
    }
  };
  const finishReceive = async (id: string) => {
    const r = incoming.current.get(id);
    if (!r) return;
    try { r.handle.close(); } catch {}
    incoming.current.delete(id);
    completedIncoming.current.set(id, Math.ceil(r.size / CHUNK));
    if (r.destinationUri === 'ios-documents') {
      // Already in Documents/ShareKita; give it its real name (unique) so it is recognisable in the Files app.
      try {
        const { File, Directory, Paths } = await import('expo-file-system');
        const dir = new Directory(Paths.document, 'ShareKita');
        const clean = r.name.replace(/[\\/:*?"<>|]/g, '_');
        const dot = clean.lastIndexOf('.');
        const base = dot > 0 ? clean.slice(0, dot) : clean; const ext = dot > 0 ? clean.slice(dot) : '';
        let target = new File(dir, clean); let n = 1;
        while (target.exists) target = new File(dir, `${base} (${n++})${ext}`);
        await r.file.move(target);
        patch(id, { status: 'done', done: r.size, uri: target.uri });
      } catch (error: any) {
        patch(id, { status: 'done', done: r.size, uri: r.file.uri });
      }
      return;
    }
    try {
      const FileSystemLegacy = await import('expo-file-system/legacy');
      const destination = await FileSystemLegacy.StorageAccessFramework.createFileAsync(
        r.destinationUri,
        r.name.replace(/[\\/:*?"<>|]/g, '_'),
        r.mimeType || 'application/octet-stream',
      );
      // Stream base64 chunks through SAF so large transfers reach the selected folder
      // without loading the whole file into memory.
      await copyFileToSaf(FileSystemLegacy, r.file.uri, destination, Number(r.size) || 0);
      r.file.delete();
      patch(id, { status: 'done', done: r.size, uri: destination });
    } catch (error: any) {
      // Keep the app-private copy if external storage becomes unavailable mid-transfer.
      patch(id, { status: 'failed', done: r.size, uri: r.file.uri });
      Alert.alert('Could not save file', `${r.name} was received, but could not be saved to the selected folder: ${error?.message || 'storage error'}`);
    }
  };
  const openFilePreview = async (uri: string, name: string, mimeType?: string | null) => {
    try {
      if (Platform.OS === 'web') {
        globalThis.open(uri, '_blank', 'noopener,noreferrer');
        return;
      }
      const { File } = await import('expo-file-system');
      const extension = name.split('.').pop()?.toLowerCase() || '';
      if (mimeType?.startsWith('image/') || /^(png|jpe?g|gif|webp|heic|bmp)$/.test(extension)) {
        setFilePreview({ uri, name, mimeType, kind: 'image' });
        return;
      }
      if (mimeType?.startsWith('text/') || /^(txt|csv|json|md|xml|log|html)$/.test(extension)) {
        const file = new File(uri);
        if (typeof file.size === 'number' && file.size <= 1024 * 1024) {
          setFilePreview({ uri, name, mimeType, kind: 'text', text: await file.text() });
          return;
        }
      }
      await new File(uri).preview();
    }
    catch (error: any) {
      Alert.alert('Could not preview file', error?.message || 'No preview is available for this file type. You can still share or save it.');
    }
  };
  const saveReceivedFile = async (uri: string, name: string, mimeType?: string | null) => {
    try {
      if (Platform.OS !== 'android') {
        if (Platform.OS === 'web') {
          const link = document.createElement('a');
          link.href = uri; link.download = name; link.click();
        } else await Sharing.shareAsync(uri);
        return;
      }
      const FileSystemLegacy = await import('expo-file-system/legacy');
      const initialDownloads = FileSystemLegacy.StorageAccessFramework.getUriForDirectoryInRoot('Download');
      const permission = await FileSystemLegacy.StorageAccessFramework.requestDirectoryPermissionsAsync(initialDownloads);
      if (!permission.granted) return;
      const safeName = name.replace(/[\\/:*?"<>|]/g, '_');
      const destination = await FileSystemLegacy.StorageAccessFramework.createFileAsync(
        permission.directoryUri,
        safeName,
        mimeType || 'application/octet-stream',
      );
      const info = await FileSystemLegacy.getInfoAsync(uri);
      if (!info.exists || typeof info.size !== 'number') throw new Error('ShareKita could not read the file size to save it.');
      await copyFileToSaf(FileSystemLegacy, uri, destination, info.size);
      Alert.alert('Saved', `Saved ${name} to the selected folder.`);
    } catch (error: any) {
      Alert.alert('Could not save file', error?.message || 'Choose a different Downloads folder and try again.');
    }
  };
  const receiveChunk = async (m: any) => {
    const r = incoming.current.get(m.transferId);
    if (!r) return;
    try {
      const key = sessionKey.current;
      if (!key) throw new Error('The secure pairing key is missing. Pair again with a fresh code.');
      if (!Number.isInteger(m.index) || m.index < 0) throw new Error('The received file chunk is invalid.');
      const plainB64 = await decryptChunk(key, m.transferId, m.index, m.data);
      // The transfer may have been cancelled/failed while we were decrypting.
      if (incoming.current.get(m.transferId) !== r) return;
      const bytes = fromB64(plainB64);
      const expectedLength = Math.min(CHUNK, r.size - m.index * CHUNK);
      if (bytes.length !== expectedLength) throw new Error('The received file chunk is invalid.');
      if (!r.seen.has(m.index)) {
        r.seen.add(m.index);
        r.handle.offset = m.index * CHUNK;
        r.handle.writeBytesSync(bytes);
        r.received += bytes.length;
      }
      const secs = Math.max(0.001, (Date.now() - r.start) / 1000);
      patch(m.transferId, { done: r.received, speed: (r.received - (r.base || 0)) / secs });
      // ACK first so the sender keeps its window moving; saving to the chosen folder happens afterwards.
      sendToPeer({ type: 'transfer-ack', transferId: m.transferId, index: m.index }, m.fromPeerId);
      if (r.received >= r.size && !r.finishing) {
        r.finishing = true;
        await finishReceive(m.transferId);
      }
    } catch (error: any) {
      try { r.handle.close(); } catch {}
      incoming.current.delete(m.transferId);
      patch(m.transferId, { status: 'failed' });
      sendToPeer({ type: 'transfer-error', transferId: m.transferId, message: error?.message || 'Encrypted file data could not be verified.' }, m.fromPeerId);
      Alert.alert('Secure transfer failed', error?.message || 'The file could not be decrypted or saved.');
    }
  };

  // ---------- send ----------
  const pickAndSend = async (type = '*/*') => {
    setPickerCategoriesVisible(false);
    const res = await DocumentPicker.getDocumentAsync({ type, multiple: true, copyToCacheDirectory: true });
    if (res.canceled) return;
    const selectedFiles: PendingFile[] = res.assets.map((asset) => ({ ...asset, id: uid() }));
    pairMode.current = 'send';
    setScreen('send-pair');
    const updated = [...pendingFiles.current, ...selectedFiles];
    pendingFiles.current = updated;
    setPendingItems(updated);
    if (pairedPeerId.current) sendPreparedFiles();
  };

  const removePendingFile = (id: string) => {
    const updated = pendingFiles.current.filter((file) => file.id !== id);
    pendingFiles.current = updated;
    setPendingItems(updated);
  };

  const sendPreparedFiles = () => {
    if (!pairedPeerId.current) {
      Alert.alert('Pair with a receiver first', 'Scan the receiver’s QR code before sending these files.');
      return;
    }
    if (!pendingFiles.current.length) return;
    const selected = pendingFiles.current.slice();
    pendingFiles.current = [];
    setPendingItems([]);
    void sendPendingFiles(selected);
  };

  async function sendPendingFiles(filesToSend: PendingFile[]) {
    if (Platform.OS === 'web') {
      Alert.alert('Android app required', 'Nearby encrypted transfers are available in the Android app.');
      return;
    }
    const { File, FileMode } = await import('expo-file-system');
    setItems((previous) => [
      ...filesToSend.map((file) => ({ id: file.id, name: file.name, size: file.size ?? 0, done: 0, dir: 'send' as const, status: 'waiting' as const, speed: 0 })),
      ...previous,
    ]);
    const manifest: { id: string; name: string; size: number; mime?: string | null }[] = [];
    for (const picked of filesToSend) {
      try {
        const file = new File(picked.uri);
        if (!file.exists) throw new Error('The selected file is no longer available.');
        const actualSize = file.size;
        const size = picked.size ?? actualSize ?? 0;
        if (!Number.isFinite(size) || size < 0) throw new Error('The file has an invalid size. Select it again and retry.');
        if (typeof actualSize === 'number' && actualSize < size) throw new Error('The selected file is incomplete in the transfer cache. Select it again and retry.');
        outgoing.current.set(picked.id, {
          handle: file.open(FileMode.ReadOnly), name: picked.name, mime: picked.mimeType, size, total: Math.ceil(size / CHUNK),
          next: 0, acked: 0, inflight: 0, start: 0, base: 0, epoch: 0, accepted: false, paused: false, pumping: false, skip: new Set<number>(),
        });
        patch(picked.id, { size, status: 'waiting' });
        manifest.push({ id: picked.id, name: picked.name, size, mime: picked.mimeType });
      } catch (error: any) {
        patch(picked.id, { status: 'failed' });
        Alert.alert('Cannot read file', error?.message || `Could not open ${picked.name}.`);
      }
    }
    if (manifest.length) sendToPeer({ type: 'transfer-batch-request', files: manifest });
  };
  const completeSend = (id: string, o: any) => {
    if (outgoing.current.get(id) !== o) return;
    sendToPeer({ type: 'transfer-complete', transferId: id });
    try { o.handle.close(); } catch {}
    outgoing.current.delete(id);
    patch(id, { status: 'done', done: o.size, speed: 0 });
  };
  // After reconnecting: resume accepted files, re-offer files the receiver never answered.
  const resumeInterrupted = () => {
    const offers: { id: string; name: string; size: number; mime?: string | null }[] = [];
    outgoing.current.forEach((o, id) => {
      if (o.accepted) sendToPeer({ type: 'transfer-resume', transferId: id, name: o.name, size: o.size });
      else offers.push({ id, name: o.name, size: o.size, mime: o.mime });
    });
    if (offers.length) sendToPeer({ type: 'transfer-batch-request', files: offers });
  };
  const pump = async (id: string) => {
    const o = outgoing.current.get(id);
    if (!o || o.pumping || o.paused) return;
    if (o.total === 0) { completeSend(id, o); return; }
    o.pumping = true;
    const epoch = o.epoch;
    try {
      while (o.inflight < WINDOW && o.next < o.total) {
        const i = o.next++;
        if (o.skip.has(i)) { o.acked++; continue; } // receiver already has this chunk
        const len = Math.min(CHUNK, o.size - i * CHUNK);
        o.handle.offset = i * CHUNK;
        const bytes: Uint8Array = o.handle.readBytesSync(len);
        if (bytes.length !== len) throw new Error('Could not read all bytes from the selected file.');
        const key = sessionKey.current;
        if (!key) throw new Error('The secure pairing key is missing. Pair again with a fresh code.');
        o.inflight++;
        const encrypted = await encryptChunk(key, id, i, toB64(bytes));
        // The link was dropped/re-established while encrypting: this loop is stale.
        if (o.epoch !== epoch || outgoing.current.get(id) !== o) return;
        if (!sendToPeer({ type: 'transfer-chunk', transferId: id, index: i, data: encrypted })) return; // close handler pauses us
      }
      if (o.epoch === epoch && o.acked > 0) patch(id, { done: Math.min(o.size, o.acked * CHUNK) });
      if (o.epoch === epoch && o.acked >= o.total && o.inflight === 0) completeSend(id, o);
    } catch (error: any) {
      if (o.epoch !== epoch) return;
      try { o.handle.close(); } catch {}
      outgoing.current.delete(id);
      patch(id, { status: 'failed' });
      sendToPeer({ type: 'transfer-error', transferId: id, message: error?.message || 'Could not encrypt the file chunk.' });
      Alert.alert('Secure transfer failed', error?.message || 'Could not encrypt this file.');
    } finally {
      if (o.epoch === epoch) {
        o.pumping = false;
        // A quick ACK can arrive before this pump releases its lock. Resume here so
        // remaining chunks do not stall after the current window.
        if (outgoing.current.get(id) === o && !o.paused && o.inflight < WINDOW && o.next < o.total) {
          setTimeout(() => { void pump(id); }, 0);
        }
      }
    }
  };
  const onAck = (m: any) => {
    const o = outgoing.current.get(m.transferId);
    if (!o || o.paused) return;
    o.inflight = Math.max(0, o.inflight - 1); o.acked++;
    const sent = Math.min(o.size, o.acked * CHUNK);
    const secs = Math.max(0.001, (Date.now() - o.start) / 1000);
    patch(m.transferId, { done: sent, speed: Math.max(0, sent - (o.base || 0)) / secs });
    if (o.acked >= o.total) completeSend(m.transferId, o);
    else void pump(m.transferId);
  };

  // ---------- UI ----------
  const completedBytes = items.reduce((total, item) => total + (item.status === 'done' ? item.size : 0), 0);
  const pairingItems = screen === 'send-pair' ? items.filter((item) => item.dir === 'send') : items.filter((item) => item.dir === 'receive');
  const declineIncoming = (request: { files: any[]; targetId?: string }) => {
    request.files.forEach((file) => { sendToPeer({ type: 'transfer-response', transferId: file.id, accepted: false }, request.targetId); patch(file.id, { status: 'declined' }); });
    setIncomingRequest(null);
  };
  const historyModal = (
    <Modal visible={showHistory} transparent animationType="slide" onRequestClose={() => setShowHistory(false)}>
      <View style={s.modalBackdrop}>
        <View style={s.categorySheet}>
          <View style={s.previewHeader}>
            <View style={{ flex: 1 }}><Text style={s.categoryTitle}>Transfer history</Text><Text style={s.categorySubtitle}>{history.length} saved on this device · nothing is uploaded</Text></View>
            <TouchableOpacity onPress={() => setShowHistory(false)}><Text style={s.previewClose}>Close</Text></TouchableOpacity>
          </View>
          <ScrollView style={{ maxHeight: windowHeight * 0.55 }}>
            {history.length === 0 ? <Text style={s.mutedCenter}>No finished transfers yet.</Text> : history.map((entry) => (
              <View key={entry.id} style={[s.transferCard, { marginBottom: 8 }]}>
                <View style={s.transferRow}>
                  <Text style={s.transferName} numberOfLines={1}>{entry.dir === 'send' ? '↗ ' : '↙ '}{entry.name}</Text>
                  <Text style={[s.transferStatus, entry.status !== 'done' && { color: '#B91C1C' }]}>{entry.status}</Text>
                </View>
                <Text style={s.transferMeta}>{fmt(entry.size)} · {entry.dir === 'send' ? 'to' : 'from'} {entry.peer} · {new Date(entry.at).toLocaleString()}</Text>
                {entry.dir === 'receive' && entry.status === 'done' && entry.uri ? (
                  <View style={s.fileActions}><TouchableOpacity onPress={() => { void openFilePreview(entry.uri!, entry.name, entry.mimeType); }}><Text style={s.openFile}>Preview</Text></TouchableOpacity></View>
                ) : null}
              </View>
            ))}
          </ScrollView>
          {history.length > 0 && (
            <TouchableOpacity onPress={() => Alert.alert('Clear history?', 'Received files stay in your folder. Only this list is removed.', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Clear', style: 'destructive', onPress: () => setHistory([]) },
            ])}><Text style={s.declineText}>Clear history</Text></TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
  const previewModal = filePreview ? (
    <Modal visible transparent animationType="slide" onRequestClose={() => setFilePreview(null)}>
      <View style={s.previewBackdrop}>
        <SafeAreaView style={s.previewSheet}>
          <View style={s.previewHeader}>
            <Text style={s.previewTitle} numberOfLines={1}>{filePreview.name}</Text>
            <TouchableOpacity onPress={() => setFilePreview(null)}><Text style={s.previewClose}>Close</Text></TouchableOpacity>
          </View>
          {filePreview.kind === 'image' ? (
            <Image source={{ uri: filePreview.uri }} style={s.previewImage} resizeMode="contain" />
          ) : (
            <ScrollView style={s.previewTextScroll}><Text selectable style={s.previewText}>{filePreview.text}</Text></ScrollView>
          )}
        </SafeAreaView>
      </View>
    </Modal>
  ) : null;
  const pickerModal = (
    <Modal visible={pickerCategoriesVisible} transparent animationType="slide" onRequestClose={() => setPickerCategoriesVisible(false)}>
      <View style={s.modalBackdrop}>
        <View style={s.categorySheet}>
          <View style={s.previewHeader}>
            <View style={{ flex: 1 }}><Text style={s.categoryTitle}>Choose what to send</Text><Text style={s.categorySubtitle}>Select a category, then choose one or more items.</Text></View>
            <TouchableOpacity onPress={() => setPickerCategoriesVisible(false)}><Text style={s.previewClose}>Close</Text></TouchableOpacity>
          </View>
          <View style={s.categoryGrid}>
            {[
              { label: 'Photos', icon: '▧', type: 'image/*' },
              { label: 'Videos', icon: '▷', type: 'video/*' },
              { label: 'Music', icon: '♫', type: 'audio/*' },
              ...(Platform.OS === 'android' ? [{ label: 'Apps', icon: '◇', type: 'application/vnd.android.package-archive' }] : []),
              { label: 'Files', icon: '▤', type: '*/*' },
            ].map((category) => (
              <TouchableOpacity key={category.label} style={s.categoryOption} onPress={() => { void pickAndSend(category.type); }}>
                <Text style={s.categoryIcon}>{category.icon}</Text><Text style={s.categoryLabel}>{category.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={s.categoryFootnote}>Apps are available on Android when APK files can be browsed.</Text>
        </View>
      </View>
    </Modal>
  );
  const incomingModal = incomingRequest ? (
    <Modal visible transparent animationType="slide" onRequestClose={() => declineIncoming(incomingRequest)}>
      <View style={s.modalBackdrop}>
        <View style={s.categorySheet}>
          <Text style={s.categoryTitle}>Files ready to receive</Text>
          <Text style={s.categorySubtitle}>{pairedPeerName.current} wants to send {incomingRequest.files.length} {incomingRequest.files.length === 1 ? 'item' : 'items'} · {fmt(incomingRequest.files.reduce((sum, file) => sum + (Number(file.size) || 0), 0))}</Text>
          <ScrollView style={s.incomingList}>
            {incomingRequest.files.map((file) => <View key={file.id} style={s.incomingFile}><Text style={s.categoryIcon}>▤</Text><View style={{ flex: 1 }}><Text numberOfLines={1} style={s.pendingFileName}>{file.name}</Text><Text style={s.pendingFileSize}>{fmt(Number(file.size) || 0)}</Text></View></View>)}
          </ScrollView>
          <View style={s.incomingActions}>
            <TouchableOpacity style={s.declineButton} onPress={() => declineIncoming(incomingRequest)}><Text style={s.declineText}>Decline</Text></TouchableOpacity>
            <TouchableOpacity style={s.acceptButton} onPress={() => {
              const request = incomingRequest;
              setIncomingRequest(null);
              void acceptIncomingFiles(request.files, request.targetId);
            }}><Text style={s.acceptText}>Accept and receive</Text></TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  ) : null;

  if (booting || !deviceNameLoaded) {
    return (
      <View style={s.bootRoot} onLayout={() => { void SplashScreen.hideAsync().catch(() => undefined); }}>
        <StatusBar barStyle="dark-content" />
        <Image source={require('../../assets/brand-logo.png')} style={s.bootLogo} resizeMode="contain" />
        <Text style={s.bootLabel}>Getting ShareKita ready</Text>
        <View style={s.bootProgressTrack}>
          <View style={[s.bootProgressFill, { width: `${bootProgress}%` }]} />
        </View>
        <Text style={s.bootPercent}>{bootProgress}%</Text>
        <Text style={s.bootFootnote}>Nearby file transfer</Text>
      </View>
    );
  }

  if (screen !== 'home' && !scanning) {
    return (
      <View style={s.root}>
        <StatusBar barStyle="dark-content" />
        <ScrollView contentContainerStyle={s.page}>
          <View style={s.flowHeader}>
            <TouchableOpacity style={s.iconButton} onPress={() => setScreen('home')}><Text style={s.iconText}>‹</Text></TouchableOpacity>
            <View style={s.flowHeaderCopy}><Text style={s.flowBrand}>Share<Text style={{ color: '#F59E0B' }}>Kita</Text></Text><Text style={s.tagline}>{screen === 'send-pair' ? 'Send files' : 'Receive files'}</Text></View>
            <TouchableOpacity style={s.iconButton} onPress={() => { setScreen('home'); setShowSettings(true); }}><Text style={s.iconText}>⚙</Text></TouchableOpacity>
          </View>

          <View style={s.flowIntro}>
            <Text style={s.flowTitle}>{screen === 'send-pair' ? 'Scan the receiver’s code' : 'Show your pairing code'}</Text>
            <Text style={s.flowSubtitle}>{screen === 'send-pair' ? 'Scan the receiver QR code, then choose their visible Mobile Hotspot in Android’s Wi-Fi prompt.' : 'Turn on your mobile hotspot, then let the sender scan your pairing code.'}</Text>
          </View>

          <View style={s.connectionCard}>
            <View style={[s.connectionDot, { backgroundColor: conn === 'online' ? '#10B981' : conn === 'connecting' ? '#F59E0B' : '#94A3B8' }]} />
            <View style={{ flex: 1 }}>
              <Text style={s.connectionTitle}>{peer ? `Paired with ${peer.name}` : conn === 'online' ? 'Direct Wi-Fi connection' : conn === 'connecting' && screen === 'send-pair' ? 'Approve hotspot connection' : conn === 'connecting' ? 'Starting nearby connection…' : 'Waiting to pair'}</Text>
              <Text style={s.connectionDetail}>{peer ? 'Files transfer directly over the receiver’s mobile hotspot.' : conn === 'connecting' && screen === 'send-pair' ? 'Approve Android’s system prompt to join the receiver’s hotspot. ShareKita connects and starts sending automatically.' : screen === 'receive-pair' ? 'Accepted files are saved to a folder you choose, starting at Downloads.' : 'Turn on your phone’s mobile hotspot in Android Settings to receive files.'}</Text>
            </View>
            {peer && <TouchableOpacity onPress={disconnectPeer}><Text style={s.disconnectText}>Disconnect</Text></TouchableOpacity>}
          </View>

          {screen === 'send-pair' ? (
            <View style={s.pairCard}>
              {peer ? (
                <View style={s.pairedState}>
                  <Text style={s.pairedIcon}>✓</Text>
                  <Text style={s.pairCardTitle}>Device paired</Text>
                  <Text style={s.pairCardSubtitle}>{pendingItems.length ? `Starting transfer of ${pendingItems.length} item(s) to ${peer.name}. The receiver will be asked to accept.` : `Choose files to send to ${peer.name}.`}</Text>
                  <TouchableOpacity style={s.retryButton} onPress={() => setPickerCategoriesVisible(true)}><Text style={s.retryText}>Choose more files</Text></TouchableOpacity>
                </View>
              ) : conn === 'connecting' ? (
                <View style={s.pairedState}>
                  <Text style={s.connectingIcon}>◌</Text>
                  <Text style={s.pairCardTitle}>Joining receiver hotspot</Text>
                  <Text style={s.pairCardSubtitle}>Approve the Android Wi-Fi prompt. ShareKita will finish pairing and start the transfer automatically.</Text>
                </View>
              ) : (
                <>
                  <TouchableOpacity style={s.scanButton} onPress={startScanning}><Text style={s.scanButtonText}>Scan receiver QR code</Text></TouchableOpacity>
                  <Text style={s.pairCardSubtitle}>Scan the QR shown on the receiver’s ShareKita screen. Your phone may ask to join its Wi-Fi hotspot.</Text>
                  <TouchableOpacity style={s.retryButton} onPress={() => setPickerCategoriesVisible(true)}><Text style={s.retryText}>Choose more files</Text></TouchableOpacity>
                </>
              )}
            </View>
          ) : (
            <View style={s.pairCard}>
              {peer ? (
                <View style={s.pairedState}>
                  <Text style={s.pairedIcon}>✓</Text>
                  <Text style={s.pairCardTitle}>Connected to {peer.name}</Text>
                  <Text style={s.pairCardSubtitle}>Stay here to accept incoming files.</Text>
                </View>
              ) : myCode ? (
                <>
                  <Text style={s.pairCardTitle}>Let the sender scan this code</Text>
                  <View style={s.qrFrame}>
                    <QRCode value={qrPayload} size={qrSize} quietZone={16} ecl="M" />
                  </View>
                  <Text style={s.pairCardSubtitle}>After scanning, the sender selects your visible Mobile Hotspot from Android’s Wi-Fi chooser and approves the connection.</Text>
                  <Text style={s.pairCardSubtitle}>This QR expires after 3 minutes and can pair once.</Text>
                  <TouchableOpacity style={s.retryButton} onPress={refreshReceiverQr}><Text style={s.retryText}>Refresh QR code</Text></TouchableOpacity>
                </>
              ) : (
                <View style={s.pairedState}>
                  <Text style={s.pairCardTitle}>Use your phone’s mobile hotspot</Text>
                  <Text style={s.pairCardSubtitle}>Turn on Mobile Hotspot (Personal Hotspot on iPhone) in Settings. After scanning, an Android sender picks it in the Wi-Fi chooser; an iPhone sender joins it in Settings first. ShareKita won’t ask for its name or password; Android may ask for the hotspot password.</Text>
                  <TouchableOpacity style={s.retryButton} onPress={() => { void openHotspotSettings().catch((error: any) => Alert.alert('Could not open hotspot settings', error?.message || 'Open Android Settings and enable Mobile Hotspot.')); }}><Text style={s.retryText}>Open hotspot settings</Text></TouchableOpacity>
                  <TouchableOpacity style={s.retryButton} onPress={() => { void createReceiverQr(); }}><Text style={s.retryText}>Show pairing QR</Text></TouchableOpacity>
                </View>
              )}
            </View>
          )}

          {screen === 'send-pair' && pendingItems.length > 0 && (
            <View style={s.flowList}>
              <Text style={s.cardTitle}>READY TO SEND ({pendingItems.length})</Text>
              {pendingItems.map((file) => (
                <View key={file.id} style={s.pendingFile}>
                  <View style={{ flex: 1 }}><Text style={s.pendingFileName} numberOfLines={1}>{file.name}</Text><Text style={s.pendingFileSize}>{fmt(file.size ?? 0)}</Text></View>
                  <TouchableOpacity onPress={() => { void openFilePreview(file.uri, file.name, file.mimeType); }}><Text style={s.openFile}>Preview</Text></TouchableOpacity>
                  <TouchableOpacity onPress={() => removePendingFile(file.id)}><Text style={s.disconnectText}>Remove</Text></TouchableOpacity>
                </View>
              ))}
            </View>
          )}

          {pairingItems.length > 0 && (
            <View style={s.flowList}>
              <Text style={s.cardTitle}>{screen === 'send-pair' ? 'TRANSFER PROGRESS' : 'INCOMING TRANSFERS'}</Text>
              {pairingItems.map((item) => (
                <View key={item.id} style={s.transferCard}>
                  <View style={s.transferRow}>{item.dir === 'receive' && item.status === 'done' && item.uri ? <TouchableOpacity style={{ flex: 1 }} onPress={() => { void openFilePreview(item.uri!, item.name, item.mimeType); }}><Text style={s.transferName} numberOfLines={1}>{item.name}</Text></TouchableOpacity> : <Text style={s.transferName} numberOfLines={1}>{item.name}</Text>}<Text style={s.transferStatus}>{item.status}</Text></View>
                  <Text style={s.transferMeta}>{fmt(item.done)} / {fmt(item.size)}{item.status === 'active' ? ` · ${fmt(item.speed)}/s` : ''}</Text>
                  <View style={s.bar}><View style={[s.fill, { width: `${item.size ? Math.min(100, (item.done / item.size) * 100) : item.status === 'done' ? 100 : 0}%` }]} /></View>
                  {item.dir === 'receive' && item.status === 'done' && item.uri && <View style={s.fileActions}><TouchableOpacity onPress={() => { void openFilePreview(item.uri!, item.name, item.mimeType); }}><Text style={s.openFile}>Preview</Text></TouchableOpacity><TouchableOpacity onPress={() => saveReceivedFile(item.uri!, item.name, item.mimeType)}><Text style={s.openFile}>Save to Downloads</Text></TouchableOpacity><TouchableOpacity onPress={() => Sharing.shareAsync(item.uri!)}><Text style={s.openFile}>Share</Text></TouchableOpacity></View>}
                </View>
              ))}
            </View>
          )}
        </ScrollView>
        {historyModal}
      {previewModal}
        {pickerModal}
        {incomingModal}
      </View>
    );
  }

  if (scanning) {
    return (
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        <StatusBar barStyle="light-content" />
        <CameraView style={{ flex: 1 }} barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={onScan} />
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <View style={s.scanShade} />
          <View style={{ height: scanBoxSize, flexDirection: 'row' }}>
            <View style={s.scanShade} />
            <View style={[s.scanTarget, { width: scanBoxSize, height: scanBoxSize }]} />
            <View style={s.scanShade} />
          </View>
          <View style={s.scanShade} />
        </View>
        <View style={s.scanInstructions}>
          <Text style={s.scanInstructionsText}>{scanHint || 'Fit the receiver’s ShareKita QR inside the box.'}</Text>
        </View>
        <TouchableOpacity style={s.floatBtn} onPress={() => setScanning(false)}><Text style={s.btnText}>Cancel</Text></TouchableOpacity>
      </View>
    );
  }

  return (
    <SafeAreaView style={s.root}>
      <StatusBar barStyle="dark-content" />
      <ScrollView contentContainerStyle={s.page}>
        <View style={s.header}>
          <Image source={require('../../assets/adaptive-icon.png')} style={s.brandMark} resizeMode="contain" />
          <View style={s.brandText}><Text style={s.brand}>Share<Text style={{ color: '#F59E0B' }}>Kita</Text></Text><Text style={s.tagline}>Nearby File Transfer</Text></View>
          <View style={s.headerActions}>
            <TouchableOpacity style={s.iconButton} onPress={startScanning}><Text style={s.iconText}>▦</Text></TouchableOpacity>
            <TouchableOpacity style={s.iconButton} onPress={() => setShowHistory(true)}><Text style={s.iconText}>◷</Text></TouchableOpacity>
            <TouchableOpacity style={s.iconButton} onPress={() => setShowSettings(!showSettings)}><Text style={s.iconText}>⚙</Text></TouchableOpacity>
          </View>
        </View>

        <View style={s.deviceCard}>
          <View style={s.deviceAvatar}><Text style={{ fontSize: 22 }}>💻</Text></View>
          <View style={s.deviceInfo}><View style={s.deviceTitleRow}><Text style={s.deviceName}>{deviceName}</Text><Text style={s.readyBadge}>{peer ? 'Paired' : 'Ready'}</Text></View><Text style={s.deviceSubtitle}>{Platform.OS === 'ios' ? 'iOS' : 'Android'}  ·  {peer ? `Connected to ${peer.name}` : 'Ready to share'}</Text></View>
          <TouchableOpacity style={s.editButton} onPress={() => setShowSettings(!showSettings)}><Text style={s.editText}>Edit</Text></TouchableOpacity>
        </View>

        {showSettings && <View style={s.settingsCard}><Text style={s.fieldLabel}>Device name</Text><TextInput style={s.input} value={deviceName} onChangeText={setDeviceName} onEndEditing={() => persistDeviceName(deviceName)} /><Text style={s.permissionHeading}>PAIRING PERMISSIONS</Text><TouchableOpacity style={s.permissionRow} onPress={requestCameraPermission}><Text style={s.permissionLabel}>Camera</Text><Text style={s.permissionAction}>{perm?.granted ? 'Allowed' : 'Allow'}</Text></TouchableOpacity><TouchableOpacity style={s.permissionRow} onPress={requestLocationPermission}><Text style={s.permissionLabel}>Location / nearby Wi-Fi</Text><Text style={s.permissionAction}>{locationPermissionGranted ? 'Allowed' : 'Allow'}</Text></TouchableOpacity><View style={s.permissionRow}><Text style={s.permissionLabel}>Internet / network</Text><Text style={s.permissionAction}>Granted at install</Text></View><Text style={s.permissionNote}>Android grants network access at install. Files transfer locally over Wi-Fi and do not need an internet connection.</Text><TouchableOpacity style={s.smallAction} onPress={() => setShowSettings(false)}><Text style={s.smallActionText}>Done</Text></TouchableOpacity></View>}

        <View style={s.actionRow}>
          <TouchableOpacity style={s.sendTile} onPress={() => setPickerCategoriesVisible(true)}>
            <View style={s.tileIcon}><Text style={s.tileArrow}>↗</Text></View><View><Text style={s.tileTitle}>SEND</Text><Text style={s.tileDescription}>Select files, photos,{ '\n' }videos & apps</Text></View>
          </TouchableOpacity>
          <TouchableOpacity style={s.receiveTile} onPress={openReceivePairing}>
            <View style={s.receiveTop}><View style={s.receiveIcon}><Text style={[s.tileArrow, { color: '#D97706' }]}>↙</Text></View><Text style={s.listenBadge}>◉ Listen</Text></View><View><Text style={s.tileTitle}>RECEIVE</Text><Text style={s.tileDescription}>Turn on your hotspot and{ '\n' }wait for a sender</Text></View>
          </TouchableOpacity>
        </View>

        <View style={s.toolsRow}>
          <TouchableOpacity style={s.toolCard} onPress={startScanning}><Text style={s.toolIcon}>▦</Text><Text style={s.toolLabel}>Scan QR</Text></TouchableOpacity>
          <TouchableOpacity style={s.toolCard} onPress={openReceivePairing}><Text style={s.toolIcon}>◉</Text><Text style={s.toolLabel}>My QR</Text></TouchableOpacity>
          <TouchableOpacity style={s.toolCard} onPress={() => setShowHistory(true)}><Text style={s.toolIcon}>▤</Text><Text style={s.toolLabel}>History</Text></TouchableOpacity>
          <TouchableOpacity style={s.toolCard} onPress={() => setShowSettings(!showSettings)}><Text style={s.toolIcon}>◇</Text><Text style={s.toolLabel}>Permissions</Text></TouchableOpacity>
        </View>

        <View style={s.sessionCard}>
          <View style={s.sessionHeading}><Text style={s.cardTitle}>▱  THIS SESSION</Text><Text style={s.resetLabel}>Resets when you close the app</Text></View>
          <View style={s.metricsRow}><View style={s.metric}><Text style={s.metricValue}>{fmt(completedBytes)}</Text><Text style={s.metricLabel}>Shared Data</Text></View><View style={s.metric}><Text style={[s.metricValue, { color: '#EA580C' }]}>{items.filter(x => x.status === 'done').length}</Text><Text style={s.metricLabel}>Total Files</Text></View><View style={s.metric}><Text style={[s.metricValue, { color: '#059669' }]}>{items.length}</Text><Text style={s.metricLabel}>Transfers</Text></View></View>
        </View>

        <View style={s.recentSection}>
          <View style={s.sessionHeading}>
            <Text style={s.cardTitle}>RECENT TRANSFERS</Text>
            {items.length > 3 && (
              <TouchableOpacity onPress={() => setShowAllItems(!showAllItems)}>
                <Text style={s.openFile}>{showAllItems ? 'Show less' : 'See all'}</Text>
              </TouchableOpacity>
            )}
          </View>
          {items.length === 0 ? (
            <View style={s.emptyRecent}>
              <Text style={s.mutedCenter}>Files you send or receive will appear here.</Text>
            </View>
          ) : (
            items.slice(0, showAllItems ? items.length : 3).map((item) => (
              <View key={item.id} style={s.transferCard}>
                <View style={s.transferRow}>
                  {item.dir === 'receive' && item.status === 'done' && item.uri ? <TouchableOpacity style={{ flex: 1 }} onPress={() => { void openFilePreview(item.uri!, item.name, item.mimeType); }}><Text style={s.transferName} numberOfLines={1}>↙ {item.name}</Text></TouchableOpacity> : <Text style={s.transferName} numberOfLines={1}>{item.dir === 'send' ? '↗ ' : '↙ '}{item.name}</Text>}
                  <Text style={s.transferStatus}>{item.status}</Text>
                </View>
                <Text style={s.transferMeta}>{fmt(item.done)} / {fmt(item.size)}{item.status === 'active' ? ` · ${fmt(item.speed)}/s` : ''}</Text>
                <View style={s.bar}>
                  <View style={[s.fill, { width: `${item.size ? Math.min(100, (item.done / item.size) * 100) : 100}%` }]} />
                </View>
                {item.dir === 'receive' && item.status === 'done' && item.uri && (
                  <View style={s.fileActions}>
                    <TouchableOpacity onPress={() => { void openFilePreview(item.uri!, item.name, item.mimeType); }}><Text style={s.openFile}>Preview</Text></TouchableOpacity>
                    <TouchableOpacity onPress={() => saveReceivedFile(item.uri!, item.name, item.mimeType)}><Text style={s.openFile}>Save to Downloads</Text></TouchableOpacity>
                    <TouchableOpacity onPress={() => Sharing.shareAsync(item.uri!)}><Text style={s.openFile}>Share</Text></TouchableOpacity>
                  </View>
                )}
              </View>
            ))
          )}
        </View>
      </ScrollView>
      {historyModal}
      {previewModal}
      {pickerModal}
      {incomingModal}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F8FAFC' },
  page: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 32, maxWidth: 520, width: '100%', alignSelf: 'center', gap: 16 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
  flowHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
  flowHeaderCopy: { flex: 1 },
  flowBrand: { color: '#0F172A', fontSize: 16, fontWeight: '900' },
  flowIntro: { gap: 4, marginTop: 2 },
  flowTitle: { color: '#0F172A', fontSize: 22, fontWeight: '900', letterSpacing: -0.5 },
  flowSubtitle: { color: '#64748B', fontSize: 12, lineHeight: 18 },
  connectionCard: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#E2E8F0', padding: 13 },
  connectionDot: { width: 10, height: 10, borderRadius: 5 },
  connectionTitle: { color: '#0F172A', fontSize: 12, fontWeight: '800' },
  connectionDetail: { color: '#64748B', fontSize: 10, lineHeight: 15, marginTop: 3 },
  disconnectText: { color: '#B91C1C', fontSize: 10, fontWeight: '700' },
  pairCard: { backgroundColor: '#fff', borderRadius: 20, borderWidth: 1, borderColor: '#E2E8F0', padding: 18, alignItems: 'center', gap: 13 },
  pairCardTitle: { color: '#0F172A', fontSize: 16, fontWeight: '900', textAlign: 'center' },
  pairCardSubtitle: { color: '#64748B', fontSize: 11, lineHeight: 16, textAlign: 'center' },
  pinCode: { color: '#0F172A', fontSize: 34, fontWeight: '900', letterSpacing: 8, marginVertical: 2 },
  qrFrame: { padding: 16, borderRadius: 18, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#fff' },
  pairedState: { alignItems: 'center', gap: 8, paddingVertical: 12 },
  pairedIcon: { width: 42, height: 42, borderRadius: 21, textAlign: 'center', textAlignVertical: 'center', overflow: 'hidden', backgroundColor: '#ECFDF5', color: '#059669', fontWeight: '900', fontSize: 24 },
  connectingIcon: { width: 42, height: 42, borderRadius: 21, textAlign: 'center', textAlignVertical: 'center', overflow: 'hidden', backgroundColor: '#FEF3C7', color: '#D97706', fontWeight: '900', fontSize: 30 },
  retryButton: { backgroundColor: '#F59E0B', borderRadius: 12, paddingHorizontal: 18, paddingVertical: 11, marginTop: 4 },
  retryText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  flowList: { gap: 9 },
  pendingFile: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, backgroundColor: '#fff', borderRadius: 13, borderWidth: 1, borderColor: '#E2E8F0', padding: 12 },
  pendingFileName: { flex: 1, color: '#0F172A', fontSize: 11, fontWeight: '700' },
  pendingFileSize: { color: '#64748B', fontSize: 10 },
  brandMark: { width: 38, height: 38 },
  bootRoot: { flex: 1, minHeight: '100%', backgroundColor: '#F8FAFC', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  bootLogo: { width: 300, height: 300, maxWidth: '85%', marginBottom: 24 },
  bootLabel: { color: '#334155', fontSize: 14, fontWeight: '800', marginBottom: 16 },
  bootProgressTrack: { width: 240, maxWidth: '80%', height: 8, borderRadius: 8, backgroundColor: '#E2E8F0', overflow: 'hidden' },
  bootProgressFill: { height: '100%', borderRadius: 8, backgroundColor: '#F4B400' },
  bootPercent: { color: '#0F172A', fontSize: 13, fontWeight: '900', marginTop: 10 },
  bootFootnote: { position: 'absolute', bottom: 38, color: '#64748B', fontSize: 11 },
  logoDotTopRow: { width: 18, flexDirection: 'row', justifyContent: 'space-between' },
  logoDotBottom: { width: 18, alignItems: 'center', marginTop: 2 },
  logoDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#0F172A' },
  brandText: { flex: 1 },
  brand: { color: '#0F172A', fontSize: 16, fontWeight: '900', letterSpacing: -0.4 },
  tagline: { color: '#64748B', fontSize: 10, marginTop: 1 },
  headerActions: { flexDirection: 'row', gap: 6 },
  iconButton: { width: 34, height: 34, borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  iconText: { color: '#475569', fontSize: 18 },
  deviceCard: { backgroundColor: '#fff', borderRadius: 17, borderWidth: 1, borderColor: '#E2E8F0', padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  deviceAvatar: { width: 44, height: 44, borderRadius: 15, backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FDE68A', alignItems: 'center', justifyContent: 'center' },
  deviceInfo: { flex: 1 },
  deviceTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  deviceName: { color: '#0F172A', fontWeight: '800', fontSize: 13 },
  readyBadge: { color: '#047857', backgroundColor: '#ECFDF5', overflow: 'hidden', borderRadius: 6, borderWidth: 1, borderColor: '#A7F3D0', paddingHorizontal: 5, paddingVertical: 2, fontSize: 9, fontWeight: '700' },
  deviceSubtitle: { color: '#64748B', fontSize: 10, marginTop: 3 },
  editButton: { backgroundColor: '#F1F5F9', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 12 },
  editText: { color: '#334155', fontWeight: '700', fontSize: 11 },
  settingsCard: { backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#E2E8F0', padding: 12 },
  fieldLabel: { color: '#334155', fontSize: 11, fontWeight: '700', marginBottom: 5 },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 11, paddingHorizontal: 12, paddingVertical: 9, marginBottom: 10, fontSize: 12, color: '#0F172A' },
  smallAction: { backgroundColor: '#F59E0B', alignSelf: 'flex-end', paddingHorizontal: 18, paddingVertical: 8, borderRadius: 10 },
  smallActionText: { color: '#fff', fontWeight: '800', fontSize: 11 },
  actionRow: { flexDirection: 'row', gap: 12 },
  sendTile: { flex: 1, height: 154, backgroundColor: '#FFB900', borderRadius: 22, padding: 16, justifyContent: 'space-between', elevation: 3 },
  receiveTile: { flex: 1, height: 154, backgroundColor: '#fff', borderRadius: 22, borderWidth: 1.5, borderColor: '#F59E0B', padding: 15, justifyContent: 'space-between', overflow: 'hidden' },
  tileIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: 'rgba(120,70,0,0.12)', alignItems: 'center', justifyContent: 'center' },
  tileArrow: { color: '#0F172A', fontSize: 25, fontWeight: '700' },
  receiveTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  receiveIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FDE68A', alignItems: 'center', justifyContent: 'center' },
  listenBadge: { color: '#92400E', backgroundColor: '#FEF3C7', borderRadius: 12, overflow: 'hidden', paddingHorizontal: 7, paddingVertical: 4, fontSize: 9, fontWeight: '700' },
  tileTitle: { color: '#0F172A', fontSize: 21, fontWeight: '900', letterSpacing: -0.7 },
  tileDescription: { color: '#334155', fontSize: 10, lineHeight: 14, marginTop: 3 },
  toolsRow: { flexDirection: 'row', gap: 7 },
  toolCard: { flex: 1, height: 74, borderRadius: 15, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', gap: 5 },
  toolIcon: { color: '#B45309', backgroundColor: '#FEF3C7', overflow: 'hidden', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3, fontSize: 16, fontWeight: '700' },
  toolLabel: { color: '#334155', fontSize: 9, fontWeight: '700' },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15, 23, 42, 0.52)' },
  joinModal: { backgroundColor: '#fff', borderRadius: 22, padding: 18, gap: 16, borderWidth: 1, borderColor: '#E2E8F0' },
  modalHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  modalTitle: { color: '#0F172A', fontSize: 18, fontWeight: '900' },
  modalSubtitle: { color: '#64748B', fontSize: 11, marginTop: 4 },
  modalClose: { width: 30, height: 30, borderRadius: 10, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center', marginLeft: 'auto' },
  modalCloseText: { color: '#334155', fontSize: 23, lineHeight: 25 },
  scanButton: { alignItems: 'center', backgroundColor: '#F59E0B', borderRadius: 13, paddingVertical: 13 },
  scanButtonText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  modalOr: { color: '#64748B', fontSize: 9, fontWeight: '800', letterSpacing: 0.5, textAlign: 'center' },
  pinJoinRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  permissionHeading: { color: '#334155', fontSize: 10, fontWeight: '800', marginTop: 4, marginBottom: 6, letterSpacing: 0.4 },
  permissionRow: { minHeight: 38, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  permissionLabel: { color: '#334155', fontSize: 11, fontWeight: '700' },
  permissionAction: { color: '#B45309', fontSize: 10, fontWeight: '800' },
  permissionNote: { color: '#64748B', fontSize: 9, lineHeight: 14, marginTop: 4, marginBottom: 10 },
  pinInput: { flex: 1, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 11, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, color: '#0F172A', letterSpacing: 2 },
  joinButton: { backgroundColor: '#F59E0B', borderRadius: 11, paddingHorizontal: 18, paddingVertical: 11 },
  joinButtonDisabled: { opacity: 0.45 },
  joinText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  qrCard: { backgroundColor: '#fff', alignItems: 'center', borderRadius: 17, borderWidth: 1, borderColor: '#E2E8F0', padding: 16 },
  sessionCard: { backgroundColor: '#fff', borderRadius: 17, borderWidth: 1, borderColor: '#E2E8F0', padding: 14 },
  sessionHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  cardTitle: { color: '#334155', fontSize: 10, fontWeight: '800', letterSpacing: 0.3 },
  resetLabel: { color: '#64748B', fontSize: 9 },
  metricsRow: { flexDirection: 'row', gap: 7 },
  metric: { flex: 1, borderRadius: 12, backgroundColor: '#F8FAFC', paddingVertical: 10, alignItems: 'center' },
  metricValue: { color: '#0F172A', fontSize: 16, fontWeight: '900' },
  metricLabel: { color: '#64748B', fontSize: 9, marginTop: 3 },
  recentSection: { gap: 8 },
  emptyRecent: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 15, padding: 18 },
  mutedCenter: { color: '#64748B', fontSize: 10, textAlign: 'center' },
  transferCard: { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#E2E8F0', padding: 12 },
  transferRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  transferName: { color: '#0F172A', fontSize: 11, fontWeight: '700', flex: 1 },
  transferStatus: { color: '#047857', fontSize: 10, fontWeight: '700' },
  transferMeta: { color: '#64748B', fontSize: 9, marginTop: 4 },
  fileActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 8 },
  previewBackdrop: { flex: 1, justifyContent: 'center', backgroundColor: 'rgba(15, 23, 42, 0.62)', padding: 18 },
  categorySheet: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 22, paddingBottom: 30, gap: 12 },
  categoryTitle: { color: '#0F172A', fontSize: 19, fontWeight: '900' },
  categorySubtitle: { color: '#64748B', fontSize: 11, lineHeight: 16, marginTop: 3 },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 8 },
  categoryOption: { width: '31%', minHeight: 94, alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 15, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#F8FAFC' },
  categoryIcon: { color: '#D97706', fontSize: 26, fontWeight: '800' },
  categoryLabel: { color: '#334155', fontSize: 11, fontWeight: '800' },
  categoryFootnote: { color: '#94A3B8', fontSize: 9, lineHeight: 14 },
  incomingList: { maxHeight: 230, marginTop: 4 },
  incomingFile: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  incomingActions: { flexDirection: 'row', gap: 10, marginTop: 8 },
  declineButton: { flex: 1, alignItems: 'center', borderRadius: 12, borderWidth: 1, borderColor: '#CBD5E1', paddingVertical: 14 },
  declineText: { color: '#475569', fontSize: 12, fontWeight: '800' },
  acceptButton: { flex: 1.5, alignItems: 'center', borderRadius: 12, backgroundColor: '#F59E0B', paddingVertical: 14 },
  acceptText: { color: '#fff', fontSize: 12, fontWeight: '900' },
  previewSheet: { flex: 1, maxHeight: '92%', backgroundColor: '#fff', borderRadius: 20, overflow: 'hidden', padding: 14 },
  previewHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  previewTitle: { flex: 1, color: '#0F172A', fontSize: 14, fontWeight: '800' },
  previewClose: { color: '#B45309', fontSize: 13, fontWeight: '800', padding: 8 },
  previewImage: { flex: 1, width: '100%', marginTop: 12 },
  previewTextScroll: { flex: 1, marginTop: 12 },
  previewText: { color: '#0F172A', fontSize: 13, lineHeight: 19 },
  openFile: { color: '#B45309', fontSize: 11, fontWeight: '700', marginTop: 7 },
  code: { fontSize: 24, fontWeight: '900', letterSpacing: 5, marginBottom: 12, color: '#0F172A' },
  bar: { height: 6, backgroundColor: '#E2E8F0', borderRadius: 3, marginTop: 8, alignSelf: 'stretch' },
  fill: { height: 6, backgroundColor: '#F59E0B', borderRadius: 3 },
  floatBtn: { position: 'absolute', bottom: 50, alignSelf: 'center', backgroundColor: '#F59E0B', paddingHorizontal: 32, paddingVertical: 14, borderRadius: 14 },
  scanShade: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.58)' },
  scanTarget: { borderWidth: 3, borderColor: '#FBBF24', borderRadius: 22, backgroundColor: 'transparent' },
  scanInstructions: { position: 'absolute', top: 54, left: 20, right: 20, alignItems: 'center', backgroundColor: 'rgba(15, 23, 42, 0.88)', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11 },
  scanInstructionsText: { color: '#fff', fontSize: 13, fontWeight: '700', textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 28, fontWeight: '800', color: '#0F172A' },
  sub: { color: '#64748B', fontSize: 12, marginTop: 2 },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  label: { fontWeight: '700', color: '#0F172A', marginTop: 16, marginBottom: 6 },
  primary: { backgroundColor: '#F59E0B', borderRadius: 14, padding: 16, alignItems: 'center', marginTop: 12 },
  outline: { borderWidth: 2, borderColor: '#F59E0B', borderRadius: 14, padding: 14, alignItems: 'center' },
  outlineText: { color: '#B45309', fontWeight: '700' },
  btnText: { color: '#fff', fontWeight: '700' },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginTop: 12, borderWidth: 1, borderColor: '#E2E8F0', alignItems: 'flex-start' },
});
