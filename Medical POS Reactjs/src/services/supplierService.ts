import { db } from '../db/index';
import type { Supplier } from '../core/types';
import { v4 as uuidv4 } from 'uuid';
import { AuditService } from './auditService';

/**
 * PHASE 7: SUPPLIER SERVICE
 * Manage Suppliers (Create, Update, Soft-Delete)
 */

export const SupplierService = {

    async getAll(): Promise<Supplier[]> {
        return await db.suppliers.toArray();
    },

    async getActive(): Promise<Supplier[]> {
        return await db.suppliers.filter(s => s.is_active).toArray();
    },

    async addSupplier(data: Omit<Supplier, 'id' | 'created_at' | 'updated_at' | 'last_modified' | 'is_active'>): Promise<Supplier> {
        const now = new Date().toISOString();

        // Check duplication? 
        // Usually Check GSTIN or Name.
        if (data.gstin) {
            const existing = await db.suppliers.where('gstin').equals(data.gstin).first();
            if (existing) throw new Error(`Supplier with GSTIN ${data.gstin} already exists`);
        }

        const newSupplier: Supplier = {
            id: uuidv4(),
            ...data,
            is_active: true,
            created_at: now,
            updated_at: now,
            last_modified: Date.now()
        };

        await db.suppliers.add(newSupplier);
        await AuditService.log('suppliers', newSupplier.id, 'CREATE', null, newSupplier);

        return newSupplier;
    },

    async updateSupplier(id: string, updates: Partial<Supplier>): Promise<void> {
        const existing = await db.suppliers.get(id);
        if (!existing) throw new Error('Supplier not found');

        const updated = {
            ...existing,
            ...updates,
            updated_at: new Date().toISOString(),
            last_modified: Date.now()
        };

        await db.suppliers.put(updated);
        await AuditService.log('suppliers', id, 'UPDATE', existing, updated);
    },

    async toggleActive(id: string, isActive: boolean): Promise<void> {
        // Soft-Delete / Re-activate
        await this.updateSupplier(id, { is_active: isActive });
    }
};
