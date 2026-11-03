import api from '../lib/api';
import type { Customer } from '../core/types';

export const CustomerService = {
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
