import { Router } from 'express';
import { businessDb as localDb } from '../lib/businessDb';
import { requireRole } from '../middleware/rbac';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { PatientMedicationHistoryService } from '../services/prescription/patientMedicationHistoryService';
import { PatientAllergyService } from '../services/prescription/pharmacySafetyEngine';
import { AppError } from '../lib/appError';

export const patientsRouter = Router();

patientsRouter.use(requireAuth,requireRole('OWNER','PHARMACIST','SUPER_ADMIN'));
patientsRouter.param('id', async (req, _res, next, id) => {
  try {
    const patient = (await localDb.prepare('SELECT id FROM customers WHERE (id = ? OR _local_id = ?) AND (organization_id = ? OR clinic_id = ?) AND (clinic_id = ? OR (? = 1 AND clinic_id IS NULL)) AND _deleted = 0').get(id,id,(await organizationId(req)),req.user!.clinic_id,req.user!.clinic_id,process.env.DATABASE_URL ? 0 : 1)) as {id:string} | undefined;
    if (!patient) throw new AppError(404, 'Patient not found');
    req.params.id = patient.id;
    next();
  } catch (error) { next(error); }
});
async function organizationId(req: any): Promise<string> {
  if (!req.user?.clinic_id) throw new AppError(403, 'No clinic assigned');
  const clinic = (await localDb.prepare('SELECT organization_id FROM clinics WHERE id = ? OR _local_id = ?').get(req.user.clinic_id, req.user.clinic_id)) as { organization_id?: string } | undefined;
  return clinic?.organization_id || req.user.clinic_id;
}

patientsRouter.get('/:id/medication-history', async (req, res, next) => {
  try {
    const history = (await PatientMedicationHistoryService.getPatientHistory(req.params.id, (await organizationId(req))));
    res.json({ success: true, data: history });
  } catch (err) {
    next(err);
  }
});

patientsRouter.get('/:id/allergies', async (req, res, next) => {
  try {
    const allergies = (await PatientAllergyService.getPatientAllergies(req.params.id, (await organizationId(req))));
    res.json({ success: true, data: allergies });
  } catch (err) {
    next(err);
  }
});

patientsRouter.post('/:id/allergies', requireRole('OWNER', 'PHARMACIST', 'SUPER_ADMIN'), async (req, res, next) => {
  try {
    const { allergen, allergen_type, reaction_text, severity } = z.object({ allergen: z.string().trim().min(1).max(200), allergen_type: z.enum(['INGREDIENT', 'DRUG_CLASS', 'FOOD', 'OTHER']).optional(), reaction_text: z.string().max(2000).optional(), severity: z.enum(['MILD', 'MODERATE', 'SEVERE', 'ANAPHYLAXIS']).optional() }).parse(req.body);
    const patient = (await localDb.prepare('SELECT id FROM customers WHERE (id = ? OR _local_id = ?) AND (organization_id = ? OR clinic_id = ?) AND (clinic_id = ? OR (? = 1 AND clinic_id IS NULL)) AND _deleted = 0').get(req.params.id, req.params.id, (await organizationId(req)), req.user!.clinic_id,req.user!.clinic_id,process.env.DATABASE_URL ? 0 : 1));
    if (!patient) throw new AppError(404, 'Patient not found');
    if (!allergen) {
      throw new AppError(400, 'Allergen string is required', 'MISSING_ALLERGEN');
    }

    const allergy = (await PatientAllergyService.recordAllergy({
      organizationId: (await organizationId(req)),
      patientId: req.params.id,
      allergen,
      allergenType: allergen_type,
      reactionText: reaction_text,
      severity,
      recordedBy: req.user?.id,
    }));

    res.status(201).json({ success: true, data: allergy });
  } catch (err) {
    next(err);
  }
});
