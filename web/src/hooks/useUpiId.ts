import { useCallback, useEffect, useState } from 'react';
import api from '../lib/api';
import { fetchClinicProfile, clearClinicProfileCache } from '../services/clinicProfileCache';

const UPI_STORAGE_KEY = 'medpos_upi_id';
export const UPI_ID_CHANGED_EVENT = 'medpos:upi-id-changed';

/**
 * Merchant UPI VPA — persisted on clinic profile (server) with localStorage cache.
 */
export function useUpiId() {
    const [upiId, setUpiId] = useState('');
    const [isLoading, setIsLoading] = useState(true);

    const applyUpi = useCallback((id: string) => {
        setUpiId(id);
        try {
            if (id) localStorage.setItem(UPI_STORAGE_KEY, id);
            else localStorage.removeItem(UPI_STORAGE_KEY);
        } catch (e) {
            console.error('localStorage unavailable', e);
        }
    }, []);

    const loadUpi = useCallback(async () => {
        try {
            const profile = await fetchClinicProfile();
            const vpa = String(profile?.upi_vpa ?? '').trim();
            if (vpa) {
                applyUpi(vpa);
                return;
            }
        } catch (e) {
            console.warn('[useUpiId] clinic fetch failed, using local cache', e);
        }
        try {
            const saved = localStorage.getItem(UPI_STORAGE_KEY);
            if (saved) applyUpi(saved);
        } catch (e) {
            console.error('localStorage unavailable', e);
        }
    }, [applyUpi]);

    useEffect(() => {
        let mounted = true;
        (async () => {
            await loadUpi();
            if (mounted) setIsLoading(false);
        })();
        const onChanged = (e: Event) => {
            const detail = (e as CustomEvent<string>).detail;
            if (typeof detail === 'string') applyUpi(detail);
        };
        window.addEventListener(UPI_ID_CHANGED_EVENT, onChanged);
        return () => {
            mounted = false;
            window.removeEventListener(UPI_ID_CHANGED_EVENT, onChanged);
        };
    }, [applyUpi, loadUpi]);

    const saveUpiId = async (id: string) => {
        const trimmed = id.trim();
        await api.put('/clinics/me', { upi_vpa: trimmed });
        clearClinicProfileCache();
        applyUpi(trimmed);
        window.dispatchEvent(new CustomEvent(UPI_ID_CHANGED_EVENT, { detail: trimmed }));
    };

    return { upiId, saveUpiId, isLoading, reloadUpiId: loadUpi };
};
