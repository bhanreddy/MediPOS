import { useState, useEffect } from 'react';
import api from '../lib/api';
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
            const res = await api.get('/expenses');
            const allExpenses: Expense[] = res.data?.data || res.data || [];
            setExpenses(allExpenses.slice(0, 50));

            // Calc Metrics
            const today = new Date().toISOString().split('T')[0];
            const startOfMonth = today.substring(0, 7) + '-01'; // YYYY-MM-01

            // Queries for Stats
            const daily = allExpenses.filter((e: Expense) => e.date === today);
            const dailySum = daily.reduce((acc: number, curr: Expense) => acc + curr.amount, 0);

            const monthly = allExpenses.filter((e: Expense) => e.date >= startOfMonth);
            const monthlySum = monthly.reduce((acc: number, curr: Expense) => acc + curr.amount, 0);

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
