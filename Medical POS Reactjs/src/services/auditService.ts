import { db } from '../db/index';
import type { AuditLog } from '../core/types';
import { v4 as uuidv4 } from 'uuid';
import { store } from '../state/store';

/**
 * PHASE 5: AUDIT LOGGING
 * Centralized logging for all critical system mutations.
 */

export const AuditService = {
    /**
     * Log a critical action (CREATE, UPDATE, DELETE)
     */
    async log(
        tableName: string,
        recordId: string,
        action: 'CREATE' | 'UPDATE' | 'DELETE',
        oldValue?: any,
        newValue?: any
    ) {
        // Get current user from Redux Mirror (Session State)
        // Note: In a real txn, we might pass userId explicitly if called from backend logic
        const state = store.getState();
        const userId = state.auth.user?.id || 'system';

        const logEntry: AuditLog = {
            id: uuidv4(),
            table_name: tableName,
            record_id: recordId,
            action,
            old_value: oldValue ? JSON.stringify(oldValue) : undefined,
            new_value: newValue ? JSON.stringify(newValue) : undefined,
            user_id: userId,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            last_modified: Date.now()
        };

        await db.audit_logs.add(logEntry);
    }
};
