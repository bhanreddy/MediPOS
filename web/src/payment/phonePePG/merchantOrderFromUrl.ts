/**
 * Reads merchant order id from return URL query (PhonePe may append different keys).
 */
export function readMerchantOrderIdFromSearchParams(search: string): string | null {
  const params = new URLSearchParams(search);
  const fromUrl =
    params.get('merchantOrderId')?.trim() ||
    params.get('merchant_order_id')?.trim() ||
    null;
  return fromUrl || null;
}
