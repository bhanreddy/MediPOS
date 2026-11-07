import { PatientAllergyService } from './prescription/pharmacySafetyEngine';
import { AppError } from '../lib/appError';
import { queryRaw } from '../lib/postgresDb';

export interface DispensingInput {
  prescription_id?: string;
  dispensing_attestation?: {
    signed_original_checked: true;
    annotated_and_signed: true;
    prescription_register?: string;
    h1_register?: string;
    x_register_page?: string;
    x_duplicate_reference?: string;
  };
}

interface DispensingScope {
  clinicId: string;
  storeId: string | null;
  organizationId: string | null;
  actorId: string;
  role: string;
  customerId?: string | null;
}

interface DispensingLine {
  medicine_id: string;
  batch_id?: string;
  quantity: number;
}

const failure = (message: string) => new AppError(409, message, 'RESTRICTED_DISPENSING_BLOCKED');

export async function verifyRegulatedDispensing(scope: DispensingScope, input: DispensingInput, items: DispensingLine[]) {
  const medicineIds = [...new Set(items.map(item => item.medicine_id))];
  const products = await queryRaw(
    `SELECT id, name, composition, manufacturer, CASE
       WHEN schedule_classification = 'SCHEDULE_X' THEN 'SCHEDULE_X'
       WHEN schedule_classification = 'NARCOTIC' THEN 'BLOCKED'
       WHEN schedule_classification = 'SCHEDULE_H1' OR is_schedule_h1 THEN 'SCHEDULE_H1'
       WHEN schedule_classification = 'SCHEDULE_H' THEN 'SCHEDULE_H'
       WHEN COALESCE(schedule_classification, 'NONE') <> 'NONE' THEN 'BLOCKED'
       WHEN prescription_required THEN 'PRESCRIPTION' ELSE 'NONE'
     END AS classification
     FROM medicines WHERE clinic_id = ? AND id = ANY(?::uuid[])`,
    [scope.clinicId, medicineIds],
  );
  const restricted = products.filter(product => product.classification !== 'NONE');
  if (!restricted.length) return null;
  if (restricted.some(product => product.classification === 'BLOCKED')) throw failure('This classification requires a separate dispensing workflow.');

  if (!scope.storeId || !scope.organizationId || scope.role !== 'PHARMACIST' || !scope.customerId || !input.prescription_id) {
    throw failure('A registered pharmacist must select the patient and a verified prescription for this medicine.');
  }
  const [registration] = await queryRaw(
    `SELECT pr.registration_number, pr.registration_authority, u.full_name
     FROM pharmacy_registrations pr JOIN users u ON u.id = pr.user_id
     WHERE pr.store_id = ? AND u.id = ? AND u.clinic_id = ? AND u.role = 'PHARMACIST' AND u.is_active
       AND u.deleted_at IS NULL AND pr.active AND (pr.valid_until IS NULL OR pr.valid_until >= (now() AT TIME ZONE 'Asia/Kolkata')::date)
     FOR SHARE OF pr, u`, [scope.storeId, scope.actorId, scope.clinicId],
  );
  const [settings] = await queryRaw(
    `SELECT p.*, COALESCE(s.display_name, s.name) AS pharmacy_name, COALESCE(NULLIF(s.address,''), c.address) AS address,
            COALESCE(NULLIF(s.drug_licence_number,''), c.drug_licence_number) AS drug_licence
     FROM pharmacy_dispensing_settings p JOIN stores s ON s.id = p.store_id JOIN clinics c ON c.id = p.clinic_id
     WHERE p.store_id = ? AND p.clinic_id = ? FOR SHARE OF p`, [scope.storeId, scope.clinicId],
  );
  if (!registration || !settings?.enabled || !settings.address?.trim() || !settings.drug_licence?.trim()) {
    throw failure('Complete the store dispensing setup and pharmacist registration before dispensing.');
  }

  const [rx] = await queryRaw(
    `SELECT rx.*, COALESCE(rx.doctor_address_snapshot, d.address) AS prescriber_address, c.name AS patient_name, c.address AS patient_address,
            u.full_name AS verified_by_name, (doc.storage_key IS NOT NULL AND encode(sha256(doc.content), 'hex') = rx.document_hash) AS has_document
     FROM prescriptions rx
     JOIN customers c ON c.id = rx.patient_id AND c.clinic_id = ? AND c.deleted_at IS NULL
     JOIN users u ON u.id = rx.verified_by AND u.clinic_id = c.clinic_id AND u.role = 'PHARMACIST'
     JOIN pharmacy_registrations verifier ON verifier.user_id = u.id AND verifier.store_id = ? AND verifier.active
       AND (verifier.valid_until IS NULL OR verifier.valid_until >= (now() AT TIME ZONE 'Asia/Kolkata')::date)
     LEFT JOIN doctors d ON d.id = rx.doctor_id AND d.organization_id = rx.organization_id AND d.active
     LEFT JOIN app_prescription_documents doc ON doc.storage_key = rx.document_url
     WHERE rx.id = ? AND rx.organization_id = ? AND c.id = ? AND rx.deleted_at IS NULL
       AND (rx.store_id IS NULL OR rx.store_id = ?)
       AND rx.verification_status = 'VERIFIED' AND rx.status = 'VERIFIED'
       AND rx.written_date <= (now() AT TIME ZONE 'Asia/Kolkata')::date AND rx.valid_from <= now()
       AND (rx.valid_until IS NULL OR rx.valid_until >= now())
     FOR UPDATE OF rx`,
    [scope.clinicId, scope.storeId, input.prescription_id, scope.organizationId, scope.customerId, scope.storeId],
  );
  if (!rx || !rx.has_document || !rx.document_hash || !rx.prescriber_address?.trim()
    || !rx.doctor_name_snapshot?.trim() || !rx.doctor_registration_number_snapshot?.trim()
    || !rx.patient_name?.trim() || !rx.patient_address?.trim()) {
    throw failure('The verified prescription needs its signed document, prescriber registration and address, and the patient’s name and address.');
  }
  await queryRaw('SELECT pg_advisory_xact_lock(hashtextextended(?, 0))', [`regulated-rx:${scope.clinicId}:${rx.document_hash}`]);
  const [used] = await queryRaw(
    `SELECT 1 FROM regulated_dispensing WHERE clinic_id = ? AND (prescription_id = ? OR signed_rx_hash = ?)
     UNION ALL SELECT 1 FROM dispensing_events WHERE prescription_id = ? LIMIT 1`,
    [scope.clinicId, rx.id, rx.document_hash, rx.id],
  );
  if (used) throw failure('This prescription has already been dispensed. A new verified prescription is required.');

  const prescriptionItems = await queryRaw(
    'SELECT * FROM prescription_items WHERE prescription_id = ? AND deleted_at IS NULL ORDER BY id FOR UPDATE', [rx.id],
  );
  const attestation = input.dispensing_attestation;
  const hasX = restricted.some(product => product.classification === 'SCHEDULE_X');
  const hasH1 = restricted.some(product => product.classification === 'SCHEDULE_H1');
  if (!attestation || (restricted.some(product => product.classification !== 'SCHEDULE_X') && !attestation.prescription_register)
    || (hasH1 && !attestation.h1_register)) {
    throw failure('Check the signed original and enter the signed prescription register references before dispensing.');
  }
  if (hasX && (!settings.schedule_x_licence?.trim() || !settings.schedule_x_secure_storage
    || !attestation.x_register_page || !attestation.x_duplicate_reference || !rx.external_rx_number
    || restricted.filter(product => product.classification === 'SCHEDULE_X').length > 1)) {
    throw failure('Schedule X requires Form 20F, secured stock, a numbered prescription, its retained duplicate and a physical register page for one drug.');
  }
  const batchIds = items.filter(item => restricted.some(product => product.id === item.medicine_id)).map(item => item.batch_id);
  const batches = await queryRaw(
    `SELECT b.id, b.batch_number, b.expiry_date, b.quantity_in, p.invoice_number AS purchase_invoice,
            p.created_at AS purchase_date, v.name AS supplier_name, v.address AS supplier_address,
            v.drug_licence_number AS supplier_licence
     FROM medicine_batches b LEFT JOIN purchases p ON p.id = b.purchase_id AND p.clinic_id = b.clinic_id
     LEFT JOIN suppliers v ON v.id = b.supplier_id AND v.clinic_id = b.clinic_id
     WHERE b.clinic_id = ? AND b.id = ANY(?::uuid[])`, [scope.clinicId, batchIds],
  );
  const authorized = new Map<string, { product: Record<string, any>; rxItem: Record<string, any> }>();
  for (const product of restricted) {
    const matches = prescriptionItems.filter(item => item.matched_product_id === product.id);
    const quantity = items.filter(item => item.medicine_id === product.id).reduce((sum, item) => sum + item.quantity, 0);
    const rxItem = matches[0];
    if (matches.length !== 1 || !rxItem.dose_text?.trim() || Number(rxItem.dispensed_quantity) > 0
      || Number(rxItem.prescribed_quantity) < quantity || !product.manufacturer?.trim()) {
      throw failure(`Verify the exact preparation, dose, quantity and manufacturer for ${product.name}.`);
    }
    const allergy = await PatientAllergyService.checkAllergyMatch({
      patientId: rx.patient_id, medicineName: product.name, composition: product.composition,
    });
    if (allergy.hasMatch) throw failure('The patient has a recorded allergy match. Review the prescription with the prescriber.');
    authorized.set(product.id, { product, rxItem });
  }
  for (const item of items) {
    if (authorized.get(item.medicine_id)?.product.classification !== 'SCHEDULE_X') continue;
    const batch = batches.find(row => row.id === item.batch_id);
    if (!batch?.purchase_invoice || !batch.supplier_name?.trim() || !batch.supplier_address?.trim() || !batch.supplier_licence?.trim()) {
      throw failure('Schedule X stock must trace to its inward invoice and licensed supplier before dispensing.');
    }
  }
  return { registration, settings, rx, attestation, authorized, batches };
}

