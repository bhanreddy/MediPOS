interface StorageAdapter {
  set: (key: string, value: string | boolean | number) => void;
  getString: (key: string) => string | undefined;
  getBoolean: (key: string) => boolean | undefined;
  getNumber: (key: string) => number | undefined;
  delete: (key: string) => void;
  contains: (key: string) => boolean;
  clearAll: () => void;
}

function createFallbackStorage(): StorageAdapter {
  const map = new Map<string, string | boolean | number>();
  return {
    set: (key, value) => map.set(key, value),
    getString: (key) => {
      const v = map.get(key);
      return typeof v === 'string' ? v : undefined;
    },
    getBoolean: (key) => {
      const v = map.get(key);
      return typeof v === 'boolean' ? v : undefined;
    },
    getNumber: (key) => {
      const v = map.get(key);
      return typeof v === 'number' ? v : undefined;
    },
    delete: (key) => { map.delete(key); },
    contains: (key) => map.has(key),
    clearAll: () => map.clear(),
  };
}

function createStorage(): StorageAdapter {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { MMKV } = require('react-native-mmkv');
    const instance = new MMKV({ id: 'medical-pos-storage' });
    return instance as StorageAdapter;
  } catch {
    console.warn(
      '[storage] NitroModules/MMKV not available — using in-memory fallback (Expo Go).',
    );
    return createFallbackStorage();
  }
}

export const storage = createStorage();

export function getStorageString(key: string): string | undefined {
  return storage.getString(key);
}

export function setStorageString(key: string, value: string): void {
  storage.set(key, value);
}

export function getStorageBoolean(key: string): boolean | undefined {
  return storage.getBoolean(key);
}

export function setStorageBoolean(key: string, value: boolean): void {
  storage.set(key, value);
}

export function deleteStorageKey(key: string): void {
  storage.delete(key);
}
