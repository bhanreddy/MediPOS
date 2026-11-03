import { CloudAuthService } from './cloudAuthService';
import { verifySubscriptionPayment } from './subscriptionApi';
import {
  matchesUserSubscriptionReturnPath,
  PHONEPE_SESSION_PAYMENT_ERROR,
  PHONEPE_SESSION_PENDING_USER,
  readMerchantOrderIdFromSearchParams,
} from '../payment/phonePePG';

const pending = new Map<string, Promise<void>>();
/** Share verification while React mounts twice or multiple views await the same order. */
export function verifyPaymentOnce(orderId: string): Promise<void> {
  const current = pending.get(orderId);
  if (current) return current;
  const attempt = verifySubscriptionPayment({ merchant_order_id: orderId }).then(async verified => {
    await CloudAuthService.onPaymentVerified({ plan: verified.plan, expiresAt: verified.expires_at });
  });
  pending.set(orderId, attempt);
  void attempt.finally(() => { if (pending.get(orderId) === attempt) pending.delete(orderId); }).catch(() => {});
  return attempt;
}

/**
 * After PhonePe redirects back to the SPA, confirm payment server-side and open the POS session.
 */
export async function tryCompletePhonePeReturn(): Promise<void> {
  if (!matchesUserSubscriptionReturnPath(window.location.pathname || '')) return;

  const moid = readMerchantOrderIdFromSearchParams(window.location.search) || sessionStorage.getItem(PHONEPE_SESSION_PENDING_USER);
  if (!moid) return;
  sessionStorage.setItem(PHONEPE_SESSION_PENDING_USER, moid);

  try {
    await verifyPaymentOnce(moid);
    sessionStorage.removeItem(PHONEPE_SESSION_PENDING_USER);
    sessionStorage.removeItem(PHONEPE_SESSION_PAYMENT_ERROR);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Payment verification failed';
    sessionStorage.setItem(PHONEPE_SESSION_PAYMENT_ERROR, msg);
    throw e;
  }
}
