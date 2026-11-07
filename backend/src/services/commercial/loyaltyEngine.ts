import { businessDb as localDb } from '../../lib/businessDb';
import { localMutate } from '../../lib/localMutate';
import { v4 as uuidv4 } from 'uuid';
import {
  LoyaltyProgram,
  LoyaltyAccount,
  LoyaltyTransaction,
  LoyaltyTransactionType,
} from '../../domain/commercialTypes';
import { AppError } from '../../lib/appError';

export class LoyaltyEngine {
  /**
   * Fetches or initializes the loyalty program for an organization
   */
  static async getOrCreateProgram(organizationId: string): Promise<LoyaltyProgram> {
    const existing: any = (await localDb
      .prepare('SELECT * FROM loyalty_programs WHERE organization_id = ? AND is_active = 1 AND _deleted = 0')
      .get(organizationId));

    if (existing) return existing;

    const id = uuidv4();
    const created = (await localMutate({
      table: 'loyalty_programs',
      operation: 'INSERT',
      data: {
        id,
        _local_id: id,
        organization_id: organizationId,
        name: 'Standard Customer Rewards Program',
        earn_rate_spend_paise: 10000, // ₹100 spend -> 1 credit
        credits_per_earn_unit: 1.0,
        redemption_rate_paise_per_credit: 25, // 1 credit = 25 paise (₹0.25) -> 100 credits = ₹25
        min_redemption_credits: 50,
        max_redemption_pct: 50.0, // Max 50% of bill value
        credit_expiry_days: 365,
        exclude_taxes_from_earn: 1,
        exclude_discounted_items: 0,
        status: 'ACTIVE',
        is_active: 1,
      },
    }));
    return created as LoyaltyProgram;
  }

  /**
   * Fetches or initializes customer loyalty account
   */
  static async getOrCreateAccount(organizationId: string, customerId: string): Promise<LoyaltyAccount> {
    const existing: any = (await localDb
      .prepare(
        'SELECT * FROM loyalty_accounts WHERE (customer_id = ? OR customer_id = ?) AND _deleted = 0'
      )
      .get(customerId, customerId));

    if (existing) return existing;

    const program = (await this.getOrCreateProgram(organizationId));
    const id = uuidv4();
    const created = (await localMutate({
      table: 'loyalty_accounts',
      operation: 'INSERT',
      data: {
        id,
        _local_id: id,
        organization_id: organizationId,
        customer_id: customerId,
        program_id: program.id || program._local_id,
        available_balance: 0,
        pending_balance: 0,
        lifetime_earned: 0,
        lifetime_redeemed: 0,
        status: 'ACTIVE',
      },
    }));
    return created as LoyaltyAccount;
  }

  /**
   * Records an immutable loyalty transaction in ledger
   */
  static async recordTransaction(params: {
    organizationId: string;
    customerId: string;
    transactionType: LoyaltyTransactionType;
    credits: number;
    monetaryValuePaise?: number;
    saleId?: string | null;
    returnId?: string | null;
    notes?: string;
    idempotencyKey?: string;
  }): Promise<LoyaltyTransaction> {
    const {
      organizationId,
      customerId,
      transactionType,
      credits,
      monetaryValuePaise = 0,
      saleId = null,
      returnId = null,
      notes = '',
      idempotencyKey,
    } = params;

    if (transactionType !== 'REVERSAL') {
      throw new AppError(410, 'Loyalty points have been removed. Use Nex Coins instead.', 'LOYALTY_REMOVED');
    }

    // Historical returns may still reverse credits from earlier sales.
    // Idempotency check: prevent duplicate loyalty credit/debit
    if (idempotencyKey) {
      const existing: any = (await localDb
        .prepare('SELECT * FROM loyalty_transactions WHERE idempotency_key = ? AND _deleted = 0')
        .get(idempotencyKey));
      if (existing) return existing;
    }

    const account = (await this.getOrCreateAccount(organizationId, customerId));
    const currentBalance = Number(account.available_balance || 0);
    const newBalance = Math.max(0, currentBalance + credits);

    const txId = uuidv4();
    const tx = (await localMutate({
      table: 'loyalty_transactions',
      operation: 'INSERT',
      data: {
        id: txId,
        _local_id: txId,
        organization_id: organizationId,
        account_id: account.id || account._local_id,
        customer_id: customerId,
        sale_id: saleId,
        return_id: returnId,
        transaction_type: transactionType,
        credits,
        credits_balance_after: newBalance,
        monetary_value_paise: monetaryValuePaise,
        notes,
        idempotency_key: idempotencyKey || null,
        created_at: new Date().toISOString(),
      },
    }));

    // Update account balances
    let lifetimeEarned = Number(account.lifetime_earned || 0);
    let lifetimeRedeemed = Number(account.lifetime_redeemed || 0);

    if (credits < 0) {
      lifetimeEarned = Math.max(0, lifetimeEarned - Math.abs(credits));
    } else {
      lifetimeRedeemed = Math.max(0, lifetimeRedeemed - credits);
    }

    (await localDb
      .prepare(
        `UPDATE loyalty_accounts 
         SET available_balance = ?, lifetime_earned = ?, lifetime_redeemed = ?, updated_at = ? 
         WHERE id = ? OR _local_id = ?`
      )
      .run(newBalance, lifetimeEarned, lifetimeRedeemed, new Date().toISOString(), account.id, account._local_id));

    return tx as LoyaltyTransaction;
  }

