import { db } from '../db/index';
import type { Expense } from '../core/types';
import { v4 as uuidv4 } from 'uuid';
import { AuditService } from './auditService';
import { store } from '../state/store';

/**
 * PHASE 7: EXPENSE SERVICE
 * Track Outbound Money (Non-Inventory).
 * Expenses NEVER affect stock.
 */

export const ExpenseService = {

    async addExpense(
        amount: number,
        category: string,
        description: string,
        paymentMode: 'CASH' | 'UPI' | 'CARD' | 'DUE',
        date: string
    ): Promise<Expense> {

        // Get current user
        const state = store.getState();
        const userId = state.auth.user?.id;
        if (!userId) throw new Error('User not authenticated');

        const now = new Date().toISOString();

        const newExpense: Expense = {
            id: uuidv4(),
            amount,
            category,
            description,
            payment_mode: paymentMode,
            date,
            user_id: userId,
            created_at: now,
            updated_at: now,
            last_modified: Date.now()
        };

        await db.expenses.add(newExpense);
        await AuditService.log('expenses', newExpense.id, 'CREATE', null, newExpense);

        return newExpense;
    },

    async getExpenses(startDate?: string, endDate?: string): Promise<Expense[]> {
        let query = db.expenses.orderBy('date');

        if (startDate && endDate) {
            return await query.filter(e => e.date >= startDate && e.date <= endDate).toArray();
        }

        return await query.reverse().limit(100).toArray();
    }
};
