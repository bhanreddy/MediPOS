/**
 * Path after PhonePe redirect for **user** subscription (auth gate / PaymentScreen flow).
 * Configure in `.env` as `VITE_PHONEPE_RETURN_PATH` (default `/payment-return`).
 */
export function matchesUserSubscriptionReturnPath(pathname: string): boolean {
  const configured = (import.meta.env.VITE_PHONEPE_RETURN_PATH as string | undefined) || '/payment-return';
  const normalized = configured.startsWith('/') ? configured : `/${configured}`;
  return pathname === normalized || pathname.endsWith(normalized);
}
