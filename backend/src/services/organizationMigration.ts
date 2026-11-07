import { businessDb as localDb } from '../lib/businessDb';
import { v4 as uuidv4 } from 'uuid';
import { InventoryPositionService } from './inventoryPosition';
import { DocumentNumberingService } from './documentNumbering';

export interface ClinicMigrationResult {
  clinicId: string;
  organizationId: string;
  storeId: string;
  counterId: string;
  terminalId: string;
  financialYearId: string;
  batchesMigrated: number;
  transactionsUpdated: number;
}

export class OrganizationMigrationService {
  /**
   * Migrate a single legacy clinic tenant into the enterprise organization hierarchy.
   */
  static async migrateClinic(clinicId: string): Promise<ClinicMigrationResult> {
    const now = new Date().toISOString();

    const clinic: any = (await localDb
      .prepare('SELECT * FROM clinics WHERE id = ? OR _local_id = ?')
      .get(clinicId, clinicId));

    if (!clinic) {
      throw new Error(`Clinic not found: ${clinicId}`);
    }

    const migrationTx = localDb.transaction(async () => {
      // 1. Resolve or Create Organization
      const orgCode = `ORG-${(clinic.slug || clinic.name || clinicId).replace(/[^a-zA-Z0-9]/g, '').slice(0, 10).toUpperCase()}-${clinicId.slice(0, 4).toUpperCase()}`;
      let org: any = null;

      if (clinic.organization_id) {
        org = (await localDb.prepare('SELECT * FROM organizations WHERE id = ? OR _local_id = ?').get(clinic.organization_id, clinic.organization_id));
      }
      if (!org) {
        org = (await localDb.prepare('SELECT * FROM organizations WHERE code = ?').get(orgCode));
      }

      let organizationId: string;
      if (!org) {
        organizationId = uuidv4();
        (await localDb
          .prepare(
            `INSERT OR REPLACE INTO organizations (
               id, _local_id, legal_name, display_name, code, gstin, phone, email,
               status, timezone, currency, financial_year_start, default_state_code,
               created_at, updated_at, _updated_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', 'Asia/Kolkata', 'INR', '04-01', '36', ?, ?, ?)`
          )
          .run(
            organizationId,
            organizationId,
            clinic.name || 'Main Pharmacy Org',
            clinic.name || 'Main Pharmacy Org',
            orgCode,
            clinic.gstin || null,
            clinic.phone || null,
            clinic.email || null,
            now,
            now,
            now
          ));
      } else {
        organizationId = org.id || org._local_id;
      }

      (await localDb
        .prepare('UPDATE clinics SET organization_id = ?, _updated_at = ? WHERE id = ? OR _local_id = ?')
        .run(organizationId, now, clinic.id, clinic._local_id));

      // 2. Resolve or Create Default Store
      let store: any = (await localDb
        .prepare("SELECT * FROM stores WHERE clinic_id = ? OR (organization_id = ? AND store_code = 'MAIN')")
        .get(clinic.id, organizationId));

      let storeId: string;
      if (!store) {
        storeId = uuidv4();
        (await localDb
          .prepare(
            `INSERT OR REPLACE INTO stores (
               id, _local_id, organization_id, clinic_id, store_code, name, display_name,
               address, gstin_override, drug_licence_number, phone, email, status,
               fulfilment_enabled, created_at, updated_at, _updated_at
             ) VALUES (?, ?, ?, ?, 'MAIN', ?, ?, ?, ?, ?, ?, ?, 'active', 1, ?, ?, ?)`
          )
          .run(
            storeId,
            storeId,
            organizationId,
            clinic.id,
            `${clinic.name} — Main Store`,
            `${clinic.name} — Main Store`,
            clinic.address || null,
            clinic.gstin || null,
            clinic.drug_licence_number || null,
            clinic.phone || null,
            clinic.email || null,
            now,
            now,
            now
          ));
      } else {
        storeId = store.id || store._local_id;
      }

      // 3. Resolve or Create Default Billing Counter
      let counter: any = (await localDb
        .prepare("SELECT * FROM counters WHERE store_id = ? AND counter_code = 'C1'")
        .get(storeId));

      let counterId: string;
      if (!counter) {
        counterId = uuidv4();
        (await localDb
          .prepare(
            `INSERT OR REPLACE INTO counters (
               id, _local_id, organization_id, store_id, counter_code, name, status,
               created_at, updated_at, _updated_at
             ) VALUES (?, ?, ?, ?, 'C1', 'Main Billing Counter', 'active', ?, ?, ?)`
          )
          .run(counterId, counterId, organizationId, storeId, now, now, now));
      } else {
        counterId = counter.id || counter._local_id;
      }

      // 4. Resolve or Create Default Terminal
      let terminal: any = (await localDb
        .prepare("SELECT * FROM terminals WHERE store_id = ? AND terminal_code = 'T1'")
        .get(storeId));

      let terminalId: string;
      if (!terminal) {
        terminalId = uuidv4();
        const deviceUuid = uuidv4();
        (await localDb
          .prepare(
            `INSERT OR REPLACE INTO terminals (
               id, _local_id, organization_id, store_id, counter_id, device_uuid,
               terminal_code, terminal_name, platform, status, created_at, updated_at, _updated_at
             ) VALUES (?, ?, ?, ?, ?, ?, 'T1', 'Primary Billing Terminal', 'WEB', 'active', ?, ?, ?)`
          )
          .run(terminalId, terminalId, organizationId, storeId, counterId, deviceUuid, now, now, now));
      } else {
        terminalId = terminal.id || terminal._local_id;
      }

      // 5. Create Default Financial Year
      let fy: any = (await localDb
        .prepare("SELECT * FROM financial_years WHERE organization_id = ? AND name = '2026-27'")
        .get(organizationId));

      let financialYearId: string;
      if (!fy) {
        financialYearId = uuidv4();
        (await localDb
          .prepare(
            `INSERT OR REPLACE INTO financial_years (
               id, _local_id, organization_id, name, start_date, end_date, status,
               created_at, updated_at, _updated_at
             ) VALUES (?, ?, ?, '2026-27', '2026-04-01', '2027-03-31', 'OPEN', ?, ?, ?)`
          )
          .run(financialYearId, financialYearId, organizationId, now, now, now));
      } else {
        financialYearId = fy.id || fy._local_id;
      }

      // 6. Backfill location context on existing data
      (await localDb.prepare("UPDATE medicines SET organization_id = ? WHERE clinic_id = ? AND (organization_id IS NULL OR organization_id = '')").run(organizationId, clinic.id));
      (await localDb.prepare('UPDATE medicine_batches SET organization_id = ?, store_id = ? WHERE clinic_id = ? AND (organization_id IS NULL OR store_id IS NULL)').run(organizationId, storeId, clinic.id));
      (await localDb.prepare('UPDATE customers SET organization_id = ?, store_id = ? WHERE clinic_id = ? AND (organization_id IS NULL OR store_id IS NULL)').run(organizationId, storeId, clinic.id));
      (await localDb.prepare('UPDATE suppliers SET organization_id = ?, store_id = ? WHERE clinic_id = ? AND (organization_id IS NULL OR store_id IS NULL)').run(organizationId, storeId, clinic.id));
      (await localDb.prepare('UPDATE sales SET organization_id = ?, store_id = ? WHERE clinic_id = ? AND (organization_id IS NULL OR store_id IS NULL)').run(organizationId, storeId, clinic.id));
      (await localDb.prepare('UPDATE sale_items SET organization_id = ?, store_id = ? WHERE clinic_id = ? AND (organization_id IS NULL OR store_id IS NULL)').run(organizationId, storeId, clinic.id));
      (await localDb.prepare('UPDATE purchases SET organization_id = ?, store_id = ? WHERE clinic_id = ? AND (organization_id IS NULL OR store_id IS NULL)').run(organizationId, storeId, clinic.id));
      (await localDb.prepare('UPDATE purchase_items SET organization_id = ?, store_id = ? WHERE clinic_id = ? AND (organization_id IS NULL OR store_id IS NULL)').run(organizationId, storeId, clinic.id));
      (await localDb.prepare('UPDATE expenses SET organization_id = ?, store_id = ? WHERE clinic_id = ? AND (organization_id IS NULL OR store_id IS NULL)').run(organizationId, storeId, clinic.id));
      (await localDb.prepare('UPDATE stock_ledger SET organization_id = ?, store_id = ? WHERE clinic_id = ? AND (organization_id IS NULL OR store_id IS NULL)').run(organizationId, storeId, clinic.id));

      // 7. Seed initial Inventory Positions from existing Batches
      const batches = (await localDb
        .prepare('SELECT * FROM medicine_batches WHERE clinic_id = ?')
        .all(clinic.id));

      let batchesMigrated = 0;
      for (const b of batches as any[]) {
        const batchId = b.id || b._local_id;
        const medId = b.medicine_id;
        const qty = Number(b.quantity_remaining || 0);

        (await InventoryPositionService.getOrCreatePosition({
          organizationId,
          medicineId: medId,
          batchId,
          locationType: 'STORE',
          storeId,
          initialStock: qty,
        }));
        batchesMigrated++;
      }

      // 8. Assign existing clinic users to organization and store
      const clinicUsers = (await localDb
        .prepare('SELECT * FROM users WHERE clinic_id = ?')
        .all(clinic.id));

      for (const u of clinicUsers as any[]) {
        const userId = u.id || u._local_id;
        // User org access
        (await localDb
          .prepare(
            `INSERT OR IGNORE INTO user_organization_access (
               id, _local_id, user_id, organization_id, role, is_active, created_at, updated_at, _updated_at
             ) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)`
          )
          .run(uuidv4(), uuidv4(), userId, organizationId, u.role || 'OWNER', now, now, now));

        // User store access
        (await localDb
          .prepare(
            `INSERT OR IGNORE INTO user_store_access (
               id, _local_id, user_id, organization_id, store_id, role, is_default, is_active, created_at, updated_at, _updated_at
             ) VALUES (?, ?, ?, ?, ?, ?, 1, 1, ?, ?, ?)`
          )
          .run(uuidv4(), uuidv4(), userId, organizationId, storeId, u.role || 'OWNER', now, now, now));
      }

      return {
        clinicId: clinic.id,
        organizationId,
        storeId,
        counterId,
        terminalId,
        financialYearId,
        batchesMigrated,
        transactionsUpdated: batches.length,
      };
    });

    return (await migrationTx());
  }

  /**
   * Migrate all clinics in the database.
   */
  static async migrateAllClinics(): Promise<ClinicMigrationResult[]> {
    const clinics = (await localDb.prepare('SELECT id, _local_id FROM clinics').all());
    const results: ClinicMigrationResult[] = [];
    for (const c of clinics as any[]) {
      const cid = c.id || c._local_id;
      if (cid) {
        results.push((await this.migrateClinic(cid)));
      }
    }
    return results;
  }
}
