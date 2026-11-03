import type { MedicineBatch } from '@/api/inventory';

/** FEFO: earliest-expiry batch that still has sellable quantity (matches web ProductLookupService). */
export function pickSellableBatch(
  batches: MedicineBatch[] | undefined,
  opts?: { allowExpired?: boolean },
): MedicineBatch | null {
  if (!batches?.length) return null;

  const today = new Date().toISOString().split('T')[0];
  const allowExpired = opts?.allowExpired ?? false;

  const sellable = batches
    .filter((b) => (b.quantity ?? 0) > 0)
    .filter((b) => allowExpired || !b.expiryDate || b.expiryDate >= today)
    .sort((a, b) => (a.expiryDate || '').localeCompare(b.expiryDate || ''));

  return sellable[0] ?? null;
}

export function sumSellableStock(batches: MedicineBatch[] | undefined): number {
  if (!batches?.length) return 0;
  const today = new Date().toISOString().split('T')[0];
  return batches
    .filter((b) => !b.expiryDate || b.expiryDate >= today)
    .reduce((sum, b) => sum + Math.max(0, b.quantity ?? 0), 0);
}
