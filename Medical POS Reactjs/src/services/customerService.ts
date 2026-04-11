import { db } from '../db/index';
import type { Customer } from '../core/types';
import { v4 as uuidv4 } from 'uuid';
import { AuditService } from './auditService';

export const CustomerService = {
    async addCustomer(input: { name: string; phone: string; email?: string; address?: string }): Promise<Customer> {
        const now = new Date().toISOString();

        const customer: Customer = {
            id: uuidv4(),
            name: input.name,
            phone: input.phone,
            email: input.email,
            address: input.address,
            created_at: now,
            updated_at: now,
            last_modified: Date.now(),
        };

        await db.customers.add(customer);
        await AuditService.log('customers', customer.id, 'CREATE', null, customer);

        return customer;
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
        const existing = await db.customers.get(id);
        if (!existing) throw new Error('Customer not found');

        const next: Customer = {
            ...existing,
            ...patch,
            updated_at: new Date().toISOString(),
            last_modified: Date.now(),
        };

        await db.customers.put(next);
        await AuditService.log('customers', id, 'UPDATE', existing, next);
    },

    async deleteCustomer(id: string): Promise<void> {
        const existing = await db.customers.get(id);
        if (!existing) return;

        await db.customers.delete(id);
        await AuditService.log('customers', id, 'DELETE', existing, null);
    },
};
