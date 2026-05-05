import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { getDb } from '../db/localBillsDb';

export function SyncStatusBadge() {
  const [pending, setPending] = useState(0);
  const [failed, setFailed] = useState(0);

  useEffect(() => {
    let isMounted = true;

    const pollStatus = async () => {
      try {
        const db = await getDb();
        const pendingItems = await db.getAllAsync(
          `SELECT COUNT(*) as count FROM sync_queue WHERE synced = 0 AND retry_count < 3`
        );
        const failedItems = await db.getAllAsync(
          `SELECT COUNT(*) as count FROM sync_queue WHERE synced = 0 AND retry_count >= 3`
        );

        if (isMounted) {
          setPending((pendingItems[0] as any).count || 0);
          setFailed((failedItems[0] as any).count || 0);
        }
      } catch (err) {
        console.error('Failed to poll sync queue', err);
      }
    };

    pollStatus();
    const interval = setInterval(pollStatus, 10000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  if (failed > 0) {
    return (
      <View style={[styles.badge, styles.failed]}>
        <Text style={styles.text}>{failed} failed</Text>
      </View>
    );
  }

  if (pending > 0) {
    return (
      <View style={[styles.badge, styles.pending]}>
        <Text style={styles.text}>{pending} pending</Text>
      </View>
    );
  }

  return (
    <View style={[styles.badge, styles.synced]}>
      <View style={styles.dot} />
      <Text style={[styles.text, styles.syncedText]}>Synced</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  failed: {
    backgroundColor: '#FEE2E2', // red-100
  },
  pending: {
    backgroundColor: '#FEF3C7', // amber-100
  },
  synced: {
    backgroundColor: 'transparent',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981', // green-500
  },
  text: {
    fontSize: 12,
    fontWeight: '500',
    color: '#374151',
  },
  syncedText: {
    color: '#10B981',
  }
});
