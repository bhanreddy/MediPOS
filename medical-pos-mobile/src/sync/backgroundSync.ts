/**
 * backgroundSync.ts — Background sync using expo-task-manager + expo-background-fetch.
 *
 * Registers a background task that runs the sync cycle every ~30 minutes.
 * Also provides the manual sync hook for UI buttons.
 */
import * as TaskManager from 'expo-task-manager';
import * as BackgroundFetch from 'expo-background-fetch';
import { runSyncCycle, type SyncResult } from './syncEngine';

/* ─── Constants ───────────────────────────────────────── */

const SYNC_TASK_NAME = 'MEDPOS_BACKGROUND_SYNC';
const SYNC_INTERVAL_SECONDS = 30 * 60; // 30 minutes

/* ─── Task Definition ─────────────────────────────────── */

TaskManager.defineTask(SYNC_TASK_NAME, async () => {
  try {
    console.log('[BackgroundSync] Starting background sync cycle...');
    const result = await runSyncCycle();
    console.log('[BackgroundSync] Completed:', result);

    return result.pushed > 0 || result.pulled > 0
      ? BackgroundFetch.BackgroundFetchResult.NewData
      : BackgroundFetch.BackgroundFetchResult.NoData;
  } catch (error) {
    console.error('[BackgroundSync] Failed:', error);
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

/* ─── Registration ────────────────────────────────────── */

/**
 * Register the background sync task.
 * Call this once on app startup (e.g., in your root layout or App.tsx).
 */
export async function registerBackgroundSync(): Promise<void> {
  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(SYNC_TASK_NAME);

    if (isRegistered) {
      console.log('[BackgroundSync] Task already registered');
      return;
    }

    await BackgroundFetch.registerTaskAsync(SYNC_TASK_NAME, {
      minimumInterval: SYNC_INTERVAL_SECONDS,
      stopOnTerminate: false,
      startOnBoot: true,
    });

    console.log('[BackgroundSync] Task registered successfully');
  } catch (error) {
    console.error('[BackgroundSync] Registration failed:', error);
  }
}

/**
 * Unregister the background sync task (e.g., on logout).
 */
export async function unregisterBackgroundSync(): Promise<void> {
  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(SYNC_TASK_NAME);
    if (isRegistered) {
      await TaskManager.unregisterTaskAsync(SYNC_TASK_NAME);
      console.log('[BackgroundSync] Task unregistered');
    }
  } catch (error) {
    console.error('[BackgroundSync] Unregister failed:', error);
  }
}

/**
 * Check the status of background fetch.
 */
export async function getBackgroundSyncStatus(): Promise<BackgroundFetch.BackgroundFetchStatus | null> {
  return BackgroundFetch.getStatusAsync();
}

/* ─── Manual Sync (for UI button) ─────────────────────── */

/**
 * Run sync cycle manually (triggered by user tapping "Sync Now" button).
 * Returns the result for UI feedback.
 */
export async function manualSync(): Promise<SyncResult> {
  console.log('[ManualSync] Starting manual sync...');
  const result = await runSyncCycle();
  console.log('[ManualSync] Completed:', result);
  return result;
}
