import { CloudAuthService } from './cloudAuthService';
import { verifySubscriptionPayment } from './subscriptionApi';
import {
  matchesUserSubscriptionReturnPath,
  PHONEPE_SESSION_PAYMENT_ERROR,
  PHONEPE_SESSION_PENDING_USER,
} from '../payment/phonePePG';

/**
 * After PhonePe redirects back to the SPA, confirm payment server-side and open the POS session.
 */
export async function tryCompletePhonePeReturn(): Promise<void> {
  if (!matchesUserSubscriptionReturnPath(window.location.pathname || '')) return;

  const moid = sessionStorage.getItem(PHONEPE_SESSION_PENDING_USER);
  if (!moid) {
    window.history.replaceState({}, '', '/');
    return;
  }

  try {
    const verified = await verifySubscriptionPayment({ merchant_order_id: moid });
    await CloudAuthService.onPaymentVerified({
      plan: verified.plan,
      expiresAt: verified.expires_at,
    });
    sessionStorage.removeItem(PHONEPE_SESSION_PENDING_USER);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Payment verification failed';
    sessionStorage.setItem(PHONEPE_SESSION_PAYMENT_ERROR, msg);
    sessionStorage.removeItem(PHONEPE_SESSION_PENDING_USER);
  } finally {
    window.history.replaceState({}, '', '/');
  }
}
