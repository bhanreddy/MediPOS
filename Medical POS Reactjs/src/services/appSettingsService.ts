import { db } from '../db/index';
import type { AppSetting } from '../core/types';
import { v4 as uuidv4 } from 'uuid';
import { AuditService } from './auditService';

export const AppSettingsService = {
    async getSetting(key: string): Promise<AppSetting | undefined> {
        return await db.app_settings.where('key').equals(key).first();
    },

    async getString(key: string, defaultValue = ''): Promise<string> {
        const setting = await this.getSetting(key);
        if (!setting) return defaultValue;
        return setting.value;
    },

    async getBoolean(key: string, defaultValue = false): Promise<boolean> {
        const value = await this.getString(key, defaultValue ? 'true' : 'false');
        return String(value).toLowerCase() === 'true';
    },

    async setString(key: string, value: string, group = 'SYSTEM'): Promise<void> {
        const existing = await this.getSetting(key);
        const now = new Date().toISOString();

        if (!existing) {
            const setting: AppSetting = {
                id: uuidv4(),
                key,
                value,
                group,
                created_at: now,
                updated_at: now,
                last_modified: Date.now(),
            };

            await db.app_settings.add(setting);
            await AuditService.log('app_settings', setting.id, 'CREATE', null, setting);
            return;
        }

        const next: AppSetting = {
            ...existing,
            value,
            group: existing.group || group,
            updated_at: now,
            last_modified: Date.now(),
        };

        await db.app_settings.put(next);
        await AuditService.log('app_settings', next.id, 'UPDATE', existing, next);
    },

    async setBoolean(key: string, value: boolean, group = 'SYSTEM'): Promise<void> {
        await this.setString(key, value ? 'true' : 'false', group);
    },
};
