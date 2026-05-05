import { getLocalDb } from './db';

export async function queryAll<T = Record<string, any>>(
  table: string,
  where: string = '',
  params: any[] = []
): Promise<T[]> {
  const db = getLocalDb();
  const whereClause = where ? `WHERE _deleted=0 AND (${where})` : 'WHERE _deleted=0';
  return db.getAllAsync<T>(`SELECT * FROM ${table} ${whereClause}`, params);
}

export async function queryOne<T = Record<string, any>>(
  table: string,
  where: string,
  params: any[] = []
): Promise<T | null> {
  const db = getLocalDb();
  return db.getFirstAsync<T>(
    `SELECT * FROM ${table} WHERE _deleted=0 AND (${where})`,
    params
  );
}

export async function queryRaw<T = Record<string, any>>(
  sql: string,
  params: any[] = []
): Promise<T[]> {
  const db = getLocalDb();
  return db.getAllAsync<T>(sql, params);
}

export async function queryCount(
  table: string,
  where: string = '',
  params: any[] = []
): Promise<number> {
  const db = getLocalDb();
  const whereClause = where ? `WHERE _deleted=0 AND (${where})` : 'WHERE _deleted=0';
  const row = await db.getFirstAsync<{ cnt: number }>(
    `SELECT COUNT(*) as cnt FROM ${table} ${whereClause}`,
    params
  );
  return row?.cnt ?? 0;
}
