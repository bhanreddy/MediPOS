import { randomUUID } from 'node:crypto';
import { businessDb as localDb } from "../lib/businessDb";
import { AppError } from "../lib/appError";
import type { AuthUser } from "../types";

async function loadClinic(clinicId: string): Promise<Record<string, any> | undefined> {
  if (process.env.DATABASE_URL) {
    try {
      const { queryRaw } = await import("../lib/postgresDb");
      const rows = await queryRaw("SELECT * FROM clinics WHERE id = ?", [clinicId]);
      return rows[0];
    } catch {
      throw new AppError(503, "Store directory is temporarily unavailable. Please retry.");
    }
  }
  const { supabaseAdmin } = await import("../config/supabase");
  const { data, error } = await supabaseAdmin.from("clinics").select("*").eq("id", clinicId).maybeSingle();
  if (error) throw new AppError(503, "Store directory is temporarily unavailable. Please retry.");
  return data ?? undefined;
}

const loading = new Map<string, Promise<string | null>>();
/** Mirror an already verified cloud identity into the embedded POS directory. Never writes cloud data. */
export async function ensureCloudPosDirectory(
  user: AuthUser,
  fullName?: string,
): Promise<string | null> {
  const key = `${user.id}:${user.clinic_id || ""}:${user.role}:${Boolean(user.isImpersonating)}`;
  const current = process.env.DATABASE_URL ? undefined : loading.get(key);
  if (current) return current;
  const attempt = (async () => {
    let clinic: Record<string, any> | undefined;
    if (user.clinic_id) {
      clinic = process.env.DATABASE_URL ? await loadClinic(user.clinic_id) : (await localDb
        .prepare("SELECT * FROM clinics WHERE id = ? OR _local_id = ?")
        .get(user.clinic_id, user.clinic_id)) as Record<string, any> | undefined;
      if (!clinic) {
        clinic = await loadClinic(user.clinic_id);
        if (!clinic)
          throw new AppError(403, "Your assigned clinic is unavailable.");
      }
    }
    if (clinic && (clinic.deleted_at || clinic._deleted || clinic.is_active === false || clinic.is_active === 0))
      throw new AppError(403, "Your assigned clinic is unavailable.");
    if (process.env.DATABASE_URL && user.isImpersonating) return clinic?.organization_id || user.clinic_id || null;
    const organizationId = clinic
      ? String(clinic.organization_id || user.clinic_id)
      : null;
    if (process.env.DATABASE_URL && clinic && organizationId) {
      const { postgresQuery } = await import('../lib/postgresDb');
      const ready = await postgresQuery(`SELECT s.id FROM stores s
        JOIN user_organization_access oa ON oa.organization_id=s.organization_id AND oa.user_id=$1 AND oa.is_active=true
        JOIN user_store_access sa ON sa.store_id=s.id AND sa.user_id=$1 AND sa.is_active=true
        WHERE s.clinic_id=$2 AND s.deleted_at IS NULL LIMIT 1`, [user.id,user.clinic_id]);
      if (ready.length) return organizationId;
      // Serialize first-time directory provisioning only. Established requests
      // do not take this lock and can checkout concurrently.
      await postgresQuery('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`directory:${user.clinic_id}`]);
    }
    const now = new Date().toISOString();
    (await localDb.transaction(async () => {
      if (!process.env.DATABASE_URL && !user.isImpersonating) (await localDb
        .prepare(
          `INSERT INTO users (id, _local_id, clinic_id, full_name, email, role, _synced, _updated_at)
        VALUES (?, ?, ?, ?, ?, ?, 1, ?) ON CONFLICT(_local_id) DO UPDATE SET
        clinic_id=excluded.clinic_id, role=excluded.role, full_name=excluded.full_name, email=excluded.email, _synced=1, _updated_at=excluded._updated_at`,
        )
        .run(
          user.id,
          user.id,
          user.clinic_id,
          fullName || user.email.split("@")[0] || "Operator",
          user.email,
          user.role,
          now,
        ));
      if (!clinic || !organizationId || !user.clinic_id) return;
      (await localDb
        .prepare(
          `INSERT OR IGNORE INTO organizations (id, _local_id, legal_name, display_name, code, timezone, currency, _synced, _updated_at)
        VALUES (?, ?, ?, ?, ?, ?, 'INR', 1, ?)`,
        )
        .run(
          organizationId,
          organizationId,
          clinic.name || "Medical Store",
          clinic.name || "Medical Store",
          organizationId,
          clinic.timezone || "Asia/Kolkata",
          now,
        ));
      (await localDb
        .prepare(
          `INSERT INTO clinics (id, _local_id, name, organization_id, plan, is_active, _synced, _updated_at)
        VALUES (?, ?, ?, ?, ?, ?, 1, ?) ON CONFLICT(_local_id) DO UPDATE SET organization_id=excluded.organization_id, name=excluded.name, _synced=1`,
        )
        .run(
          user.clinic_id,
          user.clinic_id,
          clinic.name || "Medical Store",
          organizationId,
          clinic.plan || "trial",
          clinic.is_active === false ? 0 : 1,
          now,
        ));
      let store = (await localDb
        .prepare(
          "SELECT id FROM stores WHERE organization_id = ? AND clinic_id = ? AND _deleted = 0 LIMIT 1",
        )
        .get(organizationId, user.clinic_id)) as { id: string } | undefined;
      if (!store) {
        const id = user.clinic_id;
        (await localDb
          .prepare(
            `INSERT OR IGNORE INTO stores (id, _local_id, organization_id, clinic_id, store_code, name, timezone, _synced, _updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`,
          )
          .run(
            id,
            id,
            organizationId,
            user.clinic_id,
            String(clinic.slug || user.clinic_id),
            clinic.name || "Medical Store",
            clinic.timezone || "Asia/Kolkata",
            now,
          ));
        store = { id };
      }
      if(process.env.DATABASE_URL) {
        for(const table of ['medicines','medicine_batches','customers','suppliers','sales','sale_items','purchases','purchase_items','expenses','stock_ledger']) {
          await localDb.prepare(`UPDATE ${table} SET organization_id=? WHERE clinic_id=? AND organization_id IS NULL`).run(organizationId,user.clinic_id);
        }
      }
      if (user.isImpersonating) return;
      const organizationAccess = (await localDb
        .prepare(
          "SELECT id FROM user_organization_access WHERE user_id = ? AND organization_id = ?",
        )
        .get(user.id, organizationId));
      if (!organizationAccess) {
        const id = randomUUID();
        (await localDb
          .prepare(
            `INSERT OR IGNORE INTO user_organization_access (id, _local_id, user_id, organization_id, role, is_active, _synced, _updated_at)
          VALUES (?, ?, ?, ?, ?, 1, 1, ?)`,
          )
          .run(id, id, user.id, organizationId, user.role === 'SUPER_ADMIN' ? 'OWNER' : user.role, now));
      } else {
        (await localDb
          .prepare(
            "UPDATE user_organization_access SET role = ? WHERE user_id = ? AND organization_id = ?",
          )
          .run(user.role === 'SUPER_ADMIN' ? 'OWNER' : user.role, user.id, organizationId));
      }
      const storeAccess = (await localDb
        .prepare(
          "SELECT id FROM user_store_access WHERE user_id = ? AND store_id = ?",
        )
        .get(user.id, store.id));
      if (!storeAccess) {
        const id = randomUUID();
        (await localDb
          .prepare(
            `INSERT OR IGNORE INTO user_store_access (id, _local_id, user_id, organization_id, store_id, role, is_default, is_active, _synced, _updated_at)
          VALUES (?, ?, ?, ?, ?, ?, 1, 1, 1, ?)`,
          )
          .run(id, id, user.id, organizationId, store.id, ['OWNER','SUPER_ADMIN','REGIONAL_MANAGER'].includes(user.role) ? 'STORE_MANAGER' : user.role, now));
      } else {
        (await localDb
          .prepare(
            "UPDATE user_store_access SET role = ? WHERE user_id = ? AND store_id = ?",
          )
          .run(['OWNER','SUPER_ADMIN','REGIONAL_MANAGER'].includes(user.role) ? 'STORE_MANAGER' : user.role, user.id, store.id));
      }
    })());
    return organizationId;
  })();
  if (!process.env.DATABASE_URL) loading.set(key, attempt);
  try {
    const organizationId = await attempt;
    return organizationId;
  } finally {
    if (loading.get(key) === attempt) loading.delete(key);
  }
}
