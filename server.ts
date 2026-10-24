/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express, { Request, Response } from 'express';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import os from 'os';
import JSZip from 'jszip';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface ConnectedPeer {
  id: string;
  name: string;
  deviceType: 'phone' | 'laptop' | 'tablet' | 'desktop';
  os: 'iOS' | 'Android' | 'macOS' | 'Windows' | 'Linux';
  avatar: string;
  labLocation: string;
  signalStrength: number;
  ipAddress: string;
  ws: WebSocket;
  lastSeen: number;
  isOnline: boolean;
}

const activePeers = new Map<string, ConnectedPeer>();

function getLocalIpAddresses(): string[] {
  const interfaces = os.networkInterfaces();
  const addresses: string[] = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        addresses.push(iface.address);
      }
    }
  }
  return addresses;
}

async function startServer() {
  const app = express();
  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // CORS headers for local LAN device discovery and Expo Go mobile clients
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    if (req.method === 'OPTIONS') {
      res.sendStatus(200);
      return;
    }
    next();
  });

  // REST API Routes
  app.get('/api/health', (req: Request, res: Response) => {
    res.json({
      status: 'online',
      service: 'ShareKita P2P Signaling & Mobile Relay Node',
      runtime: `Node.js ${process.version}`,
      uptimeSeconds: Math.floor(process.uptime()),
      connectedPeersCount: activePeers.size,
      localIps: getLocalIpAddresses(),
      timestamp: Date.now(),
    });
  });

  app.get('/api/status', (req: Request, res: Response) => {
    const peersList = Array.from(activePeers.values()).map(p => ({
      id: p.id,
      name: p.name,
      deviceType: p.deviceType,
      os: p.os,
      avatar: p.avatar,
      labLocation: p.labLocation,
      signalStrength: p.signalStrength,
      ipAddress: p.ipAddress,
      isOnline: p.isOnline,
      lastSeen: p.lastSeen,
    }));

    res.json({
      server: {
        status: 'online',
        port: 3000,
        nodeVersion: process.version,
        platform: process.platform,
        uptime: Math.floor(process.uptime()),
      },
      network: {
        localIps: getLocalIpAddresses(),
        wsEndpoint: '/ws',
      },
      peers: {
        total: peersList.length,
        list: peersList,
      },
      expo: {
        appSlug: 'sharekita-nearby-transfer',
        bundleId: 'com.sharekita.app',
        package: 'com.sharekita.app',
        easConfigured: true,
      }
    });
  });

  app.get('/api/peers', (req: Request, res: Response) => {
    const peers = Array.from(activePeers.values()).map(p => ({
      id: p.id,
      name: p.name,
      deviceType: p.deviceType,
      os: p.os,
      avatar: p.avatar,
      labLocation: p.labLocation,
      signalStrength: p.signalStrength,
      ipAddress: p.ipAddress,
      isOnline: p.isOnline,
      distanceDesc: 'Local Wi-Fi Network',
    }));
    res.json({ peers });
  });

  app.get('/api/expo-config', (req: Request, res: Response) => {
    try {
      const appJsonPath = path.resolve(__dirname, 'app.json');
      const easJsonPath = path.resolve(__dirname, 'eas.json');
      
      const appJson = fs.existsSync(appJsonPath) 
        ? JSON.parse(fs.readFileSync(appJsonPath, 'utf8'))
        : null;
        
      const easJson = fs.existsSync(easJsonPath)
        ? JSON.parse(fs.readFileSync(easJsonPath, 'utf8'))
        : null;

      res.json({
        appJson,
        easJson,
        commands: {
          installEas: 'npm install -g eas-cli',
          loginEas: 'eas login',
          buildAndroidApk: 'eas build -p android --profile preview',
          buildAndroidBundle: 'eas build -p android --profile production',
          buildIosPreview: 'eas build -p ios --profile preview',
          runExpoDev: 'npx expo start --tunnel',
        }
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Dynamic project export (.ZIP) for instant local Expo EAS building
  app.get('/api/export-project', async (req: Request, res: Response) => {
    try {
      const zip = new JSZip();

      // Read key project files to package
      const filesToInclude = [
        'app.json',
        'eas.json',
        'metro.config.js',
        'babel.config.js',
        'index.js',
        'package.json',
        'tsconfig.json',
        'server.ts',
        'README_EXPO.md',
        '.npmrc',
      ];

      for (const fileName of filesToInclude) {
        const filePath = path.resolve(__dirname, fileName);
        if (fs.existsSync(filePath)) {
          zip.file(fileName, fs.readFileSync(filePath, 'utf8'));
        }
      }

      // Add src/native directory files if existing
      const nativeDir = path.resolve(__dirname, 'src', 'native');
      if (fs.existsSync(nativeDir)) {
        const nativeFiles = fs.readdirSync(nativeDir);
        for (const file of nativeFiles) {
          const fullPath = path.join(nativeDir, file);
          if (fs.statSync(fullPath).isFile()) {
            zip.file(`src/native/${file}`, fs.readFileSync(fullPath, 'utf8'));
          }
        }
      }

      const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', 'attachment; filename="sharekita-react-native-expo.zip"');
      res.send(zipBuffer);
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to generate zip: ' + err.message });
    }
  });

  // Echo endpoint for real-time speed benchmark
  app.post('/api/speedtest', (req: Request, res: Response) => {
    res.json({
      receivedBytes: req.body ? JSON.stringify(req.body).length : 0,
      timestamp: Date.now(),
    });
  });

  // WebSocket Server for Live Peer Mesh & WebRTC Signaling
  wss.on('connection', (ws: WebSocket, req) => {
    const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.socket.remoteAddress || '127.0.0.1';
    let peerId: string | null = null;

    ws.on('message', (data: string) => {
      try {
        const message = JSON.parse(data.toString());

        switch (message.type) {
          case 'register': {
            peerId = message.device?.id ? String(message.device.id) : `dev-${Math.random().toString(36).slice(2, 9)}`;
            const peerData: ConnectedPeer = {
              id: peerId,
              name: message.device?.name || 'Anonymous Student',
              deviceType: message.device?.deviceType || 'phone',
              os: message.device?.os || 'Android',
              avatar: message.device?.avatar || '📱',
              labLocation: message.device?.labLocation || 'Campus Lab',
              signalStrength: Math.floor(80 + Math.random() * 20),
              ipAddress: clientIp,
              ws,
              lastSeen: Date.now(),
              isOnline: true,
            };

            activePeers.set(peerId, peerData);

            // Send registration confirmation + current peer list
            const currentPeersList = Array.from(activePeers.values())
              .filter(p => p.id !== peerId)
              .map(p => ({
                id: p.id,
                name: p.name,
                deviceType: p.deviceType,
                os: p.os,
                avatar: p.avatar,
                labLocation: p.labLocation,
                signalStrength: p.signalStrength,
                distanceDesc: 'Connected via Node.js Mesh',
                isOnline: true,
              }));

            ws.send(JSON.stringify({
              type: 'registered',
              peerId,
              peers: currentPeersList,
            }));

            // Broadcast peer-joined to all other peers
            const joinBroadcast = JSON.stringify({
              type: 'peer-joined',
              peer: {
                id: peerData.id,
                name: peerData.name,
                deviceType: peerData.deviceType,
                os: peerData.os,
                avatar: peerData.avatar,
                labLocation: peerData.labLocation,
                signalStrength: peerData.signalStrength,
                distanceDesc: 'Just connected',
                isOnline: true,
              }
            });

            activePeers.forEach((p) => {
              if (p.id !== peerId && p.ws.readyState === WebSocket.OPEN) {
                p.ws.send(joinBroadcast);
              }
            });
            break;
          }

          case 'ping': {
            if (peerId && activePeers.has(peerId)) {
              activePeers.get(peerId)!.lastSeen = Date.now();
            }
            ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
            break;
          }

          case 'signal':
          case 'transfer-request':
          case 'transfer-response':
          case 'transfer-chunk':
          case 'transfer-ack':
          case 'transfer-pause':
          case 'transfer-resume':
          case 'transfer-complete': {
            // Route message directly to target peer
            const targetId = message.targetPeerId;
            if (targetId && activePeers.has(targetId)) {
              const target = activePeers.get(targetId)!;
              if (target.ws.readyState === WebSocket.OPEN) {
                target.ws.send(JSON.stringify({
                  ...message,
                  fromPeerId: peerId,
                }));
              }
            }
            break;
          }
        }
      } catch (err) {
        console.error('WebSocket message parsing error:', err);
      }
    });

    ws.on('close', () => {
      if (peerId && activePeers.has(peerId)) {
        activePeers.delete(peerId);

        // Notify remaining peers
        const leaveBroadcast = JSON.stringify({
          type: 'peer-left',
          peerId,
        });

        activePeers.forEach((p) => {
          if (p.ws.readyState === WebSocket.OPEN) {
            p.ws.send(leaveBroadcast);
          }
        });
      }
    });

    ws.on('error', (err) => {
      console.error('WebSocket connection error:', err);
    });
  });

  // Periodic heartbeat cleanup for stale peers
  setInterval(() => {
    const now = Date.now();
    activePeers.forEach((peer, id) => {
      if (now - peer.lastSeen > 60000) {
        try {
          peer.ws.terminate();
        } catch {}
        activePeers.delete(id);
      }
    });
  }, 30000);

  // Vite middleware in dev or static files in production
  const isProduction = process.env.NODE_ENV === 'production';
  if (!isProduction) {
    const vite = await import('vite').then((m) =>
      m.createServer({
        server: { middlewareMode: true },
        appType: 'spa',
      })
    );
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  const PORT = Number(process.env.PORT) || 3000;
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 ShareKita Node.js + WebSocket Server listening on http://0.0.0.0:${PORT}`);
    console.log(`📱 Expo & EAS Build backend ready. Local IP addresses: ${getLocalIpAddresses().join(', ')}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
