import { AsyncLocalStorage } from 'node:async_hooks';
import { businessDb as localDb } from './businessDb';
import { AppError } from './appError';
import type { AuthUser } from '../types';

export const tenantContext = new AsyncLocalStorage<{
  userId: string;
  role: string;
  clinicId: string | null;
  organizationId: string | null;
  platformAdmin: boolean;
  storeId: string | null;
}>();

export function withTenantContext<T>(user: AuthUser, next: () => T, storeId: string | null = null): T {
  return tenantContext.run({
    userId: user.id,
    storeId,
    role: user.role,
    clinicId: user.clinic_id || null,
    organizationId: user.organization_id || user.organizationId || user.clinic_id || null,
    platformAdmin: user.role === 'SUPER_ADMIN' && !user.isImpersonating,
  }, next);
}

const parents: Record<string, [string, string]> = {
  prescription_items: ['prescription_id', 'prescriptions'],
  purchase_match_results: ['invoice_id', 'purchase_invoices'],
  purchase_order_versions: ['po_id', 'purchase_orders'],
  purchase_order_requisition_links: ['po_id', 'purchase_orders'],
  supplier_payment_allocations: ['payment_id', 'supplier_payments'],
  stocktake_counts: ['stocktake_id', 'stocktake_sessions'],
  supplier_quotation_items: ['quotation_id', 'supplier_quotations'],
  transfer_package_items: ['transfer_id', 'stock_transfers'],
  transfer_receipt_items: ['transfer_id', 'stock_transfers'],
  order_package_items: ['order_id', 'orders'],
};
const references: Record<string, string> = {
  medicine_id: 'medicines', matched_product_id: 'medicines', product_id: 'medicines',
  original_medicine_id: 'medicines', suggested_medicine_id: 'medicines', batch_id: 'medicine_batches',
  customer_id: 'customers', patient_id: 'customers', supplier_id: 'suppliers', preferred_supplier_id: 'suppliers',
  store_id: 'stores', requested_store_id: 'stores', fulfilment_store_id: 'stores', warehouse_id: 'warehouses',
  counter_id: 'counters', terminal_id: 'terminals', region_id: 'regions', doctor_id: 'doctors',
  prescription_id: 'prescriptions', prescription_item_id: 'prescription_items',
  sale_id: 'sales', sale_item_id: 'sale_items', return_of: 'sales',
  order_id: 'orders', order_item_id: 'order_items', transfer_id: 'stock_transfers',
  po_id: 'purchase_orders', po_item_id: 'purchase_order_items', grn_id: 'goods_receipts',
  grn_item_id: 'goods_receipt_items', invoice_id: 'purchase_invoices',
  requisition_id: 'purchase_requisitions', requisition_item_id: 'purchase_requisition_items',
  price_book_id: 'price_books', promotion_id: 'promotions', coupon_id: 'coupons',
  customer_group_id: 'customer_groups', supplier_scheme_id: 'supplier_schemes',
};

async function assertOwned(table: string, row: Record<string, any>, depth = 0): Promise<void> {
  const scope = tenantContext.getStore();
  if (!scope || scope.platformAdmin) return;
  const denied = () => { throw new AppError(404, 'Record not found', 'TENANT_RECORD_NOT_FOUND'); };
  if (table === 'organizations') {
    if (row.id !== scope.organizationId && row._local_id !== scope.organizationId) denied();
  } else if (table === 'clinics') {
    if (row.id !== scope.clinicId && row._local_id !== scope.clinicId) denied();
  } else if (row.organization_id) {
    if (row.organization_id !== scope.organizationId) denied();
  } else if (row.clinic_id) {
    if (row.clinic_id !== scope.clinicId) denied();
  } else if (parents[table] && depth < 3) {
    const [field, parent] = parents[table];
    const parentRow = (await localDb.prepare(`SELECT * FROM ${parent} WHERE id = ? OR _local_id = ?`).get(row[field], row[field]));
    if (parentRow) (await assertOwned(parent, parentRow as Record<string, any>, depth + 1));
  }
}

/** Defense in depth for every embedded mutation, including caller-supplied IDs on INSERT. */
export async function guardTenantMutation(table: string, data: Record<string, any>) {
  const scope = tenantContext.getStore();
  if (!scope || scope.platformAdmin) return;
  (await assertOwned(table, data));
  for (const id of new Set([data.id, data._local_id].filter(Boolean))) {
    const existing = (await localDb.prepare(`SELECT * FROM ${table} WHERE id = ? OR _local_id = ?`).all(id, id));
    for (const row of existing) (await assertOwned(table, row as Record<string, any>));
  }
  for (const [field, parent] of Object.entries(references)) {
    if (!data[field]) continue;
    const rows = (await localDb.prepare(`SELECT * FROM ${parent} WHERE id = ? OR _local_id = ?`).all(data[field], data[field]));
    for (const row of rows) (await assertOwned(parent, row as Record<string, any>));
  }
}
