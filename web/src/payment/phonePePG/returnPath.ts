/**
 * Path after PhonePe redirect for **user** subscription (auth gate / PaymentScreen flow).
 * Configure in `.env` as `VITE_PHONEPE_RETURN_PATH` (default `/payment-return`).
 */
export function getUserSubscriptionReturnPath(): string {
  const configured = (import.meta.env.VITE_PHONEPE_RETURN_PATH as string | undefined) || '/payment-return';
  return `/${configured.replace(/^\/+|\/+$/g, '')}`;
}
export function matchesUserSubscriptionReturnPath(pathname: string): boolean {
  return pathname.replace(/\/+$/, '') === getUserSubscriptionReturnPath();
}
