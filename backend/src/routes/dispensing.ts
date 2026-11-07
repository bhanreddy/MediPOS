import { Router, type Request } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { transactionalRoute } from '../lib/transactionalRoute';
import { AppError } from '../lib/appError';
import { queryRaw } from '../lib/postgresDb';
import { resolveCloudStoreContext } from '../services/cloudStoreContext';

export const dispensingRouter = Router();
dispensingRouter.use(requireAuth);

async function scope(req: Request, requested?: unknown) {
  const clinicId = req.user!.clinic_id!;
  const { storeId, organizationId } = await resolveCloudStoreContext(clinicId, {
    store_id: z.string().uuid().optional().parse(requested),
  });
  if (!storeId || !organizationId) throw new AppError(409, 'Choose a pharmacy store.');
  return { clinicId, storeId, organizationId };
}

dispensingRouter.get('/setup', requireRole('OWNER'), transactionalRoute(async (req, res) => {
  const { clinicId, storeId } = await scope(req, req.query.store_id);
  const [settings] = await queryRaw('SELECT * FROM pharmacy_dispensing_settings WHERE clinic_id = ? AND store_id = ?', [clinicId, storeId]);
  const pharmacists = await queryRaw(
    `SELECT u.id, u.full_name, r.registration_number, r.registration_authority, r.active, r.valid_until
     FROM users u JOIN user_store_access a ON a.user_id = u.id AND a.store_id = ? AND a.is_active AND a.deleted_at IS NULL
     LEFT JOIN pharmacy_registrations r ON r.user_id = u.id AND r.store_id = a.store_id
     WHERE u.clinic_id = ? AND u.role = 'PHARMACIST' AND u.is_active AND u.deleted_at IS NULL
     ORDER BY u.full_name`, [storeId, clinicId],
  );
  res.json({ data: { settings: settings ?? null, pharmacists } });
}));

dispensingRouter.put('/setup', requireRole('OWNER'), transactionalRoute(async (req, res) => {
  const input = z.object({
    store_id: z.string().uuid().optional(),
    enabled: z.boolean(),
    physical_records_confirmed: z.boolean(),
    schedule_x_licence: z.string().trim().min(1).max(100).nullable().optional(),
    schedule_x_secure_storage: z.boolean().default(false),
  }).parse(req.body);
  if (input.enabled && !input.physical_records_confirmed) throw new AppError(400, 'Confirm the licensed premises, pharmacist signatures and physical registers first.');
  if (input.schedule_x_secure_storage && !input.schedule_x_licence) throw new AppError(400, 'Record the Form 20F licence before enabling Schedule X.');
  const { clinicId, storeId } = await scope(req, input.store_id);
  const [settings] = await queryRaw(
    `INSERT INTO pharmacy_dispensing_settings (store_id, clinic_id, enabled, schedule_x_licence, schedule_x_secure_storage, changed_by)
     VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (store_id) DO UPDATE SET
       enabled = excluded.enabled, schedule_x_licence = excluded.schedule_x_licence,
       schedule_x_secure_storage = excluded.schedule_x_secure_storage, changed_by = excluded.changed_by, updated_at = now()
     RETURNING *`, [storeId, clinicId, input.enabled, input.schedule_x_licence ?? null, input.schedule_x_secure_storage, req.user!.id],
  );
  res.json({ data: settings });
}));

dispensingRouter.put('/pharmacists/:id', requireRole('OWNER'), transactionalRoute(async (req, res) => {
  const input = z.object({
    store_id: z.string().uuid().optional(),
    registration_number: z.string().trim().min(1).max(100),
    registration_authority: z.string().trim().min(1).max(150),
    valid_until: z.string().date().nullable().optional(),
    active: z.boolean(),
    verified_original: z.literal(true),
  }).parse(req.body);
  const userId = z.string().uuid().parse(req.params.id);
  const { clinicId, storeId } = await scope(req, input.store_id);
  const [user] = await queryRaw(
    `SELECT u.id FROM users u JOIN user_store_access a ON a.user_id = u.id AND a.store_id = ?
     WHERE u.id = ? AND u.clinic_id = ? AND u.role = 'PHARMACIST' AND u.is_active AND u.deleted_at IS NULL
       AND a.is_active AND a.deleted_at IS NULL`, [storeId, userId, clinicId],
  );
  if (!user) throw new AppError(404, 'Pharmacist not found at this store.');
  const [record] = await queryRaw(
    `INSERT INTO pharmacy_registrations (store_id, user_id, registration_number, registration_authority, valid_until, active, verified_by)
     VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT (store_id, user_id) DO UPDATE SET
       registration_number = excluded.registration_number, registration_authority = excluded.registration_authority,
       valid_until = excluded.valid_until, active = excluded.active, verified_by = excluded.verified_by, updated_at = now()
     RETURNING *`,
    [storeId, userId, input.registration_number, input.registration_authority, input.valid_until ?? null, input.active, req.user!.id],
  );
  res.json({ data: record });
}));

dispensingRouter.get('/prescriptions', requireRole('PHARMACIST'), transactionalRoute(async (req, res) => {
  const { clinicId, storeId, organizationId } = await scope(req, req.query.store_id);
  const patient = z.string().uuid().parse(req.query.patient_id);
  const data = await queryRaw(
    `SELECT rx.id, rx.prescription_number, rx.external_rx_number, rx.doctor_name_snapshot, rx.prescribed_at
     FROM prescriptions rx JOIN customers c ON c.id = rx.patient_id AND c.clinic_id = ?
     WHERE rx.organization_id = ? AND c.id = ? AND (rx.store_id = ? OR rx.store_id IS NULL)
       AND rx.deleted_at IS NULL AND rx.status = 'VERIFIED' AND rx.verification_status = 'VERIFIED'
       AND (rx.valid_until IS NULL OR rx.valid_until >= now()) AND rx.document_hash IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM regulated_dispensing used WHERE used.prescription_id = rx.id)
     ORDER BY rx.prescribed_at DESC LIMIT 50`, [clinicId, organizationId, patient, storeId],
  );
  res.json({ data });
}));
