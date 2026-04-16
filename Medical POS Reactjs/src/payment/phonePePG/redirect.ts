/**
 * Persists pending merchant order id and sends the browser to PhonePe hosted checkout.
 */
export function redirectToPhonePeCheckout(
  pendingSessionKey: string,
  merchantOrderId: string,
  redirectUrl: string
): void {
  sessionStorage.setItem(pendingSessionKey, merchantOrderId);
  window.location.assign(redirectUrl);
}

export function clearPendingMerchantOrder(pendingSessionKey: string): void {
  sessionStorage.removeItem(pendingSessionKey);
}
