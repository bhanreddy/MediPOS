import { AppError } from '../lib/appError';
import { Money } from '../lib/money';
import { localInsertMany, queryRaw } from '../lib/postgresDb';
import { activeRegister } from './cashRegister';

export type TenderType = 'CASH' | 'UPI' | 'CARD' | 'CREDIT' | 'WALLET' | 'VOUCHER' | 'OTHER' | 'LOYALTY';
export interface Tender {
  tender_type: TenderType;
  amount_paise: number;
  reference_number?: string | null;
  original_payment_id?: string;
}

interface PaymentScope {
  clinicId: string;
  storeId: string | null;
  organizationId: string | null;
  terminalId: string | null;
  userId: string;
  role: string;
  registerRequired?: boolean;
  registerId?: string;
}

export function calculateTenderPlan(input: {
  totalPaise: number;
  paidPaise: number;
  balancePaise: number;
  walletPaise: number;
  paymentMode: string;
  payments?: Tender[];
}) {
  const { totalPaise, balancePaise, walletPaise, paymentMode, payments } = input;
  if (payments) {
    const listedTotal = payments.reduce((sum, tender) => sum + tender.amount_paise, 0);
    const credit = payments.filter(tender => tender.tender_type === 'CREDIT').reduce((sum, tender) => sum + tender.amount_paise, 0);
    if (listedTotal + walletPaise !== totalPaise || credit !== balancePaise) {
      throw new AppError(409, 'Split tenders must exactly cover the confirmed bill total.', 'TENDER_TOTAL_MISMATCH');
    }
  }
  const tenders: Tender[] = [...(payments ?? [])];
  if (!payments) {
    const paid = Math.min(totalPaise, input.paidPaise) - walletPaise;
    if (paid > 0) {
      const type = paymentMode === 'upi' ? 'UPI' : paymentMode === 'card' ? 'CARD' : 'CASH';
      tenders.push({ tender_type: type, amount_paise: paid });
    }
    if (balancePaise > 0) tenders.push({ tender_type: 'CREDIT', amount_paise: balancePaise });
  }
  if (walletPaise > 0) tenders.push({ tender_type: 'WALLET', amount_paise: walletPaise });
  return tenders;
}

export async function salePayments(saleId: string, clinicId: string) {
  return queryRaw(
    `SELECT p.* FROM payment_transactions p
     JOIN sales s ON s.id = COALESCE(p.return_id, p.sale_id)
     WHERE s.id=? AND s.clinic_id=? AND p.deleted_at IS NULL ORDER BY p.created_at, p.id`,
    [saleId, clinicId],
  );
}

export async function postTenderEntries(scope: PaymentScope, saleId: string, entries: Tender[], returnId?: string) {
  if (!entries.length) return [];
  const cash = entries.some(tender => tender.tender_type === 'CASH');
  const needsRegister = cash && scope.registerRequired === true;
  if (!scope.storeId && (needsRegister || scope.registerId)) {
    throw new AppError(409, 'Select a store before using a cash register.', 'REGISTER_REQUIRED');
  }
  const register = scope.storeId ? await activeRegister({ ...scope, storeId: scope.storeId }, needsRegister, scope.registerId) : undefined;
  return localInsertMany('payment_transactions', entries.map(tender => {
    const amountPaise = returnId ? -tender.amount_paise : tender.amount_paise;
    return {
      clinic_id: scope.clinicId,
      organization_id: scope.organizationId,
      store_id: scope.storeId,
      terminal_id: scope.terminalId,
      actor_id: scope.userId,
      register_session_id: register?.id ?? null,
      sale_id: saleId,
      return_id: returnId ?? null,
      original_payment_id: tender.original_payment_id ?? null,
      tender_type: tender.tender_type,
      amount_paise: amountPaise,
      amount: Money.toRupees(amountPaise),
      status: returnId ? 'REFUNDED' : 'COMPLETED',
      reference_number: tender.reference_number ?? null,
    };
  }));
}

export async function allocateRefundTenders(input: {
  saleId: string;
  originalMode: string;
  refundMethod: 'cash' | 'upi' | 'card' | 'original';
  reference?: string;
  externalPaise: number;
  creditPaise: number;
  walletPaise: number;
}) {
  const rows = await queryRaw(
    `SELECT p.id, p.tender_type, p.amount_paise + COALESCE(
       (SELECT SUM(r.amount_paise) FROM payment_transactions r WHERE r.original_payment_id = p.id
        AND r.deleted_at IS NULL AND r.status = 'REFUNDED'), 0) AS remaining
     FROM payment_transactions p WHERE p.sale_id = ? AND p.return_id IS NULL
       AND p.status = 'COMPLETED' AND p.deleted_at IS NULL
     ORDER BY CASE WHEN p.tender_type = 'CASH' THEN 0 ELSE 1 END, p.created_at, p.id`, [input.saleId],
  );
  const output: Tender[] = [];
  const distribute = (amount: number, allowed: (type: TenderType) => boolean, fallback: TenderType, method?: TenderType) => {
    let remaining = amount;
    for (const row of rows) {
      if (!remaining) break;
      const type = row.tender_type as TenderType;
      if (!allowed(type)) continue;
      const allocated = Math.min(remaining, Math.max(0, Number(row.remaining)));
      if (allocated <= 0) continue;
      output.push({ tender_type: method ?? type, amount_paise: allocated, original_payment_id: row.id, reference_number: input.reference });
      remaining -= allocated;
    }
    if (remaining) {
      // Historical bills and later on-account collections may not have recorded tender allocations.
      output.push({ tender_type: method ?? fallback, amount_paise: remaining, reference_number: input.reference });
    }
  };
  const originalMode = input.originalMode?.toUpperCase();
  const fallback = originalMode === 'UPI' || originalMode === 'CARD' ? originalMode : 'CASH';
  const override = input.refundMethod === 'original' ? undefined : input.refundMethod.toUpperCase() as TenderType;
  distribute(input.externalPaise, type => type !== 'CREDIT' && type !== 'WALLET' && type !== 'LOYALTY', fallback, override);
  distribute(input.creditPaise, type => type === 'CREDIT', 'CREDIT');
  distribute(input.walletPaise, type => type === 'WALLET', 'WALLET');
  return output;
}
