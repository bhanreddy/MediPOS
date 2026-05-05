import { useState, useEffect } from 'react';
import { getWebDb } from '../db/webLocalDb';

export function SyncStatusBadge() {
  const [pending, setPending] = useState(0);
  const [failed, setFailed] = useState(0);

  useEffect(() => {
    let isMounted = true;

    const pollStatus = async () => {
      try {
        const db = await getWebDb();
        
        // Count pending
        const tx = db.transaction('sync_queue', 'readonly');
        let cursor = await tx.store.openCursor();
        
        let pendingCount = 0;
        let failedCount = 0;
        
        while (cursor) {
          if (cursor.value.synced === 0) {
            if (cursor.value.retry_count < 3) {
              pendingCount++;
            } else {
              failedCount++;
            }
          }
          cursor = await cursor.continue();
        }

        if (isMounted) {
          setPending(pendingCount);
          setFailed(failedCount);
        }
      } catch (err) {
        console.error('Failed to poll sync queue', err);
      }
    };

    pollStatus();
    const interval = window.setInterval(pollStatus, 10000);

    return () => {
      isMounted = false;
      window.clearInterval(interval);
    };
  }, []);

  if (failed > 0) {
    return (
      <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-red-100 text-gray-700 text-xs font-medium">
        {failed} failed
      </div>
    );
  }

  if (pending > 0) {
    return (
      <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-amber-100 text-gray-700 text-xs font-medium">
        {pending} pending
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-transparent text-emerald-500 text-xs font-medium">
      <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
      Synced
    </div>
  );
}
