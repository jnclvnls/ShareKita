/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  StatusBar,
  Animated,
  Platform,
  Alert,
  Dimensions,
  FlatList,
} from 'react-native';
import { NATIVE_CONFIG, getWsServerUrl } from './config';

interface NativePeer {
  id: string;
  name: string;
  deviceType: 'phone' | 'laptop' | 'tablet';
  os: 'Android' | 'iOS';
  avatar: string;
  labLocation: string;
  signalStrength: number;
}

interface NativeFile {
  id: string;
  name: string;
  size: number;
  category: 'documents' | 'photos' | 'videos' | 'apps';
}

const SAMPLE_NATIVE_FILES: NativeFile[] = [
  { id: 'f-1', name: 'Physics_Lab_Oscilloscope_Data.csv', size: 14200000, category: 'documents' },
  { id: 'f-2', name: 'Robotics_Team_Circuit_Schematic.pdf', size: 28500000, category: 'documents' },
  { id: 'f-3', name: 'Campus_Drone_Flight_Test.mp4', size: 94800000, category: 'videos' },
  { id: 'f-4', name: 'Microcontroller_Firmware_v2.bin', size: 4500000, category: 'apps' },
];

export default function NativeApp() {
  const [currentScreen, setCurrentScreen] = useState<'home' | 'radar' | 'picker' | 'transfer'>('home');
  const [transferMode, setTransferMode] = useState<'send' | 'receive'>('send');
  const [selectedFileIds, setSelectedFileIds] = useState<string[]>(['f-1', 'f-2']);
  const [connectedPeers, setConnectedPeers] = useState<NativePeer[]>([]);
  const [activePeer, setActivePeer] = useState<NativePeer | null>(null);
  const [transferProgress, setTransferProgress] = useState(0);
  const [transferSpeedMBps, setTransferSpeedMBps] = useState(14.8);
  const [wsConnected, setWsConnected] = useState(false);

  // Radar Animation
  const pulseAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.timing(pulseAnim, {
        toValue: 1,
        duration: 2500,
        useNativeDriver: true,
      })
    ).start();
  }, [pulseAnim]);

  // Connect to Node.js WebSocket Server
  useEffect(() => {
    let ws: WebSocket | null = null;
    try {
      const url = getWsServerUrl();
      ws = new WebSocket(url);
      ws.onopen = () => {
        setWsConnected(true);
        ws?.send(
          JSON.stringify({
            type: 'register',
            device: {
              id: 'native-' + Math.random().toString(36).substring(2, 8),
              name: Platform.OS === 'ios' ? 'iPhone 16 Pro (Native)' : 'Redmi Note 13 (Native)',
              deviceType: 'phone',
              os: Platform.OS === 'ios' ? 'iOS' : 'Android',
              avatar: Platform.OS === 'ios' ? '🍎' : '🤖',
              labLocation: 'Lab 402 - Robotics',
            },
          })
        );
      };

      ws.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data.type === 'registered' || data.type === 'peer-joined') {
            if (data.peers) setConnectedPeers(data.peers);
          }
        } catch {}
      };

      ws.onerror = () => setWsConnected(false);
      ws.onclose = () => setWsConnected(false);
    } catch {}

    return () => {
      ws?.close();
    };
  }, []);

  const handleStartSend = () => {
    setTransferMode('send');
    setCurrentScreen('picker');
  };

  const handleStartReceive = () => {
    setTransferMode('receive');
    setCurrentScreen('radar');
  };

  const handleSelectPeer = (peer: NativePeer) => {
    setActivePeer(peer);
    setTransferProgress(0);
    setCurrentScreen('transfer');

    // Simulate native chunk transfer
    const interval = setInterval(() => {
      setTransferProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          Alert.alert('Transfer Complete', `Files successfully sent to ${peer.name}`);
          return 100;
        }
        return prev + 5;
      });
    }, 200);
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />

      {/* Top Native Header */}
      <View style={styles.header}>
        <View style={styles.logoRow}>
          <View style={styles.logoBadge}>
            <Text style={styles.logoIconText}>⚡</Text>
          </View>
          <View>
            <Text style={styles.appName}>
              Share<Text style={styles.appNameAccent}>Kita</Text>
            </Text>
            <Text style={styles.appSubtext}>Campus P2P · Node.js Node</Text>
          </View>
        </View>

        <View style={[styles.statusBadge, wsConnected ? styles.statusOnline : styles.statusOffline]}>
          <Text style={styles.statusText}>{wsConnected ? 'Node.js Active' : 'Mesh Ready'}</Text>
        </View>
      </View>

      {/* Screen Routing */}
      {currentScreen === 'home' && (
        <ScrollView style={styles.content} contentContainerStyle={styles.scrollContent}>
          {/* Identity Card */}
          <View style={styles.identityCard}>
            <View style={styles.avatarBox}>
              <Text style={{ fontSize: 26 }}>📱</Text>
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.deviceName}>Expo Native Device</Text>
              <Text style={styles.deviceLocation}>CS Lab 402 · Air-Gapped Wi-Fi</Text>
            </View>
          </View>

          {/* SHAREit Signature Big Action Buttons */}
          <View style={styles.actionGrid}>
            <TouchableOpacity style={styles.sendButton} activeOpacity={0.85} onPress={handleStartSend}>
              <View style={styles.actionIconContainer}>
                <Text style={styles.actionArrow}>↗</Text>
              </View>
              <View>
                <Text style={styles.sendButtonText}>SEND</Text>
                <Text style={styles.buttonSubtext}>Documents, Videos & Code</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity style={styles.receiveButton} activeOpacity={0.85} onPress={handleStartReceive}>
              <View style={styles.actionIconContainerReceive}>
                <Text style={styles.actionArrowReceive}>↙</Text>
              </View>
              <View>
                <Text style={styles.receiveButtonText}>RECEIVE</Text>
                <Text style={styles.buttonSubtextDark}>Listen for Lab Senders</Text>
              </View>
            </TouchableOpacity>
          </View>

          {/* EAS Build Terminal Info Banner */}
          <View style={styles.easCard}>
            <Text style={styles.easTitle}>🚀 Expo & EAS Build Ready</Text>
            <Text style={styles.easDescription}>
              This app is fully prepared for EAS Build in terminal:
            </Text>
            <View style={styles.codeSnippet}>
              <Text style={styles.codeText}>eas build -p android --profile preview</Text>
            </View>
          </View>

          {/* Files Ready for Transfer */}
          <Text style={styles.sectionHeader}>Campus Storage Files</Text>
          {SAMPLE_NATIVE_FILES.map((file) => (
            <View key={file.id} style={styles.fileRow}>
              <View style={styles.fileIconBox}>
                <Text>📄</Text>
              </View>
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={styles.fileName} numberOfLines={1}>
                  {file.name}
                </Text>
                <Text style={styles.fileMeta}>{(file.size / (1024 * 1024)).toFixed(1)} MB</Text>
              </View>
            </View>
          ))}
        </ScrollView>
      )}

      {currentScreen === 'picker' && (
        <View style={styles.pickerContainer}>
          <Text style={styles.sectionHeader}>Select Files to Send</Text>
          <FlatList
            data={SAMPLE_NATIVE_FILES}
            keyExtractor={(item: NativeFile) => item.id}
            renderItem={({ item }: { item: NativeFile }) => {
              const selected = selectedFileIds.includes(item.id);
              return (
                <TouchableOpacity
                  style={[styles.pickerItem, selected && styles.pickerItemSelected]}
                  onPress={() => {
                    setSelectedFileIds((prev) =>
                      prev.includes(item.id) ? prev.filter((id) => id !== item.id) : [...prev, item.id]
                    );
                  }}
                >
                  <Text style={styles.fileName}>{item.name}</Text>
                  <Text style={styles.fileMeta}>{(item.size / 1024 / 1024).toFixed(1)} MB</Text>
                </TouchableOpacity>
              );
            }}
          />
          <TouchableOpacity style={styles.confirmSendButton} onPress={() => setCurrentScreen('radar')}>
            <Text style={styles.confirmSendText}>Proceed to Radar ({selectedFileIds.length} files)</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.backButton} onPress={() => setCurrentScreen('home')}>
            <Text style={styles.backButtonText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      )}

      {currentScreen === 'radar' && (
        <View style={styles.radarContainer}>
          <Text style={styles.radarTitle}>
            {transferMode === 'send' ? 'Scanning for Nearby Devices' : 'Listening on Campus Mesh'}
          </Text>
          <View style={styles.radarCircle}>
            <Text style={{ fontSize: 40 }}>📱</Text>
          </View>

          <Text style={styles.radarSub}>Tap a device to initiate high-speed transfer:</Text>
          <TouchableOpacity
            style={styles.peerCard}
            onPress={() =>
              handleSelectPeer({
                id: 'peer-p1',
                name: 'Lab M3 Laptop (Prof. Reyes)',
                deviceType: 'laptop',
                os: 'Android',
                avatar: '💻',
                labLocation: 'Lab 402',
                signalStrength: 95,
              })
            }
          >
            <Text style={{ fontSize: 24, marginRight: 10 }}>💻</Text>
            <View>
              <Text style={styles.peerName}>Lab M3 Laptop (Prof. Reyes)</Text>
              <Text style={styles.peerDist}>2.1 meters away · 95% Signal</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={styles.backButton} onPress={() => setCurrentScreen('home')}>
            <Text style={styles.backButtonText}>Back to Home</Text>
          </TouchableOpacity>
        </View>
      )}

      {currentScreen === 'transfer' && (
        <View style={styles.transferContainer}>
          <Text style={styles.transferTitle}>Transferring to {activePeer?.name}</Text>
          <View style={styles.progressBarBg}>
            <View style={[styles.progressBarFill, { width: `${transferProgress}%` }]} />
          </View>
          <Text style={styles.progressText}>{transferProgress}% Transferred</Text>
          <Text style={styles.speedText}>{transferSpeedMBps} MB/s · Local P2P Wi-Fi</Text>

          <TouchableOpacity
            style={styles.cancelButton}
            onPress={() => {
              setCurrentScreen('home');
            }}
          >
            <Text style={styles.cancelButtonText}>Done</Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logoBadge: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: '#F59E0B',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  logoIconText: {
    fontSize: 20,
    color: '#0F172A',
  },
  appName: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  appNameAccent: {
    color: '#F59E0B',
  },
  appSubtext: {
    fontSize: 11,
    color: '#64748B',
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusOnline: {
    backgroundColor: '#DEF7EC',
  },
  statusOffline: {
    backgroundColor: '#FEF3C7',
  },
  statusText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#046C4E',
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  identityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 16,
  },
  avatarBox: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#FEF3C7',
    justifyContent: 'center',
    alignItems: 'center',
  },
  deviceName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  deviceLocation: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  actionGrid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 18,
  },
  sendButton: {
    flex: 1,
    backgroundColor: '#F59E0B',
    borderRadius: 24,
    padding: 18,
    height: 150,
    justifyContent: 'space-between',
  },
  receiveButton: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#FCD34D',
    borderRadius: 24,
    padding: 18,
    height: 150,
    justifyContent: 'space-between',
  },
  actionIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(15, 23, 42, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionArrow: {
    fontSize: 22,
    fontWeight: '900',
    color: '#0F172A',
  },
  actionIconContainerReceive: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#FEF3C7',
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionArrowReceive: {
    fontSize: 22,
    fontWeight: '900',
    color: '#D97706',
  },
  sendButtonText: {
    fontSize: 22,
    fontWeight: '900',
    color: '#0F172A',
  },
  receiveButtonText: {
    fontSize: 22,
    fontWeight: '900',
    color: '#0F172A',
  },
  buttonSubtext: {
    fontSize: 11,
    color: '#334155',
    marginTop: 2,
  },
  buttonSubtextDark: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  easCard: {
    backgroundColor: '#1E293B',
    borderRadius: 18,
    padding: 16,
    marginBottom: 20,
  },
  easTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  easDescription: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 4,
  },
  codeSnippet: {
    backgroundColor: '#0F172A',
    padding: 10,
    borderRadius: 10,
    marginTop: 10,
  },
  codeText: {
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    color: '#FCD34D',
    fontSize: 12,
  },
  sectionHeader: {
    fontSize: 13,
    fontWeight: '800',
    color: '#475569',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 8,
  },
  fileIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fileName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0F172A',
  },
  fileMeta: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  pickerContainer: {
    flex: 1,
    padding: 16,
  },
  pickerItem: {
    backgroundColor: '#FFFFFF',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 8,
  },
  pickerItemSelected: {
    borderColor: '#F59E0B',
    backgroundColor: '#FFFBEB',
  },
  confirmSendButton: {
    backgroundColor: '#F59E0B',
    padding: 16,
    borderRadius: 16,
    alignItems: 'center',
    marginTop: 10,
  },
  confirmSendText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  backButton: {
    padding: 14,
    alignItems: 'center',
  },
  backButtonText: {
    color: '#64748B',
    fontWeight: '600',
  },
  radarContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#0F172A',
  },
  radarTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#F8FAFC',
    marginBottom: 30,
  },
  radarCircle: {
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 2,
    borderColor: '#F59E0B',
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 30,
  },
  radarSub: {
    fontSize: 13,
    color: '#94A3B8',
    marginBottom: 16,
  },
  peerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    padding: 14,
    borderRadius: 16,
    width: '100%',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#F59E0B',
  },
  peerName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  peerDist: {
    fontSize: 12,
    color: '#FCD34D',
    marginTop: 2,
  },
  transferContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  transferTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 24,
    textAlign: 'center',
  },
  progressBarBg: {
    width: '100%',
    height: 16,
    backgroundColor: '#E2E8F0',
    borderRadius: 8,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#F59E0B',
  },
  progressText: {
    fontSize: 20,
    fontWeight: '900',
    color: '#0F172A',
    marginTop: 14,
  },
  speedText: {
    fontSize: 13,
    color: '#059669',
    fontWeight: '700',
    marginTop: 4,
  },
  cancelButton: {
    marginTop: 30,
    backgroundColor: '#0F172A',
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 14,
  },
  cancelButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
});
