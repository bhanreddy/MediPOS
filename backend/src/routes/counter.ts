import { Router, type Request } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { transactionalRoute } from '../lib/transactionalRoute';
import { AppError } from '../lib/appError';
import { Money } from '../lib/money';
import { queryRaw } from '../lib/postgresDb';
import { createSaleSchema } from '../schemas/sale.schema';
import { allocateCloudSale } from '../services/cloudSaleAllocation';
import { discountLimit, requestDiscount } from '../services/counterDiscounts';
import { resolveCloudStoreContext } from '../services/cloudStoreContext';

export const counterRouter = Router();
counterRouter.use(requireAuth, requireRole('OWNER', 'PHARMACIST', 'CASHIER'));

async function counterScope(req: Request, requested?: string | null) {
  const user = req.user!;
  const { storeId } = await resolveCloudStoreContext(user.clinic_id!, { store_id: requested });
  if (!storeId) throw new AppError(409, 'Choose a store for this counter.');
  return { clinicId: user.clinic_id!, storeId, userId: user.id, role: user.role };
}

counterRouter.get('/discount-limit', transactionalRoute(async (req, res) => {
  const scope = await counterScope(req, typeof req.query.store_id === 'string' ? req.query.store_id : undefined);
  res.json({ data: { max_basis_points: await discountLimit(scope) } });
}));

counterRouter.get('/discount-employees', requireRole('OWNER'), transactionalRoute(async (req, res) => {
  const users = await queryRaw(
    `SELECT u.id, u.full_name, u.role, COALESCE(d.max_basis_points, 1500) AS max_basis_points
     FROM users u LEFT JOIN counter_discount_limits d ON d.clinic_id = u.clinic_id AND d.user_id = u.id
     WHERE u.clinic_id = ? AND u.role IN ('PHARMACIST','CASHIER') AND u.deleted_at IS NULL AND u.is_active
     ORDER BY u.full_name`, [req.user!.clinic_id],
  );
  res.json({ data: users });
}));

counterRouter.put('/discount-employees/:id', requireRole('OWNER'), transactionalRoute(async (req, res) => {
  const userId = z.string().uuid().parse(req.params.id);
  const input = z.object({ max_basis_points: z.number().int().min(0).max(10000) }).parse(req.body);
  const [employee] = await queryRaw(
    "SELECT id FROM users WHERE id = ? AND clinic_id = ? AND role IN ('CASHIER','PHARMACIST') AND deleted_at IS NULL",
    [userId, req.user!.clinic_id],
  );
  if (!employee) throw new AppError(404, 'Employee not found.');
  await queryRaw(
    `INSERT INTO counter_discount_limits (clinic_id, user_id, max_basis_points, updated_by)
     VALUES (?, ?, ?, ?) ON CONFLICT (clinic_id, user_id) DO UPDATE
     SET max_basis_points = excluded.max_basis_points, updated_by = excluded.updated_by, updated_at = now()`,
    [req.user!.clinic_id, userId, input.max_basis_points, req.user!.id],
  );
  res.json({ data: input });
}));

counterRouter.get('/discount-approvals', transactionalRoute(async (req, res) => {
  const scope = await counterScope(req, typeof req.query.store_id === 'string' ? req.query.store_id : undefined);
  const rows = await queryRaw(
    `SELECT d.id, d.cashier_id, d.checkout_request_id, d.discount_paise, d.reason, d.created_at,
            d.approved_at, d.sale_id, u.full_name AS cashier_name
     FROM counter_discount_requests d JOIN users u ON u.id = d.cashier_id
     WHERE d.clinic_id = ? AND d.store_id = ? AND (d.cashier_id = ? OR ? = 'OWNER')
       AND d.sale_id IS NULL AND d.created_at >= now() - interval '24 hours'
     ORDER BY d.created_at DESC LIMIT 100`,
    [scope.clinicId, scope.storeId, scope.userId, scope.role],
  );
  res.json({ data: rows });
}));

counterRouter.post('/discount-approvals', transactionalRoute(async (req, res) => {
  const input = createSaleSchema.parse(req.body);
  const requestId = z.string().uuid().parse(input._local_id);
  const reason = z.string().trim().min(1).max(400).parse(input.discount_reason);
  const scope = await counterScope(req, input.store_id);
  const items = await allocateCloudSale(input.items, scope.clinicId, scope.storeId, true, scope.role === 'PHARMACIST' && !!input.prescription_id);
  const totals = Money.calculateGrandTotal({
    items: items.map(item => ({
      quantity: item.quantity, unitPrice: item.mrp, discountPct: item.discount_pct, gstRate: item.gst_rate,
    })),
    billDiscount: input.discount, isBillDiscountPercentage: input.is_bill_discount_percentage, priceIncludesTax: true,
  });
  const approval = await requestDiscount(scope, requestId, reason, { ...input, ...totals, items });
  res.status(201).json({ data: approval });
}));

counterRouter.post('/discount-approvals/:id/approve', requireRole('OWNER'), transactionalRoute(async (req, res) => {
  const scope = await counterScope(req, req.body?.store_id);
  const id = z.string().uuid().parse(req.params.id);
  const [approval] = await queryRaw(
    `UPDATE counter_discount_requests SET approved_by = ?, approved_at = now()
     WHERE id = ? AND clinic_id = ? AND store_id = ? AND cashier_id <> ?
       AND sale_id IS NULL AND created_at >= now() - interval '24 hours' RETURNING id, approved_at`,
    [scope.userId, id, scope.clinicId, scope.storeId, scope.userId],
  );
  if (!approval) throw new AppError(404, 'Approval request not found.');
  res.json({ data: approval });
}));
