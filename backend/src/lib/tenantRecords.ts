import { businessDb as localDb } from './businessDb';
import { AppError } from './appError';

// Keep identifiers internal. Never interpolate a table name received from a client.
const tables = new Set([
  'medicines', 'medicine_batches', 'customers', 'suppliers', 'stores', 'warehouses',
  'regions', 'prescriptions', 'prescription_items', 'purchase_invoices',
  'purchase_requisitions', 'purchase_requisition_items', 'supplier_schemes',
]);

/** Resolve a linked record inside the caller's organization before reading or mutating it. */
export async function tenantRecord(table: string, id: string, organizationId: string): Promise<Record<string, any>> {
  if (!tables.has(table)) throw new Error('Unsupported tenant reference table');
  if (!organizationId || !id) throw new AppError(404, 'Record not found', 'TENANT_RECORD_NOT_FOUND');
  const row = table === 'prescription_items' ? (await localDb.prepare(
    `SELECT item.* FROM prescription_items item JOIN prescriptions parent ON parent.id = item.prescription_id
      WHERE (item.id = ? OR item._local_id = ?) AND parent.organization_id = ? AND parent._deleted = 0 AND item._deleted = 0`,
  ).get(id, id, organizationId)) as Record<string, any> | undefined : (await localDb.prepare(
    `SELECT * FROM ${table} WHERE (id = ? OR _local_id = ?) AND organization_id = ? AND _deleted = 0`,
  ).get(id, id, organizationId)) as Record<string, any> | undefined;
  if (!row || row.deleted_at) throw new AppError(404, 'Record not found', 'TENANT_RECORD_NOT_FOUND');
  return row;
}
