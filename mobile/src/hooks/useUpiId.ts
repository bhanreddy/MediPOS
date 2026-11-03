import { useCallback, useEffect, useState } from 'react';
import { apiClient } from '@/api/client';
import { store } from '@/utils/storage';

const UPI_STORAGE_KEY = 'upi_vpa';

/** Merchant UPI VPA from clinic profile (`/clinics/me`), cached in MMKV. */
export function useUpiId() {
  const [upiId, setUpiId] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  const applyUpi = useCallback((id: string) => {
    setUpiId(id);
    if (id) store.set(UPI_STORAGE_KEY, id);
    else store.delete(UPI_STORAGE_KEY);
  }, []);

  const loadUpi = useCallback(async () => {
    try {
      const res = await apiClient.get('/clinics/me');
      const vpa = String(res.data?.data?.upi_vpa ?? '').trim();
      if (vpa) {
        applyUpi(vpa);
        return;
      }
    } catch {
      /* use cache */
    }
    const cached = store.getString(UPI_STORAGE_KEY);
    if (cached) applyUpi(cached);
  }, [applyUpi]);

  useEffect(() => {
    let mounted = true;
    void loadUpi().finally(() => {
      if (mounted) setIsLoading(false);
    });
    return () => {
      mounted = false;
    };
  }, [loadUpi]);

  return { upiId, isLoading, reloadUpiId: loadUpi };
}
