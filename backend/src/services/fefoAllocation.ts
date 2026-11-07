import { AppError } from '../lib/appError';

export interface FefoCandidate {
  id: string;
  expiry_date: string;
  available: number;
}
/** Shared deterministic allocator. Eligibility and row locking belong to the caller. */
export function allocateFefo<T extends FefoCandidate>(batches: T[], quantity: number, manualBatchId?: string | null) {
  if (!Number.isSafeInteger(quantity) || quantity <= 0) throw new AppError(400,'Quantity must be a positive integer','INVALID_QUANTITY');
  const eligible = [...batches].filter(batch => batch.available > 0)
    .sort((a,b) => a.expiry_date.localeCompare(b.expiry_date) || a.id.localeCompare(b.id));
  const selected = manualBatchId ? eligible.filter(batch => batch.id === manualBatchId) : eligible;
  const total = selected.reduce((sum,batch) => sum + batch.available,0);
  if (total < quantity) throw new AppError(409,`Insufficient stock. Available: ${total}, Requested: ${quantity}`,'INSUFFICIENT_STOCK');
  let remaining=quantity;
  const allocations: Array<{batch:T; quantity:number}> = [];
  for (const batch of selected) {
    if (!remaining) break;
    const take=Math.min(remaining,batch.available);
    allocations.push({batch,quantity:take}); remaining-=take;
  }
  return allocations;
}
