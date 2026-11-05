import { z } from 'zod';
import { AppError } from '../lib/appError';
import { localInsertMany, queryRaw, withPostgresTransaction } from '../lib/postgresDb';
import { medicineImportRowSchema } from '../schemas/medicineImport.schema';
import { importIdentity } from '../lib/importIdentity';

export async function importMedicines(input: unknown, clinicId: string) {
  const rows = z.array(medicineImportRowSchema).min(1).max(5000).parse(input);
  const entries = rows.map((row, index) => {
    // Canonical field order makes a retry independent of JSON property ordering.
    const canonical = JSON.stringify(Object.keys(row).sort().map(key => [key, row[key as keyof typeof row]]));
    return { row, index, key: importIdentity(clinicId, `medicine:${canonical}`) };
  });

  return withPostgresTransaction(async () => {
    // Serialize concurrent imports for this clinic, including duplicate/retry checks.
    await queryRaw('SELECT pg_advisory_xact_lock(hashtext(?), hashtext(?))', ['medicine-import', clinicId]);
    const placeholders = entries.map(() => '?').join(',');
    const existing = await queryRaw<{ _local_id: string; deleted_at: string | null }>(
      `SELECT _local_id, deleted_at FROM medicines WHERE clinic_id = ? AND _local_id IN (${placeholders})`,
      [clinicId, ...entries.map(entry => entry.key)],
    );
    const prior = new Map(existing.map(row => [row._local_id, row]));
    const barcodes = [...new Set(entries.flatMap(({ row }) => [row.barcode, row.primary_barcode]).filter((value): value is string => Boolean(value)))];
    const owners = new Map<string, string>();
    if (barcodes.length) {
      const marks = barcodes.map(() => '?').join(',');
      const matches = await queryRaw<{ barcode: string | null; primary_barcode: string | null; _local_id: string }>(
        `SELECT barcode, primary_barcode, _local_id FROM medicines WHERE clinic_id = ? AND deleted_at IS NULL AND (barcode IN (${marks}) OR primary_barcode IN (${marks}))`,
        [clinicId, ...barcodes, ...barcodes],
      );
      for (const match of matches) {
        for (const code of [match.barcode, match.primary_barcode]) if (code) owners.set(code, match._local_id);
      }
    }
    const pending = new Map<string, Record<string, unknown>>();
    for (const { row, index, key } of entries) {
      if (prior.has(key)) {
        if (prior.get(key)!.deleted_at) throw new AppError(409, `Row ${index + 2}: this previously imported medicine was deleted. Restore it or use Add medicine.`, 'IMPORT_DELETED_MEDICINE');
        continue;
      }
      for (const barcode of [row.barcode, row.primary_barcode]) {
        if (!barcode) continue;
        if (owners.has(barcode) && owners.get(barcode) !== key) {
          throw new AppError(409, `Row ${index + 2}: barcode ${barcode} already belongs to another medicine. No rows were imported.`, 'IMPORT_BARCODE_CONFLICT');
        }
        owners.set(barcode, key);
      }
      pending.set(key, { ...row, clinic_id: clinicId, is_active: true, id: key, _local_id: key });
    }
    const inserts = [...pending.values()];
    // Bounded batches avoid thousands of sequential database round trips.
    for (let offset = 0; offset < inserts.length; offset += 200) {
      await localInsertMany('medicines', inserts.slice(offset, offset + 200));
    }
    return { success: inserts.length, skipped: rows.length - inserts.length, failed: 0, errors: [] };
  });
}
