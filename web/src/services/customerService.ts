import api from '../lib/api';
import type { Customer } from '../core/types';

/** Accept local mobile numbers and commonly pasted Indian country-code formats. */
export function normalizeBillingPhone(value: string): string {
    const trimmed = value.trim();
    if (!/^[+\d\s().-]+$/.test(trimmed)) return trimmed;
    const digits = trimmed.replace(/\D/g, '');
    if (digits.length === 14 && digits.startsWith('0091')) return digits.slice(4);
    if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
    if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);
    return digits;
}

export const CustomerService = {
    async findOrCreateCustomer(input: { name: string; phone: string }): Promise<Customer> {
        input = { name: input.name.trim(), phone: normalizeBillingPhone(input.phone) };
        if (!input.name) throw new Error('Customer name is required');
        if (!/^[6-9]\d{9}$/.test(input.phone)) throw new Error('Enter a valid 10-digit mobile number');
        // Recheck on save so an existing phone is reused even if the search is stale.
        const res = await api.get('/customers', { params: { q: input.phone, limit: 100 } });
        const existing = (res.data?.data || []).find((row: Customer) => normalizeBillingPhone(row.phone || '') === input.phone);
        if (existing) return { ...existing, id: existing._local_id || existing.id };
        return CustomerService.addCustomer(input);
    },
    async addCustomer(input: { name: string; phone: string; email?: string; address?: string; credit_limit?: number }): Promise<Customer> {
        const res = await api.post('/customers', input);
        const data = res.data?.data;
        return {
            ...data,
            id: data._local_id || data.id
        };
    },

    async updateCustomer(
        id: string,
        patch: {
            name?: string;
            phone?: string;
            email?: string;
            address?: string;
            state?: string;
            credit_limit?: number;
            credit_balance?: number;
        }
    ): Promise<void> {
        // Map credit_limit/credit_balance or any expected fields to the API fields if they differ
        await api.put(`/customers/${id}`, patch);
    },

    async deleteCustomer(id: string): Promise<void> {
        await api.delete(`/customers/${id}`);
    },
};
