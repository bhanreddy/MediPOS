import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../lib/auth';
import {
    buildRadarItemsWithStats,
    buildDisposedBatchItems,
    matchesAttentionFilter,
    type InventoryRadarStats,
    type InventoryAttentionFilter,
    type InventoryViewMode,
} from '../services/inventoryRadarCore';

export type { RadarItem, InventoryAttentionFilter, InventoryViewMode, DisposedBatchItem } from '../services/inventoryRadarCore';
export type InventoryStats = InventoryRadarStats;

const emptyStats: InventoryStats = { totalAssets: 0, criticalStock: 0, nearExpiry: 0, netValuation: 0 };

export const useInventoryRadar = (
    searchTerm: string,
    attentionFilter?: InventoryAttentionFilter | null,
    viewMode: InventoryViewMode = 'active',
) => {
    const clinicId = useAuth(state => state.clinic_id);
    const scope = sessionStorage.getItem('impersonate_clinic_id') || clinicId;
    const queryClient = useQueryClient();
    const active = useQuery({
        queryKey: ['inventory-radar', scope],
        queryFn: buildRadarItemsWithStats,
        enabled: viewMode === 'active',
        staleTime: 0,
        refetchOnWindowFocus: true,
    });
    const disposed = useQuery({
        queryKey: ['inventory-disposed', scope],
        queryFn: buildDisposedBatchItems,
        enabled: viewMode === 'disposed',
        staleTime: 0,
        refetchOnWindowFocus: true,
    });
    const term = searchTerm.trim().toLowerCase();
    const items = useMemo(() => (active.data?.items ?? [])
        .filter(item => matchesAttentionFilter(item, attentionFilter))
        .filter(item => item.name.toLowerCase().includes(term) || item.batch.toLowerCase().includes(term))
        .sort((a, b) => b.priority - a.priority || a.name.localeCompare(b.name) || a.expiry.localeCompare(b.expiry)),
    [active.data, attentionFilter, term]);
    const disposedItems = useMemo(() => (disposed.data ?? []).filter(item =>
        item.name.toLowerCase().includes(term) || item.batch.toLowerCase().includes(term)), [disposed.data, term]);
    const current = viewMode === 'active' ? active : disposed;

    const refresh = useCallback(() => {
        void queryClient.invalidateQueries({ queryKey: ['inventory-radar'] });
        void queryClient.invalidateQueries({ queryKey: ['inventory-disposed'] });
        void queryClient.invalidateQueries({ queryKey: ['clinic-header-alerts'] });
        void queryClient.invalidateQueries({ queryKey: ['clinic-dashboard'] });
    }, [queryClient]);
    return { items, disposedItems, stats: active.data?.stats ?? emptyStats,
        isLoading: current.isPending, error: current.error?.message ?? null, refresh, viewMode };
};
