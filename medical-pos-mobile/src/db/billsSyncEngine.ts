import NetInfo from '@react-native-community/netinfo';
import { getPendingQueue, markQueueItemSynced, incrementQueueRetry } from './localBillsDb';

let isSyncing = false;
let API_BASE = 'http://localhost:5000/api'; // Or import from your config

export async function flushSyncQueue(authToken: string) {
  if (isSyncing) return;
  isSyncing = true;

  try {
    const pendingItems = await getPendingQueue();
    
    for (const item of pendingItems) {
      try {
        const payload = JSON.parse(item.payload as string);
        
        const response = await fetch(`${API_BASE}/bills/sync`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`
          },
          body: JSON.stringify(payload)
        });

        if (response.ok) {
          await markQueueItemSynced(item.id as string);
          // Assuming there's a markBillSynced but prompt didn't specify it in the db exports, 
          // we only need to mark queue item synced as per the prompt instructions.
        } else {
          const errorData = await response.text();
          await incrementQueueRetry(item.id as string, `HTTP ${response.status}: ${errorData}`);
        }
      } catch (err: any) {
        console.error('Network error during sync:', err);
        // On network throw: break loop immediately (will retry on next reconnect)
        break;
      }
    }
  } finally {
    isSyncing = false;
  }
}

export function startSyncListener(getToken: () => Promise<string | null>) {
  NetInfo.addEventListener(state => {
    if (state.isConnected && state.isInternetReachable) {
      getToken().then(token => {
        if (token) flushSyncQueue(token);
      });
    }
  });

  // Also call immediately
  getToken().then(token => {
    if (token) flushSyncQueue(token);
  });
}
