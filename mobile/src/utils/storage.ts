/**
 * MMKV Storage with lazy initialization and in-memory fallback.
 *
 * MMKV is initialized on first access (not at import time) so that a
 * NitroModules native-load failure doesn't crash the entire app before
 * any JS error-handling can run.
 */

let storage: any = null;
let mmkvInitAttempted = false;

function getMMKVStorage(): any {
  if (mmkvInitAttempted) return storage;
  mmkvInitAttempted = true;
  try {
    const { createMMKV } = require('react-native-mmkv');
    const mmkv = createMMKV({ id: 'medpos-storage' });
    // Smoke-test: verify native bridge actually works
    mmkv.set('__init_check__', 'ok');
    mmkv.remove('__init_check__');
    storage = mmkv;
  } catch (e) {
    console.warn('[storage] MMKV unavailable, falling back to in-memory store:', e);
    storage = null;
  }
  return storage;
}

// In-memory fallback map
const memoryStore = new Map<string, string>();

export const store = {
  getString: (key: string): string | undefined => {
    const s = getMMKVStorage();
    return s ? s.getString(key) : memoryStore.get(key);
  },
  set: (key: string, value: string): void => {
    const s = getMMKVStorage();
    s ? s.set(key, value) : memoryStore.set(key, value);
  },
  delete: (key: string): void => {
    const s = getMMKVStorage();
    s ? s.remove(key) : memoryStore.delete(key);
  },
  contains: (key: string): boolean => {
    const s = getMMKVStorage();
    return s ? s.contains(key) : memoryStore.has(key);
  },
};
