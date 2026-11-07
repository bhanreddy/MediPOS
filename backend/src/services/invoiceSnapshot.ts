import { AppError } from '../lib/appError';
import { Money } from '../lib/money';
import { queryRaw } from '../lib/postgresDb';
import { apportionPaise } from './cloudSaleReturns';

const gstin = (value: unknown) => typeof value === 'string' && /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][A-Z0-9]Z[A-Z0-9]$/i.test(value.trim())
  ? value.trim().toUpperCase() : null;

export async function resolveInvoiceIdentity(input: {
  clinicId: string; storeId: string | null; customerId?: string | null;
  placeOfSupply?: string; deliveryAddress?: string;
}) {
  const [seller] = await queryRaw(
    `SELECT COALESCE(NULLIF(s.display_name,''), NULLIF(s.name,''), c.name) AS name,
       COALESCE(NULLIF(s.address,''), NULLIF(c.address,''), o.registered_address) AS address,
       COALESCE(NULLIF(s.gstin_override,''), NULLIF(c.gstin,''), o.gstin) AS gstin,
       COALESCE(NULLIF(s.drug_licence_number,''), c.drug_licence_number) AS drug_licence,
       s.state_code
     FROM clinics c LEFT JOIN stores s ON s.id = ?::uuid AND s.clinic_id = c.id
     LEFT JOIN organizations o ON o.id = c.organization_id WHERE c.id = ?`, [input.storeId, input.clinicId],
  );
  const [buyer] = input.customerId ? await queryRaw(
    'SELECT id, name, address, gstin FROM customers WHERE id::text = ? AND clinic_id = ? AND deleted_at IS NULL',
    [input.customerId, input.clinicId],
  ) : [];
  const sellerGstin = gstin(seller?.gstin);
  const buyerGstin = gstin(buyer?.gstin);
  const sellerState = sellerGstin?.slice(0, 2) ?? seller?.state_code ?? null;
  const place = input.placeOfSupply ?? sellerState;
  const interstate = !!sellerState && !!place && place !== sellerState;
  if (input.placeOfSupply && (!sellerState || !/^(0[1-9]|[12][0-9]|3[0-8]|97)$/.test(input.placeOfSupply))) {
    throw new AppError(400, 'Choose a valid place of supply after setting the store state code.');
  }
  if (interstate && (!buyer || !input.deliveryAddress?.trim())) {
    throw new AppError(400, 'Inter-state supply requires a saved recipient and the delivery address.');
  }
  if (sellerGstin && !seller?.address?.trim()) throw new AppError(409, 'Set the pharmacy address before issuing a tax invoice.');
  if (sellerGstin && buyerGstin && !buyer.address?.trim()) throw new AppError(409, 'Add the registered recipient’s address before issuing a tax invoice.');
  return {
    seller: { name: seller?.name ?? '', address: seller?.address ?? null, gstin: sellerGstin, drug_licence: seller?.drug_licence ?? null, state_code: sellerState },
    buyer: buyer ? { name: buyer.name, address: buyer.address, gstin: buyerGstin } : null,
    place_of_supply: place, delivery_address: input.deliveryAddress?.trim() || buyer?.address || null,
    is_interstate: interstate,
  };
}

export async function taxDocumentNumber(clinicId: string, series: 'S' | 'R') {
  const day = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Kolkata' }).format(new Date());
  const [year, month] = day.split('-').map(Number);
  const fiscalYear = month >= 4 ? year : year - 1;
  const [sequence] = await queryRaw(
    `INSERT INTO clinic_tax_document_sequences (clinic_id, series, fiscal_year, sequence_number)
     VALUES (?, ?, ?, 1) ON CONFLICT (clinic_id, series, fiscal_year) DO UPDATE
     SET sequence_number = clinic_tax_document_sequences.sequence_number + 1 RETURNING sequence_number`,
    [clinicId, series, fiscalYear],
  );
  const yearCode = (value: number) => String(value % 100).padStart(2, '0');
  return `${series}${yearCode(fiscalYear)}${yearCode(fiscalYear + 1)}-${String(sequence.sequence_number).padStart(10, '0')}`;
}

interface InvoiceLineInput {
  grossPaise: number;
  taxPaise: number;
  hsn: string | null;
  name: string;
  manufacturer: string | null;
  batch: string;
  expiry: string | null;
  unit: string;
  unitCostPaise: number;
}

export interface TaxAmounts {
  gross_paise: number;
  taxable_paise: number;
  cgst_paise: number;
  sgst_paise: number;
  igst_paise: number;
}

export function snapshotInvoiceLines(
  lines: InvoiceLineInput[],
  totals: { grandTotal: number; totalGst: number; totalCgst: number; totalSgst: number; totalIgst: number },
) {
  const ids = lines.map((_, index) => String(index));
  const gross = apportionPaise(Money.toPaise(totals.grandTotal), lines.map((line, index) => ({ id: ids[index], weight: line.grossPaise })));
  const taxTotal = Money.toPaise(totals.totalGst);
  const taxes = apportionPaise(taxTotal, lines.map((line, index) => ({ id: ids[index], weight: line.taxPaise })));
  let excess = 0;
  for (const id of ids) {
    const limit = gross.get(id) ?? 0;
    const tax = taxes.get(id) ?? 0;
    if (tax > limit) {
      excess += tax - limit;
      taxes.set(id, limit);
    }
  }
  for (const id of ids) {
    if (!excess) break;
    const tax = taxes.get(id) ?? 0;
    const corrected = Math.min(excess, (gross.get(id) ?? 0) - tax);
    taxes.set(id, tax + corrected);
    excess -= corrected;
  }
  const central = apportionPaise(Money.toPaise(totals.totalCgst), ids.map(id => ({ id, weight: taxes.get(id) ?? 0 })));
  return lines.map((line, index) => {
    const id = ids[index], grossPaise = gross.get(id) ?? 0, tax = taxes.get(id) ?? 0;
    const cgst = central.get(id) ?? 0;
    const interstate = totals.totalIgst > 0;
    return {
      product_name: line.name, manufacturer: line.manufacturer, batch_number: line.batch, expiry_date: line.expiry,
      hsn_code: line.hsn, unit: line.unit, unit_cost_paise: line.unitCostPaise, gross_paise: grossPaise, taxable_paise: grossPaise - tax,
      cgst_paise: cgst, sgst_paise: interstate ? 0 : tax - cgst, igst_paise: interstate ? tax : 0,
    };
  });
}

export function snapshotCreditLine<T extends TaxAmounts>(original: T, beforePaise: number, refundPaise: number): T {
  const originalGross = BigInt(original.gross_paise);
  const originalTax = BigInt(original.cgst_paise + original.sgst_paise + original.igst_paise);
  if (!originalGross || !originalTax) {
    return { ...original, gross_paise: refundPaise, taxable_paise: refundPaise, cgst_paise: 0, sgst_paise: 0, igst_paise: 0 };
  }
  const before = originalTax * BigInt(beforePaise) / originalGross;
  const after = originalTax * BigInt(beforePaise + refundPaise) / originalGross;
  const tax = Number(after - before);
  const cgst = Number((BigInt(original.cgst_paise) * after / originalTax) - (BigInt(original.cgst_paise) * before / originalTax));
  return {
    ...original, gross_paise: refundPaise, taxable_paise: refundPaise - tax,
    cgst_paise: cgst, sgst_paise: original.igst_paise > 0 ? 0 : tax - cgst,
    igst_paise: original.igst_paise > 0 ? tax : 0,
  };
}
