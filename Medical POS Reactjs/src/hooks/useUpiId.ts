import { useEffect, useState } from 'react';

const UPI_STORAGE_KEY = 'medpos_upi_id';

/**
 * Centralizes all UPI localStorage logic.
 * Used by Settings and Billing components.
 */
export function useUpiId() {
    const [upiId, setUpiId] = useState<string>('');

    useEffect(() => {
        try {
            const saved = localStorage.getItem(UPI_STORAGE_KEY);
            if (saved) setUpiId(saved);
        } catch (e) {
            console.error('localStorage unavailable', e);
        }
    }, []);

    const saveUpiId = (id: string) => {
        try {
            localStorage.setItem(UPI_STORAGE_KEY, id);
            setUpiId(id);
        } catch (e) {
            console.error('localStorage unavailable', e);
        }
    };

    return { upiId, saveUpiId };
}
