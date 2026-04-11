import { db } from '../db/index';
import type { ShopProfile } from '../core/types';
import { v4 as uuidv4 } from 'uuid';
import api from '../lib/api';

/**
 * PHASE 9: SHOP PROFILE SERVICE
 * Bridges the gap between Online Identity and Local Operation.
 * 
 * Rules:
 * 1. Read-Only from Supabase (Official Details).
 * 2. Writes ONLY Phone Number to local cache & sync queue.
 * 3. Offline First: Always prefers local cache if online fetch fails.
 */

export const ShopProfileService = {

    /**
     * Fetch from Supabase (Authoritative)
     */
    async fetchShopProfileOnline(): Promise<Partial<ShopProfile> | null> {
        console.log(`[Online] Fetching shop profile...`);

        try {
            const { data } = await api.get('/clinics/me');
            
            // Assume the unified API maps data directly
            
            if (data?.data) {
                const profile = data.data;
                return {
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
                    verified: profile.is_active
                };
            }
        } catch (err) {
            console.error('[ShopProfile] Online fetch failed:', err);
            // NO MOCK FALLBACK - Must fail to enforce sync
        }
        return null;
    },

    /**
     * Sync: Fetch Online -> Save Local
     */
    async syncShopProfile(): Promise<ShopProfile> {
        // 1. Try Online
        const onlineData = await this.fetchShopProfileOnline();

        // 2. Load Local to merge (preserve local ID)
        const existing = await db.shop_profile.toCollection().first();
        const now = new Date().toISOString();

        if (onlineData) {
            const consolidated: ShopProfile = {
                ...(existing || {
                    id: uuidv4(),
                    created_at: now
                } as ShopProfile),
                ...onlineData, // Overwrite with authoritative data
                updated_at: now,
                last_modified: Date.now(),
                last_fetched_at: now
            } as ShopProfile;

            await db.shop_profile.put(consolidated);
            console.log('[ShopProfile] Cache Updated from Online');
            return consolidated;
        } else if (existing) {
            console.log('[ShopProfile] Using existing cache (Offline)');
            return existing;
        } else {
            throw new Error('Medical profile not available. Please connect to internet once.');
        }
    },

    async getShopProfileLocal(): Promise<ShopProfile> {
        const profile = await db.shop_profile.toCollection().first();
        if (!profile) {
            // Try explicit sync if missing
            // In a real app we might redirect to a "Setup" screen
            throw new Error('Medical Profile missing. Please login online to sync.');
        }
        return profile;
    },

    /**
     * Update Phone Number Logic
     */
    async updatePhoneNumber(newPhone: string): Promise<void> {
        const profile = await this.getShopProfileLocal();

        // 1. Update Local
        const updated = {
            ...profile,
            phone_number: newPhone,
            updated_at: new Date().toISOString(),
            last_modified: Date.now()
        };

        await db.shop_profile.put(updated);

        // 2. Queue Sync (or try direct if online)
        // ideally we push to sync_queue. For now, fire-and-forget Supabase update
        api.put('/clinics/me', { phone: newPhone })
            .then(() => {
                console.log("Phone updated online");
            }).catch((error) => {
                console.error("Background sync failed", error);
            });
    },

    /**
     * Update Logo Locally
     */
    async updateLogo(base64Data: string): Promise<void> {
        const profile = await this.getShopProfileLocal();

        const updated = {
            ...profile,
            logo_url: base64Data,
            updated_at: new Date().toISOString(),
            last_modified: Date.now()
        };

        await db.shop_profile.put(updated);
        // Note: Not syncing logo to cloud in this iteration as per request "local db itself"
    }
};
