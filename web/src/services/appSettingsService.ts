export const AppSettingsService = {
    async getSetting(key: string): Promise<{ id: string; key: string; value: string; group: string } | undefined> {
        const val = localStorage.getItem(`medpos_setting_${key}`);
        if (val === null) return undefined;
        return {
            id: key,
            key,
            value: val,
            group: 'SYSTEM',
        };
    },

    async getString(key: string, defaultValue = ''): Promise<string> {
        const val = localStorage.getItem(`medpos_setting_${key}`);
        return val !== null ? val : defaultValue;
    },

    async getBoolean(key: string, defaultValue = false): Promise<boolean> {
        const value = await this.getString(key, defaultValue ? 'true' : 'false');
        return String(value).toLowerCase() === 'true';
    },

    async setString(key: string, value: string, _group = 'SYSTEM'): Promise<void> {
        localStorage.setItem(`medpos_setting_${key}`, value);
    },

    async setBoolean(key: string, value: boolean, _group = 'SYSTEM'): Promise<void> {
        await this.setString(key, value ? 'true' : 'false', _group);
    },
};

