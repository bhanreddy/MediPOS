import { useEffect, useState } from 'react';
import { apiClient } from '@/api/client';
import { sanitizeUpiPayeeName } from '@/lib/upiPaymentUri';

const DEFAULT_SHOP_NAME = 'MedPOS Pharmacy';

export function useShopDisplayName() {
  const [shopName, setShopName] = useState(DEFAULT_SHOP_NAME);

  useEffect(() => {
    let mounted = true;
    apiClient
      .get('/clinics/me')
      .then(res => {
        const name = String(res.data?.data?.name ?? '').trim();
        if (mounted && name) setShopName(sanitizeUpiPayeeName(name));
      })
      .catch(() => undefined);
    return () => {
      mounted = false;
    };
  }, []);

  return shopName;
}
