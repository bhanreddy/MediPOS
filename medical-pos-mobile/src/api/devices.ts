import { apiClient } from './client';

/* ─── API ───────────────────────────────────────────── */

/** POST /devices/register — body matches Medical POS Backend routes/devices.ts */
export const devicesApi = {
  registerDevice: async (expoPushToken: string, platform: string): Promise<void> => {
    await apiClient.post('/devices/register', {
      expo_push_token: expoPushToken,
      platform,
    });
  },
} as const;
