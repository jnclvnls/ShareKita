/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// React Native & Expo configuration for Node.js Server connection
export const NATIVE_CONFIG = {
  // Replace with your local machine IP (e.g., 192.168.1.50) when running on physical device
  DEFAULT_HOST: '10.0.2.2', // Android emulator default loopback to host
  PORT: 3000,
  APP_SCHEME: 'sharekita',
  APP_NAME: 'ShareKita',
  VERSION: '1.0.0',
  CHUNK_SIZE_BYTES: 256 * 1024, // 256 KB native chunks
};

export function getWsServerUrl(customHost?: string): string {
  const host = customHost || NATIVE_CONFIG.DEFAULT_HOST;
  return `ws://${host}:${NATIVE_CONFIG.PORT}/ws`;
}

export function getApiBaseUrl(customHost?: string): string {
  const host = customHost || NATIVE_CONFIG.DEFAULT_HOST;
  return `http://${host}:${NATIVE_CONFIG.PORT}/api`;
}
