import { getPendingWebQueue, markWebQueueItemSynced, incrementWebQueueRetry } from './webLocalDb';
import { pullDelta } from '../sync/syncEngine';
import { HydrationService } from '../state/hydration';

let isSyncing = false;
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5001/api';

export async function flushWebQueue(authToken: string) {
  if (isSyncing) return;
  isSyncing = true;

  try {
    const pendingItems = await getPendingWebQueue();
    
    for (const item of pendingItems) {
      try {
        const payload = item.payload; // Already an object since we used put()

        const response = await fetch(`${API_BASE}/bills/sync`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`
          },
          body: JSON.stringify(payload)
        });

        if (response.ok) {
          await markWebQueueItemSynced(item.id);
        } else {
          const errorData = await response.text();
          await incrementWebQueueRetry(item.id, `HTTP ${response.status}: ${errorData}`);
        }
      } catch (err: any) {
        console.error('Network error during web sync:', err);
        // On network throw: break loop immediately
        break;
      }
    }

    if (pendingItems.length > 0) {
      try {
        console.log('[WebSync] Pushing finished, pulling downstream delta...');
        await pullDelta();
        await HydrationService.hydrateInventory();
        await HydrationService.hydrateSales();
      } catch (err) {
        console.error('[WebSync] Failed to pull delta after push:', err);
      }
    }
  } finally {
    isSyncing = false;
  }
}

let activeGetToken: (() => Promise<string | null>) | null = null;

export function startWebSyncListener(getToken: () => Promise<string | null>) {
  activeGetToken = getToken;
  window.addEventListener('online', () => {
    getToken().then(token => {
      if (token) flushWebQueue(token);
    });
  });

  if (navigator.onLine) {
    getToken().then(token => {
      if (token) flushWebQueue(token);
    });
  }
}

export async function triggerWebSync() {
  if (!activeGetToken) return;
  const token = await activeGetToken();
  if (token && navigator.onLine) {
    await flushWebQueue(token);
  }
}
