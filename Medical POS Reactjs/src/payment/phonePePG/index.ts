/**
 * PhonePe Payment Gateway — browser-side helpers for Standard Checkout return handling
 * and shared session keys. Server calls OAuth/pay/status on backend or Supabase Edge.
 *
 * @see https://developer.phonepe.com/payment-gateway/website-integration/standard-checkout/
 */

export {
  PHONEPE_SESSION_PENDING_USER,
  PHONEPE_SESSION_PENDING_CLINIC,
  PHONEPE_SESSION_PAYMENT_ERROR,
} from './constants';
export { readMerchantOrderIdFromSearchParams } from './merchantOrderFromUrl';
export { redirectToPhonePeCheckout, clearPendingMerchantOrder } from './redirect';
export { matchesUserSubscriptionReturnPath } from './returnPath';
export { formatPhonePeApiError } from './errors';
export type { ClinicPhonePeCreateResponse, UserPhonePeCreateResponse } from './types';

import { readMerchantOrderIdFromSearchParams } from './merchantOrderFromUrl';
import {
  PHONEPE_SESSION_PENDING_CLINIC,
  PHONEPE_SESSION_PENDING_USER,
  PHONEPE_SESSION_PAYMENT_ERROR,
} from './constants';
import { clearPendingMerchantOrder, redirectToPhonePeCheckout } from './redirect';
import { matchesUserSubscriptionReturnPath } from './returnPath';
import { formatPhonePeApiError } from './errors';

/** Namespace-style access: `PhonePePG.redirectToCheckout(...)`. */
export const PhonePePG = {
  sessionKeys: {
    pendingUser: PHONEPE_SESSION_PENDING_USER,
    pendingClinic: PHONEPE_SESSION_PENDING_CLINIC,
    paymentError: PHONEPE_SESSION_PAYMENT_ERROR,
  },
  readMerchantOrderIdFromSearchParams,
  redirectToCheckout: redirectToPhonePeCheckout,
  clearPendingMerchantOrder,
  matchesUserSubscriptionReturnPath,
  formatApiError: formatPhonePeApiError,
} as const;