  /**
   * Reverses loyalty points for a return transaction
   */
  static async processReturnReversal(params: {
    organizationId: string;
    customerId: string;
    originalSaleId: string;
    returnId: string;
    returnRatio: number; // returnedAmount / originalGrandTotal (0.0 - 1.0)
  }) {
    const { organizationId, customerId, originalSaleId, returnId, returnRatio } = params;
    if (!customerId || returnRatio <= 0) return;

    // 1. Check if original sale earned loyalty
    const earnTx: any = (await localDb
      .prepare(
        `SELECT * FROM loyalty_transactions 
         WHERE sale_id = ? AND transaction_type = 'EARN' AND _deleted = 0`
      )
      .get(originalSaleId));

    if (earnTx && Number(earnTx.credits) > 0) {
      const earnedCredits = Number(earnTx.credits);
      const creditsToReverse = Math.round(earnedCredits * Math.min(1.0, returnRatio));
      if (creditsToReverse > 0) {
        (await this.recordTransaction({
          organizationId,
          customerId,
          transactionType: 'REVERSAL',
          credits: -creditsToReverse,
          saleId: originalSaleId,
          returnId,
          notes: `Reversal of ${creditsToReverse} earned credits for return (Invoice #${originalSaleId.slice(-6)})`,
          idempotencyKey: `rev_earn_${returnId}`,
        }));
      }
    }

    // 2. Check if original sale used redeemed loyalty
    const redeemTx: any = (await localDb
      .prepare(
        `SELECT * FROM loyalty_transactions 
         WHERE sale_id = ? AND transaction_type = 'REDEEM' AND _deleted = 0`
      )
      .get(originalSaleId));

    if (redeemTx && Number(redeemTx.credits) < 0) {
      const redeemedCredits = Math.abs(Number(redeemTx.credits));
      const creditsToRestore = Math.round(redeemedCredits * Math.min(1.0, returnRatio));
      if (creditsToRestore > 0) {
        (await this.recordTransaction({
          organizationId,
          customerId,
          transactionType: 'REVERSAL',
          credits: creditsToRestore,
          saleId: originalSaleId,
          returnId,
          notes: `Restoration of ${creditsToRestore} redeemed credits on return refund`,
          idempotencyKey: `rest_red_${returnId}`,
        }));
      }
    }
  }

  /**
   * Fetches customer loyalty history
   */
  static async getCustomerHistory(customerId: string): Promise<{
    account: LoyaltyAccount;
    program: LoyaltyProgram;
    transactions: LoyaltyTransaction[];
  }> {
    const accountRow: any = (await localDb
      .prepare('SELECT * FROM loyalty_accounts WHERE customer_id = ? AND _deleted = 0')
      .get(customerId));

    const programRow: any = (await localDb
      .prepare('SELECT * FROM loyalty_programs WHERE (id = ? OR _local_id = ?) AND _deleted = 0')
      .get(accountRow?.program_id, accountRow?.program_id));

    const transactions: any[] = (await localDb
      .prepare('SELECT * FROM loyalty_transactions WHERE customer_id = ? AND _deleted = 0 ORDER BY created_at DESC')
      .all(customerId));

    return {
      account: accountRow,
      program: programRow,
      transactions,
    };
  }
}
