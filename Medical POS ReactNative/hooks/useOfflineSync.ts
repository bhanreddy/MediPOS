import { useState, useEffect, useCallback } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { getPendingSales, markSaleSynced, markSaleFailed, pendingSalesCount } from '../lib/offlineDb';
import { toast } from '../lib/toast';

export function useOfflineSync() {
  const queryClient = useQueryClient();
  const [isOnline, setIsOnline] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);

  const refreshPending = useCallback(() => {
    setPendingCount(pendingSalesCount());
  }, []);

  const syncPendingSales = useCallback(async () => {
    const pending = getPendingSales();
    if (!pending.length) {
      setPendingCount(0);
      return;
    }

    setIsSyncing(true);
    let successCount = 0;

    for (const sale of pending) {
      try {
        const body = JSON.parse(sale.payload);
        await api.post('/sales', body, { headers: { 'X-Offline-Sync': '1' } });
        markSaleSynced(sale.id);
        successCount += 1;
      } catch (err: unknown) {
        const ax = err as { response?: { status?: number; data?: { error?: { message?: string; code?: string } } } };
        const status = ax.response?.status;
        const code = ax.response?.data?.error?.code;
        const msg = ax.response?.data?.error?.message || 'Sync failed';
        if (status === 400 && (code === 'STOCK_CHANGED_WHILE_OFFLINE' || code === 'INSUFFICIENT_STOCK')) {
          markSaleFailed(sale.id, msg);
        }
      }
    }

    if (successCount > 0) {
      toast.success(
        `${successCount} offline sale${successCount > 1 ? 's' : ''} synced`
      );
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['medicine_search'] });
    }

    setIsSyncing(false);
    refreshPending();
  }, [queryClient, refreshPending]);

  useEffect(() => {
    refreshPending();
  }, [refreshPending]);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      const online = Boolean(state.isConnected && state.isInternetReachable !== false);
      setIsOnline(online);
      if (online) {
        syncPendingSales();
      }
    });
    return unsubscribe;
  }, [syncPendingSales]);

  return { isOnline, pendingCount, isSyncing, syncPendingSales, refreshPending };
}