export async function recordRegulatedDispensing(
  scope: DispensingScope, saleId: string, items: Array<DispensingLine & { id: string }>,
  verification: NonNullable<Awaited<ReturnType<typeof verifyRegulatedDispensing>>>,
) {
  const { rx, registration, settings, attestation, authorized, batches } = verification;
  const evidence = {
    patient_name: rx.patient_name, patient_address: rx.patient_address,
    prescriber_name: rx.doctor_name_snapshot, prescriber_address: rx.prescriber_address,
    prescriber_registration: rx.doctor_registration_number_snapshot,
    prescription_number: rx.external_rx_number || rx.prescription_number,
    prescribed_at: rx.written_date, verified_by: rx.verified_by, verified_by_name: rx.verified_by_name,
    pharmacist_name: registration.full_name, pharmacist_registration: registration.registration_number,
    pharmacist_authority: registration.registration_authority,
    pharmacy_name: settings.pharmacy_name, pharmacy_address: settings.address, drug_licence: settings.drug_licence,
    schedule_x_licence: settings.schedule_x_licence, ...attestation,
  };
  const reference = [attestation.prescription_register, attestation.h1_register, attestation.x_register_page, rx.id].filter(Boolean).join(' / ');
  const [record] = await queryRaw(
    `INSERT INTO regulated_dispensing (clinic_id, store_id, sale_id, prescription_id, pharmacist_id, patient_id,
       physical_register_reference, signed_rx_hash, document_key, evidence)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?::text::jsonb) RETURNING id`,
    [scope.clinicId, scope.storeId, saleId, rx.id, scope.actorId, rx.patient_id, reference, rx.document_hash, rx.document_url, JSON.stringify(evidence)],
  );
  const quantities = new Map<string, number>();
  for (const item of items) {
    const match = authorized.get(item.medicine_id);
    if (!match) continue;
    const batch = batches.find(candidate => candidate.id === item.batch_id);
    const { product, rxItem } = match;
    await queryRaw(
      `INSERT INTO regulated_dispensing_lines (sale_item_id, dispensing_id, prescription_item_id, classification,
        medicine_id, batch_id, quantity, evidence, retain_at_least_until)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?::text::jsonb,
          ((now() AT TIME ZONE 'Asia/Kolkata')::date + make_interval(years => ?::int))::date)`,
      [item.id, record.id, rxItem.id, product.classification, item.medicine_id, item.batch_id, item.quantity,
        JSON.stringify({ ...batch, medicine_name: product.name, manufacturer: product.manufacturer, prescribed_dose: rxItem.dose_text }),
        product.classification === 'SCHEDULE_H1' ? 3 : 2],
    );
    await queryRaw(
      `INSERT INTO dispensing_events (organization_id, store_id, prescription_id, prescription_item_id,
         sale_id, sale_item_id, product_id, batch_id, quantity_dispensed, dispensed_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [scope.organizationId, scope.storeId, rx.id, rxItem.id, saleId, item.id, item.medicine_id, item.batch_id, item.quantity, scope.actorId],
    );
    quantities.set(rxItem.id, (quantities.get(rxItem.id) ?? 0) + item.quantity);
  }
  for (const [id, quantity] of quantities) {
    await queryRaw('UPDATE prescription_items SET dispensed_quantity = dispensed_quantity + ?, updated_at = now() WHERE id = ?', [quantity, id]);
  }
  await queryRaw("UPDATE prescriptions SET status = 'DISPENSED', updated_at = now() WHERE id = ?", [rx.id]);
}
