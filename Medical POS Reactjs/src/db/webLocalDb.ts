import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

interface MedPosWebDB extends DBSchema {
  bills: {
    key: string;
    value: {
      id: string;
      clinic_id: string;
      payload: any;
      created_at: string;
      synced: number;
    };
    indexes: { synced: number };
  };
  sync_queue: {
    key: string;
    value: {
      id: string;
      operation: string;
      payload: any;
      created_at: string;
      retry_count: number;
      synced: number;
      error?: string;
    };
    indexes: { synced: number; created_at: string };
  };
}

let dbPromise: Promise<IDBPDatabase<MedPosWebDB>> | null = null;

export function getWebDb() {
  if (!dbPromise) {
    dbPromise = openDB<MedPosWebDB>('medpos-web', 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('bills')) {
          const billsStore = db.createObjectStore('bills', { keyPath: 'id' });
          billsStore.createIndex('synced', 'synced');
        }
        if (!db.objectStoreNames.contains('sync_queue')) {
          const queueStore = db.createObjectStore('sync_queue', { keyPath: 'id' });
          queueStore.createIndex('synced', 'synced');
          queueStore.createIndex('created_at', 'created_at');
        }
      },
    });
  }
  return dbPromise;
}

export async function insertBillWeb(bill: any) {
  const db = await getWebDb();
  await db.put('bills', {
    id: bill.id,
    clinic_id: bill.clinic_id,
    payload: bill,
    created_at: new Date().toISOString(),
    synced: 0
  });
}

export async function addToWebSyncQueue(operation: string, payload: any) {
  const db = await getWebDb();
  await db.put('sync_queue', {
    id: crypto.randomUUID(),
    operation,
    payload,
    created_at: new Date().toISOString(),
    retry_count: 0,
    synced: 0
  });
}

export async function getPendingWebQueue() {
  const db = await getWebDb();
  const tx = db.transaction('sync_queue', 'readonly');
  const index = tx.store.index('created_at');
  let cursor = await index.openCursor();
  
  const pending = [];
  while (cursor) {
    if (cursor.value.synced === 0 && cursor.value.retry_count < 3) {
      pending.push(cursor.value);
    }
    cursor = await cursor.continue();
  }
  return pending;
}

export async function markWebQueueItemSynced(id: string) {
  const db = await getWebDb();
  const tx = db.transaction('sync_queue', 'readwrite');
  const store = tx.objectStore('sync_queue');
  const item = await store.get(id);
  if (item) {
    item.synced = 1;
    await store.put(item);
  }
}

export async function incrementWebQueueRetry(id: string, error: string) {
  const db = await getWebDb();
  const tx = db.transaction('sync_queue', 'readwrite');
  const store = tx.objectStore('sync_queue');
  const item = await store.get(id);
  if (item) {
    item.retry_count += 1;
    item.error = error;
    await store.put(item);
  }
}
