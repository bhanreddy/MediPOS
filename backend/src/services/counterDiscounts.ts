import { createHash } from 'node:crypto';
import { AppError } from '../lib/appError';
import { queryRaw } from '../lib/postgresDb';
import { Money } from '../lib/money';

interface DiscountScope {
  clinicId: string;
  storeId: string | null;
  userId: string;
  role: string;
}

interface DiscountLine {
  medicine_id: string;
  batch_id?: string;
  quantity: number;
  mrp: number;
  discount_pct: number;
  gst_rate: number;
}

export interface DiscountContext {
  items: DiscountLine[];
  discount: number;
  is_bill_discount_percentage: boolean;
  customer_id?: string | null;
  totalDiscount: number;
  subtotal: number;
}

function discountIdentity(context: DiscountContext) {
  const amount = Money.toPaise(context.totalDiscount);
  const base = Money.toPaise(context.subtotal);
  const items = context.items.map(item => ({
    medicine: item.medicine_id,
    batch: item.batch_id,
    quantity: item.quantity,
    price: Money.toPaise(item.mrp),
    discount: item.discount_pct,
    gst: item.gst_rate,
  }));
  return {
    amount,
    base,
    fingerprint: createHash('sha256').update(JSON.stringify({
      items, amount, base, customer: context.customer_id ?? null,
      billDiscount: context.discount, percentage: context.is_bill_discount_percentage,
    })).digest('hex'),
  };
}

export async function discountLimit(scope: DiscountScope) {
  if (scope.role === 'OWNER') return 10000;
  const [limit] = await queryRaw(
    'SELECT max_basis_points FROM counter_discount_limits WHERE clinic_id = ? AND user_id = ?',
    [scope.clinicId, scope.userId],
  );
  return Number(limit?.max_basis_points ?? 1500);
}

export async function requestDiscount(scope: DiscountScope, requestId: string, reason: string, context: DiscountContext) {
  const { fingerprint, amount } = discountIdentity(context);
  if (amount <= 0 || !scope.storeId) throw new AppError(400, 'Choose a store and enter a discount to request approval.');
  const [approval] = await queryRaw(
    `INSERT INTO counter_discount_requests (clinic_id, store_id, cashier_id, checkout_request_id, fingerprint, discount_paise, reason)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (clinic_id, cashier_id, checkout_request_id, fingerprint)
     DO UPDATE SET reason = counter_discount_requests.reason RETURNING *`,
    [scope.clinicId, scope.storeId, scope.userId, requestId, fingerprint, amount, reason],
  );
  if (approval.reason !== reason || approval.store_id !== scope.storeId) {
    throw new AppError(409, 'This discount request was already submitted. Change the cart or start a new request.');
  }
  return approval;
}

export async function enforceDiscount(
  scope: DiscountScope, context: DiscountContext,
  options: { checkoutId?: string; approvalId?: string; reason?: string; reasonRequired?: boolean },
) {
  const { amount, base, fingerprint } = discountIdentity(context);
  if (!amount) return null;
  const limit = await discountLimit(scope);
  if (amount * 10000 <= base * limit) {
    if (options.reasonRequired && !options.reason) throw new AppError(400, 'Enter a reason for the discount.', 'DISCOUNT_REASON_REQUIRED');
    return { amount, reason: options.reason ?? 'Discount within employee limit', approval: null };
  }
  if (!options.approvalId || !options.checkoutId) {
    throw new AppError(403, 'Ask an owner to approve this discount.', 'DISCOUNT_APPROVAL_REQUIRED');
  }
  const [approval] = await queryRaw(
    `SELECT * FROM counter_discount_requests WHERE id = ? AND clinic_id = ? AND store_id = ?
     AND cashier_id = ? AND checkout_request_id::text = ? AND fingerprint = ?
     AND approved_at >= now() - interval '15 minutes' AND sale_id IS NULL FOR UPDATE`,
    [options.approvalId, scope.clinicId, scope.storeId, scope.userId, options.checkoutId, fingerprint],
  );
  if (!approval) throw new AppError(403, 'The approval does not match this bill or has expired.', 'DISCOUNT_APPROVAL_REQUIRED');
  return { amount, reason: approval.reason as string, approval };
}

export async function recordCounterAudit(
  scope: DiscountScope, saleId: string,
  discount: Awaited<ReturnType<typeof enforceDiscount>>,
  manualBatches: DiscountLine[],
) {
  if (discount) {
    if (discount.approval) {
      await queryRaw('UPDATE counter_discount_requests SET sale_id = ? WHERE id = ?', [saleId, discount.approval.id]);
    }
    await queryRaw(
      `INSERT INTO counter_sale_audit (clinic_id, sale_id, actor_id, action, details)
       VALUES (?, ?, ?, 'DISCOUNT', ?::text::jsonb)`,
      [scope.clinicId, saleId, scope.userId, JSON.stringify({
        discount_paise: discount.amount, reason: discount.reason, approval_id: discount.approval?.id,
        approved_by: discount.approval?.approved_by,
      })],
    );
  }
  if (manualBatches.length) {
    await queryRaw(
      `INSERT INTO counter_sale_audit (clinic_id, sale_id, actor_id, action, details)
       VALUES (?, ?, ?, 'MANUAL_BATCH', ?::text::jsonb)`,
      [scope.clinicId, saleId, scope.userId, JSON.stringify(manualBatches.map(item => ({
        medicine_id: item.medicine_id, batch_id: item.batch_id, quantity: item.quantity,
      })))],
    );
  }
}
