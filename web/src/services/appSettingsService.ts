import { useAuth } from '../lib/auth';
import { queryClient } from '../lib/queryClient';

function settingKey(key: string) {
    const { user, clinic_id } = useAuth.getState();
    const clinic = sessionStorage.getItem('impersonate_clinic_id') || clinic_id;
    if (!user?.id || !clinic) return null;
    return `medpos_setting_${user.id}:${clinic}:${key}`;
}

export const AppSettingsService = {
    async getSetting(key: string): Promise<{ id: string; key: string; value: string; group: string } | undefined> {
        const val = (settingKey(key) ? localStorage.getItem(settingKey(key)!) : null);
        if (val === null) return undefined;
        return {
            id: key,
            key,
            value: val,
            group: 'SYSTEM',
        };
    },

    async getString(key: string, defaultValue = ''): Promise<string> {
        const val = (settingKey(key) ? localStorage.getItem(settingKey(key)!) : null);
        return val !== null ? val : defaultValue;
    },

    async getBoolean(key: string, defaultValue = false): Promise<boolean> {
        const value = await this.getString(key, defaultValue ? 'true' : 'false');
        return String(value).toLowerCase() === 'true';
    },

    async setString(key: string, value: string, _group = 'SYSTEM'): Promise<void> {
        const scopedKey = settingKey(key);
        if (!scopedKey) throw new Error('Sign in to a clinic before changing settings.');
        localStorage.setItem(scopedKey, value);
        if (key === 'alert_expiry_days') {
            void queryClient.invalidateQueries({ queryKey: ['inventory-radar'] });
            void queryClient.invalidateQueries({ queryKey: ['clinic-header-alerts'] });
        }
    },

    async setBoolean(key: string, value: boolean, _group = 'SYSTEM'): Promise<void> {
        await this.setString(key, value ? 'true' : 'false', _group);
    },
};

