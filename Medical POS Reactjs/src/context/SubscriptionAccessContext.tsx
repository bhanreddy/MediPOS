import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { CloudAuthService } from '../services/cloudAuthService';
import { getSubscriptionCache, type SubscriptionEntitlementCache } from '../lib/store';
import type { AuthGate } from '../services/authGateService';
import { supabase } from '../lib/supabase';

type SubscriptionAccessContextValue = {
  cache: SubscriptionEntitlementCache | null;
  showRenewalBanner: boolean;
  dismissRenewalBanner: () => void;
  refreshFromServer: () => Promise<void>;
  goToRenewal: () => void;
};

const SubscriptionAccessContext = createContext<SubscriptionAccessContextValue | null>(null);

export function SubscriptionAccessProvider({
  children,
  onNavigateGate,
}: {
  children: React.ReactNode;
  onNavigateGate?: (gate: AuthGate) => void;
}) {
  const [cache, setCache] = useState<SubscriptionEntitlementCache | null>(null);
  const [dismissed, setDismissed] = useState(false);

  const refreshFromServer = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) return;
    try {
      const next = await CloudAuthService.applySubscriptionCacheFromServer();
      setCache(next);
    } catch {
      /* offline or misconfiguration */
    }
  }, []);

  useEffect(() => {
    void (async () => {
      setCache(await getSubscriptionCache());
    })();
  }, []);

  useEffect(() => {
    if (!cache?.showRenewalBanner) setDismissed(false);
  }, [cache?.showRenewalBanner]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const id = window.setInterval(() => {
      if (navigator.onLine) void refreshFromServer();
    }, 6 * 60 * 60 * 1000);
    return () => window.clearInterval(id);
  }, [refreshFromServer]);

  useEffect(() => {
    if (!navigator.onLine) return;
    void refreshFromServer();
  }, [refreshFromServer]);

  const showRenewalBanner = Boolean(cache?.showRenewalBanner && !dismissed);

  const goToRenewal = useCallback(() => {
    onNavigateGate?.('renewal');
  }, [onNavigateGate]);

  const value = useMemo<SubscriptionAccessContextValue>(
    () => ({
      cache,
      showRenewalBanner,
      dismissRenewalBanner: () => setDismissed(true),
      refreshFromServer,
      goToRenewal,
    }),
    [cache, refreshFromServer, goToRenewal, showRenewalBanner]
  );

  return <SubscriptionAccessContext.Provider value={value}>{children}</SubscriptionAccessContext.Provider>;
}

export function useSubscriptionAccess() {
  const ctx = useContext(SubscriptionAccessContext);
  if (!ctx) throw new Error('useSubscriptionAccess must be used within SubscriptionAccessProvider');
  return ctx;
}
