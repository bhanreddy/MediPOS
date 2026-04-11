import { db } from '../db/index';
import type { Role, RoleName, User } from '../core/types';
import { ROLE_PRESETS } from '../auth/permissions';
import { AuthService } from './authService';

export const ROLE_IDS: Record<RoleName, string> = {
    ADMIN: '00000000-0000-4000-8000-000000000001',
    MANAGER: '00000000-0000-4000-8000-000000000002',
    CASHIER: '00000000-0000-4000-8000-000000000003',
};

/**
 * Idempotent seed: roles, default admin user wiring, demo users optional.
 */
export const BootstrapService = {
    async ensureSeed(): Promise<void> {
        const now = new Date().toISOString();
        const ts = Date.now();

        const existingRoles = await db.roles.count();
        if (existingRoles === 0) {
            const roles: Role[] = (['ADMIN', 'MANAGER', 'CASHIER'] as RoleName[]).map(name => ({
                id: ROLE_IDS[name],
                name,
                permissions: [...ROLE_PRESETS[name]],
                created_at: now,
                updated_at: now,
                last_modified: ts,
            }));
            await db.roles.bulkAdd(roles);
        }

        const adminUser = await db.users.where('username').equals('admin').first();
        if (adminUser && adminUser.role_id !== ROLE_IDS.ADMIN) {
            await db.users.update(adminUser.id, {
                role_id: ROLE_IDS.ADMIN,
                updated_at: now,
                last_modified: ts,
            });
        }

        if (!adminUser) {
            const password_hash = await AuthService.hashPassword('admin123');
            const user: User = {
                id: crypto.randomUUID(),
                username: 'admin',
                password_hash,
                role_id: ROLE_IDS.ADMIN,
                name: 'Administrator',
                is_active: true,
                created_at: now,
                updated_at: now,
                last_modified: ts,
            };
            await db.users.add(user);
        }

        const manager = await db.users.where('username').equals('manager').first();
        if (!manager) {
            const password_hash = await AuthService.hashPassword('manager123');
            await db.users.add({
                id: crypto.randomUUID(),
                username: 'manager',
                password_hash,
                role_id: ROLE_IDS.MANAGER,
                name: 'Store Manager',
                is_active: true,
                created_at: now,
                updated_at: now,
                last_modified: ts,
            });
        }

        const cashier = await db.users.where('username').equals('cashier').first();
        if (!cashier) {
            const password_hash = await AuthService.hashPassword('cashier123');
            await db.users.add({
                id: crypto.randomUUID(),
                username: 'cashier',
                password_hash,
                role_id: ROLE_IDS.CASHIER,
                name: 'Cashier',
                is_active: true,
                created_at: now,
                updated_at: now,
                last_modified: ts,
            });
        }
    },
};
