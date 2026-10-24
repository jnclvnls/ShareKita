/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Real device-to-device pairing and transfer.
 *
 * Two devices find each other using a 6-digit PIN. The PIN is turned into a
 * PeerJS id; the free public PeerJS broker is used ONLY for the WebRTC
 * handshake. The files themselves flow directly between the two devices over
 * an encrypted (DTLS) WebRTC data channel.
 */

import Peer, { DataConnection } from 'peerjs';

const ID_PREFIX = 'sharekita-pin-';
export const CHUNK_SIZE = 64 * 1024;

export interface PeerProfile {
  name: string;
  avatar: string;
  deviceType: string;
  os: string;
}

export interface ManifestFile {
  id: string;
  name: string;
  size: number;
  type: string;
}

export type WireMessage =
  | { t: 'hello'; profile: PeerProfile }
  | { t: 'manifest'; files: ManifestFile[]; totalBytes: number }
  | { t: 'accept' }
  | { t: 'decline' }
  | { t: 'file-start'; id: string }
  | { t: 'chunk'; id: string; data: ArrayBuffer | Uint8Array }
  | { t: 'file-end'; id: string }
  | { t: 'all-done' }
  | { t: 'received-all' }
  | { t: 'cancel' };

export function generatePin(): string {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return String(100000 + (buf[0] % 900000));
}

export function isValidPin(pin: string): boolean {
  return /^\d{6}$/.test(pin);
}

/** Accepts a bare PIN or a ShareKita link containing ?pin=123456 */
export function parsePin(text: string): string | null {
  const trimmed = text.trim();
  if (isValidPin(trimmed)) return trimmed;
  try {
    const pin = new URL(trimmed).searchParams.get('pin');
    if (pin && isValidPin(pin)) return pin;
  } catch {
    // not a URL
  }
  return null;
}

export function buildPairingLink(pin: string): string {
  return `${window.location.origin}${window.location.pathname}?pin=${pin}`;
}

const idForPin = (pin: string) => ID_PREFIX + pin;

/** Wraps a data connection and queues messages until a handler is attached. */
export class Link {
  private handler: ((msg: WireMessage) => void) | null = null;
  private queue: WireMessage[] = [];
  closed = false;
  onClose: (() => void) | null = null;

  constructor(public conn: DataConnection, private peer: Peer) {
    conn.on('data', (d) => {
      const msg = d as WireMessage;
      if (this.handler) this.handler(msg);
      else this.queue.push(msg);
    });
    const markClosed = () => {
      if (this.closed) return;
      this.closed = true;
      this.onClose?.();
    };
    conn.on('close', markClosed);
    conn.on('error', markClosed);
  }

  setHandler(handler: ((msg: WireMessage) => void) | null) {
    this.handler = handler;
    if (handler) {
      const pending = this.queue;
      this.queue = [];
      pending.forEach(handler);
    }
  }

  send(msg: WireMessage) {
    if (!this.closed) this.conn.send(msg);
  }

  /** Bytes still waiting to leave this device. */
  get pendingBytes(): number {
    const dc = this.conn.dataChannel;
    return (dc?.bufferedAmount ?? 0) + ((this.conn as any).bufferSize ?? 0) * 16384;
  }

  destroy() {
    this.closed = true;
    this.handler = null;
    this.onClose = null;
    try {
      this.conn.close();
    } catch {
      // ignore
    }
    try {
      this.peer.destroy();
    } catch {
      // ignore
    }
  }
}

export interface HostState {
  state: 'starting' | 'ready' | 'error';
  pin?: string;
  error?: string;
}

export interface HostController {
  destroy: () => void;
  /** Hand the underlying peer over to a Link (do not destroy on unmount). */
  restart: () => void;
}

/** Start listening for a sender on a fresh PIN. */
export function openHost(
  onIncoming: (link: Link) => void,
  onState: (state: HostState) => void
): HostController {
  let peer: Peer | null = null;
  let destroyed = false;
  let busy = false;
  let attempts = 0;

  const start = () => {
    if (destroyed) return;
    const pin = generatePin();
    onState({ state: 'starting' });
    const p = new Peer(idForPin(pin));
    peer = p;

    p.on('open', () => {
      if (!destroyed) onState({ state: 'ready', pin });
    });

    p.on('connection', (conn) => {
      if (busy) {
        conn.on('open', () => conn.close());
        return;
      }
      busy = true;
      conn.on('open', () => {
        const link = new Link(conn, p);
        const prev = link.onClose;
        link.onClose = () => {
          busy = false;
          prev?.();
        };
        onIncoming(link);
      });
      conn.on('close', () => {
        busy = false;
      });
    });

    p.on('disconnected', () => {
      if (!destroyed && !p.destroyed) {
        try {
          p.reconnect();
        } catch {
          // ignore
        }
      }
    });

    p.on('error', (err) => {
      if (destroyed) return;
      if (err.type === 'unavailable-id' && attempts < 5) {
        attempts += 1;
        try {
          p.destroy();
        } catch {
          // ignore
        }
        start();
        return;
      }
      if (err.type === 'peer-unavailable') return;
      onState({
        state: 'error',
        error:
          err.type === 'network' || err.type === 'server-error' || err.type === 'socket-error'
            ? 'Could not reach the pairing service. Check your internet connection.'
            : err.message || 'Something went wrong while starting.',
      });
    });
  };

  start();

  return {
    destroy: () => {
      destroyed = true;
      try {
        peer?.destroy();
      } catch {
        // ignore
      }
    },
    restart: () => {
      attempts = 0;
      try {
        peer?.destroy();
      } catch {
        // ignore
      }
      busy = false;
      start();
    },
  };
}

/** Connect to a device that is showing the given PIN. */
export function joinPin(pin: string, timeoutMs = 15000): Promise<{ link: Link; cancel: () => void }> {
  return new Promise((resolve, reject) => {
    const peer = new Peer();
    let settled = false;

    const fail = (message: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        peer.destroy();
      } catch {
        // ignore
      }
      reject(new Error(message));
    };

    const timer = setTimeout(
      () => fail('Could not connect. Make sure the other device is on the Receive screen and try again.'),
      timeoutMs
    );

    peer.on('error', (err) => {
      if (err.type === 'peer-unavailable') {
        fail('No device is waiting with that PIN. Check the PIN and make sure the receiver has the Receive screen open.');
      } else if (err.type === 'network' || err.type === 'server-error' || err.type === 'socket-error') {
        fail('Could not reach the pairing service. Check your internet connection.');
      } else {
        fail(err.message || 'Connection failed.');
      }
    });

    peer.on('open', () => {
      const conn = peer.connect(idForPin(pin), { reliable: true, serialization: 'binary' });
      conn.on('open', () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({
          link: new Link(conn, peer),
          cancel: () => {
            try {
              peer.destroy();
            } catch {
              // ignore
            }
          },
        });
      });
      conn.on('error', (e) => fail(e.message || 'Connection failed.'));
    });
  });
}
