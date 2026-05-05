import { apiClient } from './client';
import { localMutate } from '../lib/localMutate';

/* ─── API ───────────────────────────────────────────── */

/** POST /devices/register — body matches Medical POS Backend routes/devices.ts */
export const devicesApi = {
  registerDevice: async (expoPushToken: string, platform: string): Promise<void> => {
    await localMutate({ table: 'device_tokens', operation: 'INSERT', data: {
      expo_push_token: expoPushToken,
      platform,
    } });
  },
} as const;
