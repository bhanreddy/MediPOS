import { LogBox } from 'react-native';
import { Redirect } from 'expo-router';

// Suppress known non-critical warnings in Expo Go
LogBox.ignoreLogs([
  '[Reanimated] Property "transform"',
  '[storage] NitroModules/MMKV',
]);

/**
 * Root index — immediately redirect into the auth flow.
 * The splash screen lives at /(auth)/splash and handles
 * the animated launch + token-based routing.
 */
export default function RootIndex() {
  return <Redirect href="/(auth)/splash" />;
}
