import * as SecureStore from 'expo-secure-store';
import type { KeyValueStorage } from './lib/session';

/** Keychain (iOS) / Keystore (Android): refresh token tidak disimpan sebagai teks biasa. */
export const secureStorage: KeyValueStorage = {
  getItem: (key) => SecureStore.getItemAsync(key),
  setItem: (key, value) => SecureStore.setItemAsync(key, value),
  removeItem: (key) => SecureStore.deleteItemAsync(key),
};
