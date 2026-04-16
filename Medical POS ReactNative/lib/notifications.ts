import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { useEffect, useRef } from 'react';
import { router } from 'expo-router';
import { api } from './api';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function registerForPushNotifications(): Promise<string | null> {
  if (!Device.isDevice) {
    console.warn('Push notifications only work on physical devices');
    return null;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== 'granted') {
    console.warn('Push notification permission denied');
    return null;
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('alerts', {
      name: 'Medical POS Alerts',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#00C9A7',
    });
    await Notifications.setNotificationChannelAsync('reminders', {
      name: 'Refill Reminders',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  const projectId = Constants.expoConfig?.extra?.eas?.projectId || 'development-fallback-id';
  let expoPushToken = null;
  try {
    const pushTokenData = await Notifications.getExpoPushTokenAsync({ projectId });
    expoPushToken = pushTokenData.data;
  } catch (e) {
    console.error('Error getting push token', e);
    return null;
  }

  try {
    await api.post('/devices/register', {
      expo_push_token: expoPushToken,
      platform: Platform.OS,
    });
  } catch (err) {
    console.error('Failed to register push token:', err);
  }

  return expoPushToken;
}

export function useNotificationListeners() {
  const notificationListener = useRef<Notifications.Subscription | undefined>(undefined);
  const responseListener = useRef<Notifications.Subscription | undefined>(undefined);

  useEffect(() => {
    notificationListener.current = Notifications.addNotificationReceivedListener((notification) => {
      console.log('Notification received:', notification);
    });

    responseListener.current = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data;
      if (!data) return;
      if (data.type === 'low_stock') router.push('/(app)/alerts/low-stock' as any);
      if (data.type === 'expiry') router.push('/(app)/alerts/expiry' as any);
      if (data.type === 'refill') router.push(`/(app)/customers/${data.customer_id}` as any);
      if (data.type === 'outstanding') router.push(`/(app)/customers/${data.customer_id}` as any);
    });

    return () => {
      notificationListener.current?.remove();
      responseListener.current?.remove();
    };
  }, []);
}
