import { useEffect, useState } from 'react';
import { fetchClinicProfile } from '../services/clinicProfileCache';
import { BRANDING } from '../config/appContent';
import { sanitizeUpiPayeeName } from '../lib/upiPaymentUri';

/** Clinic / shop display name for receipts, UPI QR payee name (`pn`), etc. */
export function useShopDisplayName() {
    const [shopName, setShopName] = useState<string>(BRANDING.defaultMerchantDisplayName);

    useEffect(() => {
        let mounted = true;
        fetchClinicProfile()
            .then(profile => {
                const name = String(profile?.name ?? '').trim();
                if (mounted && name) setShopName(sanitizeUpiPayeeName(name));
            })
            .catch(() => undefined);
        return () => {
            mounted = false;
        };
    }, []);

    return shopName;
}
