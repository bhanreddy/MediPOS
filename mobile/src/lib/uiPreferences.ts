import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

export type UIPreferences = { isDark: boolean; glassMode: 'adaptive' | 'lightweight' };
const KEY = 'nexsyrus_ui_preferences_v1';

/** Appearance must also survive restarts when the optional MMKV bridge is unavailable. */
export async function readUIPreferences(): Promise<UIPreferences | null> {
  const raw = Platform.OS === 'web' ? globalThis.localStorage?.getItem(KEY) : await SecureStore.getItemAsync(KEY);
  if (!raw) return null;
  const value = JSON.parse(raw);
  if (typeof value?.isDark !== 'boolean' || !['adaptive', 'lightweight'].includes(value.glassMode)) return null;
  return { isDark: value.isDark, glassMode: value.glassMode };
}

export async function writeUIPreferences(value: UIPreferences): Promise<void> {
  const raw = JSON.stringify(value);
  if (Platform.OS === 'web') globalThis.localStorage?.setItem(KEY, raw);
  else await SecureStore.setItemAsync(KEY, raw);
}
