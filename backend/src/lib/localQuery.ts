import { businessDb as localDb } from './businessDb';

export async function queryAll<T = Record<string, any>>(
  table: string,
  where: string = '',
  params: any[] = []
): Promise<T[]> {
  const whereClause = where ? `WHERE _deleted=0 AND (${where})` : 'WHERE _deleted=0';
  return (await localDb.prepare(`SELECT * FROM ${table} ${whereClause}`).all(...params)) as T[];
}

export async function queryOne<T = Record<string, any>>(
  table: string,
  where: string,
  params: any[] = []
): Promise<T | undefined> {
  return (await localDb.prepare(
    `SELECT * FROM ${table} WHERE _deleted=0 AND (${where})`
  ).get(...params)) as T | undefined;
}

export async function queryRaw<T = Record<string, any>>(
  sql: string,
  params: any[] = []
): Promise<T[]> {
  return (await localDb.prepare(sql).all(...params)) as T[];
}

export async function queryCount(
  table: string,
  where: string = '',
  params: any[] = []
): Promise<number> {
  const whereClause = where ? `WHERE _deleted=0 AND (${where})` : 'WHERE _deleted=0';
  const row = (await localDb.prepare(
    `SELECT COUNT(*) as cnt FROM ${table} ${whereClause}`
  ).get(...params)) as { cnt: number } | undefined;
  return row?.cnt ?? 0;
}
