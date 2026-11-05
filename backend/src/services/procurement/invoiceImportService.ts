import { AppError } from '../../lib/appError';
import { queryRaw } from '../../lib/postgresDb';
import { Money } from '../../lib/money';

export const normalizeSupplierInvoice = (value: string) => value.trim().replace(/\s+/g, ' ').toUpperCase();

/** The enclosing purchase transaction owns the clinic lock and all stock writes. */
export async function findInvoiceImport(clinicId: string, requestId: string, sourceHash: string, payloadHash: string) {
  const [previous] = await queryRaw(`SELECT r.payload_hash, p.* FROM invoice_import_receipts r
    JOIN purchases p ON p.id=r.purchase_id AND p.clinic_id=r.clinic_id
    WHERE r.clinic_id=? AND r.request_id=?`, [clinicId, requestId]);
  if (previous) {
    if (previous.payload_hash !== payloadHash) throw new AppError(409, 'This import was already saved with different details. Check Purchases before changing it.');
    return previous;
  }
  const [duplicate] = await queryRaw('SELECT purchase_id FROM invoice_import_receipts WHERE clinic_id=? AND source_sha256=?', [clinicId, sourceHash]);
  if (duplicate) throw new AppError(409, 'This invoice file has already updated stock. Check Purchases; it cannot be imported twice.');
  return null;
}

/** Imported invoice quantities and discounts are authoritative; do not add scheme stock again. */
export function importedReceiptCost(item: { quantity: number; free_quantity?: number; purchase_price: number; discount: number }) {
  const freeQuantity = item.free_quantity || 0;
  const received = item.quantity + freeQuantity;
  if (!Number.isSafeInteger(received) || received > 2147483647) throw new AppError(400, 'Received quantity exceeds the stock limit.');
  const paid = Money.calculateLineItem({ quantity: item.quantity, unitPrice: item.purchase_price, discountPct: item.discount, gstRate: 0 }).taxableAmount;
  const costPaise = Math.round(Money.toPaise(paid) / received);
  return { totalReceivedQuantity: received, effectiveUnitCost: Money.toRupees(costPaise), effectiveUnitCostPaise: costPaise, freeQuantity, tradeDiscountPct: item.discount };
}
