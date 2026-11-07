import { tenantContext } from '../lib/tenantContext';
import { queryRaw } from '../lib/postgresDb';
import { AppError } from '../lib/appError';

export interface StoreActor {
  userId: string;
  role: string;
}

interface AccessibleStore {
  id: string;
  organization_id: string;
  store_code: string;
  name: string;
  is_default: boolean;
}

export async function listAccessibleCloudStores(clinicId: string, actor?: StoreActor): Promise<AccessibleStore[]> {
  if (!actor) {
    return queryRaw<AccessibleStore>(
      `SELECT id, organization_id, store_code, COALESCE(display_name, name) AS name, false AS is_default
       FROM stores WHERE clinic_id = ? AND deleted_at IS NULL ORDER BY created_at, id`, [clinicId],
    );
  }
  const manage = ['OWNER', 'SUPER_ADMIN'].includes(actor.role);
  return queryRaw<AccessibleStore>(
    `SELECT s.id, s.organization_id, s.store_code, COALESCE(s.display_name, s.name) AS name,
       COALESCE(a.is_default,false) AS is_default
     FROM stores s LEFT JOIN user_store_access a ON a.store_id = s.id AND a.organization_id = s.organization_id
       AND a.user_id = ? AND a.is_active AND a.deleted_at IS NULL
     WHERE s.clinic_id = ? AND s.deleted_at IS NULL AND s.status = 'active' AND (?::boolean OR a.user_id IS NOT NULL)
     ORDER BY COALESCE(a.is_default,false) DESC, s.created_at, s.id`, [actor.userId, clinicId, manage],
  );
}

export async function validateRequestedCloudStore(clinicId: string, actor: StoreActor, requested: unknown) {
  if (typeof requested !== 'string' || !/^[0-9a-f-]{36}$/i.test(requested)) {
    throw new AppError(403, 'Store access denied.', 'FORBIDDEN_STORE_ACCESS');
  }
  const allowed = await listAccessibleCloudStores(clinicId, actor);
  const store = allowed.find(row => row.id === requested);
  if (!store) throw new AppError(403, 'Store access denied.', 'FORBIDDEN_STORE_ACCESS');
  return store;
}

export const selectedCloudStore = () => tenantContext.getStore()?.storeId ?? null;

/** Legacy cloud documents must reference cloud locations the current actor can access. */
export async function resolveCloudStoreContext(
  clinicId: string,
  requested: { store_id?: string | null; counter_id?: string | null; terminal_id?: string | null },
) {
  const actor = tenantContext.getStore();
  const storeRequest = requested.store_id ?? selectedCloudStore();
  const stores = await listAccessibleCloudStores(clinicId, actor);
  const store = storeRequest ? stores.find(row => row.id === storeRequest) : stores[0];
  if (storeRequest && !store) throw new AppError(403, 'Store access denied.', 'FORBIDDEN_STORE_ACCESS');
  if (actor && !store && (await queryRaw('SELECT 1 FROM stores WHERE clinic_id = ? AND deleted_at IS NULL LIMIT 1', [clinicId])).length) {
    throw new AppError(403, 'No accessible store was found.');
  }
  const storeId = store?.id || null;
  const counterId = requested.counter_id || null;
  const terminalId = requested.terminal_id || null;
  if (counterId && (!storeId || !(await queryRaw(
    'SELECT id FROM counters WHERE id = ? AND store_id = ? AND deleted_at IS NULL', [counterId, storeId],
  )).length)) throw new AppError(403, 'Counter does not belong to this store.');
  if (terminalId && (!storeId || !(await queryRaw(
    'SELECT id FROM terminals WHERE id = ? AND store_id = ? AND deleted_at IS NULL', [terminalId, storeId],
  )).length)) throw new AppError(403, 'Terminal does not belong to this store.');
  return { organizationId: store?.organization_id ?? null, storeId, counterId, terminalId };
}

export async function assertSaleStore(clinicId: string, storeId: string | null) {
  const actor = tenantContext.getStore();
  if (!actor || !storeId) return;
  if (actor.storeId && actor.storeId !== storeId && !['OWNER','SUPER_ADMIN'].includes(actor.role)) {
    throw new AppError(403, 'Switch to the invoice’s branch to access it.');
  }
  await validateRequestedCloudStore(clinicId, actor, storeId);
}

export async function visibleCloudStoreIds(clinicId: string) {
  const actor = tenantContext.getStore();
  if (!actor || ['OWNER','SUPER_ADMIN'].includes(actor.role)) return null;
  return (await listAccessibleCloudStores(clinicId, actor)).map(store => store.id);
}
