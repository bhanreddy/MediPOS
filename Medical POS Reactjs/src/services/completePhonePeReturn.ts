import { CloudAuthService } from './cloudAuthService';
import { verifySubscriptionPayment } from './subscriptionApi';

const PENDING_KEY = 'medpos_phonepe_merchant_order';

function matchesReturnPath(pathname: string): boolean {
  const configured = (import.meta.env.VITE_PHONEPE_RETURN_PATH as string | undefined) || '/payment-return';
  const normalized = configured.startsWith('/') ? configured : `/${configured}`;
  return pathname === normalized || pathname.endsWith(normalized);
}

/**
 * After PhonePe redirects back to the SPA, confirm payment server-side and open the POS session.
 */
export async function tryCompletePhonePeReturn(): Promise<void> {
  if (!matchesReturnPath(window.location.pathname || '')) return;

  const moid = sessionStorage.getItem(PENDING_KEY);
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
    sessionStorage.removeItem(PENDING_KEY);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Payment verification failed';
    sessionStorage.setItem('medpos_payment_error', msg);
    sessionStorage.removeItem(PENDING_KEY);
  } finally {
    window.history.replaceState({}, '', '/');
  }
}
