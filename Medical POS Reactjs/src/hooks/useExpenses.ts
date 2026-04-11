import { useState, useEffect } from 'react';
import { db } from '../db/index';
import type { Expense } from '../core/types';

export interface ExpenseMetrics {
    dailyTotal: number;
    monthlyTotal: number;
}

export const useExpenses = () => {
    const [expenses, setExpenses] = useState<Expense[]>([]);
    const [metrics, setMetrics] = useState<ExpenseMetrics>({ dailyTotal: 0, monthlyTotal: 0 });
    const [isLoading, setIsLoading] = useState(true);

    const fetchExpenses = async () => {
        setIsLoading(true);
        try {
            // Fetch all expenses (or limit to recent/this month?)
            // For ledger view, maybe last 50?
            const allExpenses = await db.expenses.orderBy('date').reverse().limit(50).toArray();
            setExpenses(allExpenses);

            // Calc Metrics
            const today = new Date().toISOString().split('T')[0];
            const startOfMonth = today.substring(0, 7) + '-01'; // YYYY-MM-01

            // Queries for Stats
            const daily = await db.expenses.where('date').equals(today).toArray();
            const dailySum = daily.reduce((acc, curr) => acc + curr.amount, 0);

            const monthly = await db.expenses.where('date').aboveOrEqual(startOfMonth).toArray();
            const monthlySum = monthly.reduce((acc, curr) => acc + curr.amount, 0);

            setMetrics({
                dailyTotal: dailySum,
                monthlyTotal: monthlySum
            });

        } catch (error) {
            console.error("Failed to fetch expenses", error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchExpenses();
    }, []);

    // Helper to refresh after add
    const refresh = () => fetchExpenses();

    return { expenses, metrics, isLoading, refresh };
};
