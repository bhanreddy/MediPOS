import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../lib/auth';
import { InventoryAlertService } from '../services/inventoryAlertService';

/** Shared by the notification drawer and dashboard attention links. */
export function useInventoryAlerts() {
    const clinicId = useAuth(state => state.clinic_id);
    const scope = sessionStorage.getItem('impersonate_clinic_id') || clinicId;
    return useQuery({
        queryKey: ['clinic-header-alerts', scope],
        queryFn: () => InventoryAlertService.getCounts(),
        staleTime: 30_000,
        refetchInterval: 60_000,
        refetchOnWindowFocus: true,
    });
}
