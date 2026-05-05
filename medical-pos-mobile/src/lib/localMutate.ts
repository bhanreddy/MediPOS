import * as Crypto from 'expo-crypto';
import { getLocalDb } from './db';

type Operation = 'INSERT' | 'UPDATE' | 'DELETE';

interface MutateOptions {
  table: string;
  operation: Operation;
  data: Record<string, any>;
}

export async function localMutate({ table, operation, data }: MutateOptions) {
  const db = getLocalDb();
  const localId: string = data._local_id ?? (await Crypto.randomUUID());
  const now = new Date().toISOString();
  const record = { ...data, _local_id: localId, _synced: 0, _updated_at: now };

  if (operation === 'DELETE') {
    await db.runAsync(
      `UPDATE ${table} SET _deleted=1, _synced=0, _updated_at=? WHERE _local_id=?`,
      [now, localId]
    );
  } else {
    const cols = Object.keys(record).join(', ');
    const placeholders = Object.keys(record).map(() => '?').join(', ');
    await db.runAsync(
      `INSERT OR REPLACE INTO ${table} (${cols}) VALUES (${placeholders})`,
      Object.values(record)
    );
  }

  const queueId = await Crypto.randomUUID();
  await db.runAsync(
    `INSERT INTO sync_queue(id, table_name, record_id, operation, payload, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [queueId, table, localId, operation, JSON.stringify(record), now]
  );

  return record;
}
