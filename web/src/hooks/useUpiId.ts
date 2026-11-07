import { useCallback, useEffect, useState } from 'react';
import api from '../lib/api';
import { fetchClinicProfile, clearClinicProfileCache } from '../services/clinicProfileCache';
import { useAuth } from '../lib/auth';

export const UPI_ID_CHANGED_EVENT = 'medpos:upi-id-changed';

/**
 * Merchant UPI VPA — persisted on clinic profile (server) with localStorage cache.
 */
export function useUpiId() {
    const { user, clinic_id } = useAuth();
    const clinic = sessionStorage.getItem('impersonate_clinic_id') || clinic_id;
    const scope = user?.id && clinic ? `${user.id}:${clinic}` : '';
    const storageKey = `medpos_upi_id:${scope}`;
    const [saved, setSaved] = useState({ scope: '', value: '' });
    const [isLoading, setIsLoading] = useState(true);

    const applyUpi = useCallback((id: string) => {
        const current = useAuth.getState();
        const currentClinic = sessionStorage.getItem('impersonate_clinic_id') || current.clinic_id;
        if (!scope || scope !== `${current.user?.id}:${currentClinic}`) return;
        setSaved({ scope, value: id });
        try {
            if (id) localStorage.setItem(storageKey, id);
            else localStorage.removeItem(storageKey);
        } catch (e) {
            console.error('localStorage unavailable', e);
        }
    }, [scope, storageKey]);

    const loadUpi = useCallback(async () => {
        try {
            const profile = await fetchClinicProfile();
            const vpa = String(profile?.upi_vpa ?? '').trim();
            applyUpi(vpa);
            return;
        } catch (e) {
            console.warn('[useUpiId] clinic fetch failed, using local cache', e);
        }
        try {
            const saved = scope ? localStorage.getItem(storageKey) : null;
            applyUpi(saved || '');
        } catch (e) {
            console.error('localStorage unavailable', e);
        }
    }, [applyUpi, scope, storageKey]);

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

    return { upiId: saved.scope === scope ? saved.value : '', saveUpiId, isLoading, reloadUpiId: loadUpi };
};
