/**
 * Transitional asynchronous access for existing operational services.
 * Cloud SQL executes on the current PostgreSQL transaction; SQLite is used only
 * when running the offline/test engine without DATABASE_URL. No cloud projections.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import { postgresQuery, withPostgresTransaction, inPostgresTransaction } from './postgresDb';

export function cloudBusinessMode(): boolean { return Boolean(process.env.DATABASE_URL); }
const embedded = () => require('../local-db').localDb as typeof import('../local-db').localDb;
const offlineTransaction = new AsyncLocalStorage<boolean>();
let offlineQueue: Promise<void> = Promise.resolve();
async function withOfflineTransaction<T>(operation: () => T | Promise<T>): Promise<T> {
  if (offlineTransaction.getStore()) return operation();
  const previous = offlineQueue;
  let release!: () => void;
  offlineQueue = new Promise<void>(resolve => { release=resolve; });
  await previous;
  try {
    embedded().exec('BEGIN IMMEDIATE');
    try {
      const result = await offlineTransaction.run(true, operation);
      embedded().exec('COMMIT');
      return result;
    } catch(error) { embedded().exec('ROLLBACK'); throw error; }
  } finally { release(); }
}

const metadata = new Map<string, Map<string, string>>();
export async function cloudColumns(table: string) {
  let result = metadata.get(table);
  if (!result) {
    const rows = await postgresQuery<{column_name: string; data_type: string}>(
      'SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1', [table]);
    result = new Map(rows.map(row => [row.column_name, row.data_type]));
    metadata.set(table, result);
  }
  return result;
}

/** Existing domain records use SQLite's 0/1 booleans and ISO timestamps. */
function domainRow(row: Record<string, any>) {
  return Object.fromEntries(Object.entries(row).map(([key,value]) => [key,
    typeof value === 'boolean' ? Number(value) : value instanceof Date ? value.toISOString() : value && typeof value === 'object' ? JSON.stringify(value) : value]));
}

