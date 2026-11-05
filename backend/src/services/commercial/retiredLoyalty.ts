import type { RequestHandler } from 'express';
import { AppError } from '../../lib/appError';

export function assertNoLegacyLoyalty(credits: unknown): void {
  if (credits !== undefined && credits !== null && Number(credits) !== 0) {
    throw new AppError(410, 'Loyalty points have been removed. Use Nex Coins instead.', 'LOYALTY_REMOVED');
  }
}

/** Reject stale checkout/order requests before any business data is changed. */
export const rejectLegacyLoyalty: RequestHandler = (req, _res, next) => {
  try {
    assertNoLegacyLoyalty(req.body?.redeem_loyalty_credits);
    if (Array.isArray(req.body?.payments) && req.body.payments.some(
      (payment: { tender_type?: unknown } | null) => String(payment?.tender_type).toUpperCase() === 'LOYALTY',
    )) {
      throw new AppError(410, 'Loyalty payments have been removed. Use Nex Coins instead.', 'LOYALTY_REMOVED');
    }
    next();
  } catch (error) { next(error); }
};
