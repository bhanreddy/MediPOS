import { Router, type Request } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { transactionalRoute } from '../lib/transactionalRoute';
import { queryRaw } from '../lib/postgresDb';
import { AppError } from '../lib/appError';
import { resolveCloudStoreContext } from '../services/cloudStoreContext';
import { activeRegister, closeRegister, openRegister, recordCashMovement, registerReport } from '../services/cashRegister';

export const registerRouter = Router();
registerRouter.use(requireAuth, requireRole('OWNER', 'PHARMACIST', 'CASHIER'));

const paise = z.number().int().min(0).max(1_000_000_000);
const uuid = z.string().uuid();
const openBody = z.object({ opening_paise: paise, request_id: uuid });
const movementBody = z.object({
  request_id: uuid,
  kind: z.enum(['CASH_IN', 'CASH_OUT', 'DROP', 'EXPENSE']),
  amount_paise: paise.positive(),
  reason: z.string().trim().min(1).max(400),
});

async function scope(req: Request) {
  const actor = req.user!;
  const requested = req.body?.store_id ?? req.query.store_id;
  const { storeId } = await resolveCloudStoreContext(actor.clinic_id!, {
    store_id: requested === undefined ? undefined : uuid.parse(requested),
  });
  if (!storeId) throw new AppError(409, 'Choose a store to use the cash register.');
  return { clinicId: actor.clinic_id!, storeId, userId: actor.id, role: actor.role };
}

registerRouter.get('/active', transactionalRoute(async (req, res) => {
  const access = await scope(req);
  const session = await activeRegister(access, false);
  res.json({ data: session ?? null });
}));

registerRouter.post('/open', transactionalRoute(async (req, res) => {
  const input = openBody.parse(req.body);
  res.status(201).json({ data: await openRegister(await scope(req), input.request_id, input.opening_paise) });
}));

registerRouter.get('/history', transactionalRoute(async (req, res) => {
  const access = await scope(req);
  const history = await queryRaw(
    `SELECT id, opened_at, opened_by, closed_at, closed_by, opening_paise, closing_paise FROM cash_register_sessions
     WHERE clinic_id = ? AND store_id = ? AND (opened_by = ? OR ? = 'OWNER') ORDER BY opened_at DESC LIMIT 30`,
    [access.clinicId, access.storeId, access.userId, access.role],
  );
  res.json({ data: history });
}));

registerRouter.get('/:id/report', transactionalRoute(async (req, res) => {
  res.json({ data: await registerReport(await scope(req), uuid.parse(req.params.id)) });
}));

registerRouter.post('/:id/movements', transactionalRoute(async (req, res) => {
  res.status(201).json({
    data: await recordCashMovement(await scope(req), uuid.parse(req.params.id), movementBody.parse(req.body)),
  });
}));

registerRouter.post('/:id/close', transactionalRoute(async (req, res) => {
  const input = z.object({ closing_paise: paise }).parse(req.body);
  res.json({ data: await closeRegister(await scope(req), uuid.parse(req.params.id), input.closing_paise) });
}));
