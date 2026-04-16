import { useEffect } from 'react';

/** Push / local notifications are not used on web; avoid loading expo-notifications (native-only APIs). */
export async function registerForPushNotifications(): Promise<string | null> {
  return null;
}

export function useNotificationListeners(): void {
  useEffect(() => {
    /* no-op */
  }, []);
}