async function execute(source: string, values: any[], kind: 'all' | 'get' | 'run') {
  if (!cloudBusinessMode()) {
    return embedded().prepare(source)[kind](...values);
  }
  let query = source.trim();
  const params = values.map(value => value === undefined ? null : value);
  let parameter = 0;
  // Operational SQL uses positional placeholders, never user-controlled SQL.
  query = query.replace(/'(?:''|[^'])*'|\?/g, token => token === '?' ? `$${++parameter}` : token);
  query = query.replace(/\bMAX\(0\s*,/gi, 'GREATEST(0,').replace(/\bMIN\(([^,()]+),/gi, 'LEAST($1,');
  query = query.replace(/datetime\('now',\s*'(-?\d+) days'\)/gi, "(CURRENT_TIMESTAMP + INTERVAL '$1 days')");
  query = query.replace(/json_extract\((\w+),\s*'\$\.(\w+)'\)/gi, "($1::jsonb ->> '$2')");
  const table = /\b(?:INTO|UPDATE|FROM)\s+([a-z_][\w]*)/i.exec(query)?.[1];
  const types = table ? await cloudColumns(table) : new Map<string,string>();
  if (/^\s*(INSERT|UPDATE|DELETE)\b/i.test(query) && !inPostgresTransaction())
    throw new Error('Cloud business mutations require a PostgreSQL transaction');
  const ignore = /^INSERT OR IGNORE\b/i.test(query);
  const replace = /^INSERT OR REPLACE\b/i.test(query);
  query = query.replace(/^INSERT OR (IGNORE|REPLACE)\b/i, 'INSERT');
  const insert = /^INSERT\s+INTO\s+\w+\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i.exec(query);
  if (insert) {
    const fields = insert[1].split(',').map(field => field.trim());
    const expressions = insert[2].split(',').map(value => value.trim());
    const scope=(require('./tenantContext') as typeof import('./tenantContext')).tenantContext.getStore();
    for(const [field,value] of [['clinic_id',scope?.clinicId],['organization_id',scope?.organizationId]] as const) {
      if(value && types.has(field) && !fields.includes(field)) { fields.push(field);params.push(value);expressions.push(`$${params.length}`); }
    }
    expressions.forEach((expression,index) => {
      if (types.get(fields[index]) !== 'boolean') return;
      const position = /^\$(\d+)$/.exec(expression);
      if (position && params[Number(position[1])-1] !== null) params[Number(position[1])-1] = Boolean(params[Number(position[1])-1]);
      else if (/^[01]$/.test(expression)) expressions[index] = expression === '1' ? 'true' : 'false';
    });
    query = query.replace(insert[0], `INSERT INTO ${table} (${fields.join(',')}) VALUES (${expressions.join(',')})`);
    if (ignore) query += ' ON CONFLICT DO NOTHING';
    if (replace) {
      // Preserve references: PostgreSQL upsert must never delete the old row.
      const identity = fields.includes('_local_id') ? '_local_id' : 'id';
      query += ` ON CONFLICT (${identity}) DO UPDATE SET ${fields.filter(field => field !== identity && field !== 'id').map(field => `${field}=EXCLUDED.${field}`).join(',')}`;
    }
  }
  const booleanFields = new Set([...types].filter(([,type]) => type==='boolean').map(([field]) => field));
  for (const ref of query.matchAll(/\b(?:FROM|JOIN)\s+([a-z_]\w*)/gi)) {
    for(const [field,type] of await cloudColumns(ref[1])) if(type==='boolean') booleanFields.add(field);
  }
  for (const field of booleanFields) {
    const match = new RegExp(`\\b${field}\\s*=\\s*\\$(\\d+)`, 'gi');
    for (const entry of query.matchAll(match)) if (params[Number(entry[1])-1] !== null) params[Number(entry[1])-1] = Boolean(params[Number(entry[1])-1]);
    query = query.replace(new RegExp(`\\b${field}\\s*=\\s*([01])\\b`, 'gi'), (_whole,n) => `${field}=${n === '1' ? 'true' : 'false'}`);
    query = query.replace(new RegExp(`COALESCE\\((${field}),\\s*([01])\\)`, 'gi'), (_whole,f,n) => `COALESCE(${f},${n==='1'?'true':'false'})`);
  }
  // SQLite allowed UUID/text identifier comparisons used by old local aliases.
  // Cast both identifiers for those joins; leave indexed UUID predicates intact.
  query=query.replace(/((?:\w+\.)?(?:id|\w+_id))\s*=\s*\((\w+\._local_id)\)/gi,'$1::text=$2::text');
  query=query.replace(/((?:\w+\.)?(?:id|\w+_id))\s*=\s*(\w+\._local_id)/gi,'$1::text=$2::text');
  query=query.replace(/(\w+\._local_id)\s*=\s*((?:\w+\.)?(?:id|\w+_id))/gi,'$1::text=$2::text');
  query=query.replace(/(\b\w+_id)\s+IN\s*\(SELECT _local_id FROM/gi,'$1::text IN (SELECT _local_id::text FROM');
  // Every operational service participates in the request transaction. Inventory
  // writers acquire explicit row locks in their engines, never a global mutex.
  const result = await postgresQuery(query, params);
  if (kind === 'run') return { changes: (result as any).count ?? result.length };
  const rows = result.map(domainRow);
  return kind === 'get' ? rows[0] : rows;
}

export const businessDb = {
  prepare(source: string) {
    return {
      all: async (...params: any[]): Promise<any[]> => (await execute(source,params,'all')) as Promise<any[]>,
      get: async (...params: any[]): Promise<any> => (await execute(source,params,'get')),
      run: async (...params: any[]): Promise<{changes:number}> => (await execute(source,params,'run')) as Promise<{changes:number}>,
    };
  },
  transaction<T>(operation: () => T | Promise<T>): () => Promise<T> {
    return async () => cloudBusinessMode() ? (await withPostgresTransaction(async () => operation())) : withOfflineTransaction(operation);
  },
};

export async function forEachAsync<T>(values: T[], callback: (value: T, index: number, array: T[]) => unknown) {
  for (let index=0; index<values.length; index++) await callback(values[index],index,values);
}

export async function normalizeCloudRecord(table: string, data: Record<string,any>) {
  const types=await cloudColumns(table);
  const result={...data};
  const scope=(require('./tenantContext') as typeof import('./tenantContext')).tenantContext.getStore();
  for(const [field,value] of [['clinic_id',scope?.clinicId],['organization_id',scope?.organizationId]] as const) if(value && types.has(field) && result[field]===undefined) result[field]=value;
  for(const [field,type] of types) if(type==='boolean' && result[field] !== undefined && result[field] !== null) result[field]=Boolean(result[field]);
  return result;
}

/** Lock only the requested business rows, in a common order across engines. */
export async function lockBusinessRows(table: string, ids: string[]) {
  if(!cloudBusinessMode() || !ids.length) return;
  if(!inPostgresTransaction()) throw new Error('Row locking requires a PostgreSQL transaction');
  if(!/^[a-z_][a-z0-9_]*$/.test(table)) throw new Error('Invalid lock table');
  await postgresQuery(`SELECT id FROM ${table} WHERE id::text=ANY($1::text[]) OR _local_id=ANY($1::text[]) ORDER BY id FOR UPDATE`, [[...new Set(ids)].sort()]);
}
