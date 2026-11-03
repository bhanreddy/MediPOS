import api from '../lib/api';
import type { ShopProfile } from '../core/types';
import { fetchClinicProfile, clearClinicProfileCache } from './clinicProfileCache';

export const ShopProfileService = {

    /**
     * Fetch from Supabase (Authoritative)
     */
    async fetchShopProfileOnline(force = false): Promise<Partial<ShopProfile> | null> {
        try {
            const profile = await fetchClinicProfile(force);
            if (profile) {
                return {
                    id: profile.id,
                    shop_id: profile.id,
                    medical_name: profile.name,
                    owner_name: profile.owner_name,
                    gst_number: profile.gstin,
                    drug_license_number: profile.drug_licence_number,
                    address_line_1: profile.address,
                    address_line_2: '',
                    city: '',
                    state: '',
                    pincode: '',
                    logo_url: profile.logo_url,
                    phone_number: profile.phone,
                    verified: profile.is_active,
                    created_at: profile.created_at,
                    updated_at: profile.updated_at
                };
            }
        } catch (err: any) {
            const status = err?.response?.status;
            const body = err?.response?.data;
            console.error('[ShopProfile] Online fetch failed:', { status, body, message: err?.message });
        }
        return null;
    },

    /**
     * Sync: Fetch Online
     */
    async syncShopProfile(): Promise<ShopProfile> {
        const onlineData = await this.fetchShopProfileOnline(true);
        if (onlineData) {
            return onlineData as ShopProfile;
        }
        throw new Error('Medical profile not available. Please connect to internet once.');
    },

    async getShopProfileLocal(): Promise<ShopProfile> {
        const profile = await this.fetchShopProfileOnline();
        if (!profile) {
            throw new Error('Medical Profile missing. Please login online to sync.');
        }
        return profile as ShopProfile;
    },

    /**
     * Update Phone Number Logic
     */
    async updatePhoneNumber(newPhone: string): Promise<void> {
        await api.put('/clinics/me', { phone: newPhone });
        clearClinicProfileCache();
    },

    /**
     * Update Logo Locally
     */
    async updateLogo(base64Data: string): Promise<void> {
        await api.put('/clinics/me', { logo_url: base64Data });
        clearClinicProfileCache();
    }
};
