import React, { useEffect } from 'react';
import { useSubscriptionAccess } from '../../context/SubscriptionAccessContext';
import { Button } from '../ui/Button';

/**
 * Wraps authenticated POS routes: never hard-locks on expiry; reconciles subscription in the background.
 */
export function SubscriptionGuard({ children }: { children: React.ReactNode }) {
  const { showRenewalBanner, dismissRenewalBanner, refreshFromServer, goToRenewal, cache } = useSubscriptionAccess();

  useEffect(() => {
    const onOnline = () => void refreshFromServer();
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [refreshFromServer]);

  return (
    <div className="flex flex-1 min-h-0 flex-col overflow-hidden">
      {showRenewalBanner && (
        <div
          role="status"
          className="shrink-0 border-b border-amber-500/40 bg-amber-500/10 px-4 py-3 flex flex-wrap items-center gap-3 justify-between"
        >
          <div className="text-sm text-foreground-strong font-semibold">
            Subscription renewal needed
            {cache?.expiresAt ? (
              <span className="block text-xs font-medium text-muted mt-0.5">
                Last known expiry: {new Date(cache.expiresAt).toLocaleString()}
              </span>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="primary" onClick={goToRenewal}>
              Renew now
            </Button>
            <Button size="sm" variant="ghost" onClick={dismissRenewalBanner}>
              Dismiss
            </Button>
          </div>
        </div>
      )}
      <div className="min-h-0 flex-1 flex flex-col overflow-hidden">{children}</div>
    </div>
  );
}
