import { useCallback, useEffect, useState } from 'react';
import { apiClient } from '@/api/client';
import { store } from '@/utils/storage';
import { useAuthStore } from '@/stores/authStore';


/** Merchant UPI VPA from clinic profile (`/clinics/me`), cached in MMKV. */
export function useUpiId() {
  const user = useAuthStore(state => state.user);
  const scope = user?.id && user.clinicId ? `${user.id}:${user.clinicId}` : '';
  const storageKey = `upi_vpa:${scope}`;
  const [saved, setSaved] = useState({ scope: '', value: '' });
  const [isLoading, setIsLoading] = useState(true);

  const applyUpi = useCallback((id: string) => {
    const current = useAuthStore.getState().user;
    if (!scope || scope !== `${current?.id}:${current?.clinicId}`) return;
    setSaved({ scope, value: id });
    if (id) store.set(storageKey, id);
    else store.delete(storageKey);
  }, [scope, storageKey]);

  const loadUpi = useCallback(async () => {
    try {
      const res = await apiClient.get('/clinics/me');
      const vpa = String(res.data?.data?.upi_vpa ?? '').trim();
      applyUpi(vpa);
      return;
    } catch {
      /* use cache */
    }
    const cached = scope ? store.getString(storageKey) : undefined;
    applyUpi(cached || '');
  }, [applyUpi, scope, storageKey]);

  useEffect(() => {
    let mounted = true;
    void loadUpi().finally(() => {
      if (mounted) setIsLoading(false);
    });
    return () => {
      mounted = false;
    };
  }, [loadUpi]);

  return { upiId: saved.scope === scope ? saved.value : '', isLoading, reloadUpiId: loadUpi };
}
