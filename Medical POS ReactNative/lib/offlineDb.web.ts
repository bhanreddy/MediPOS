/** Web: expo-sqlite sync API is not used; offline queue disabled so the app shell can mount. */

export function initOfflineDb(): void {
  /* no-op */
}

export function cacheMedicines(_medicines: Array<Record<string, unknown>>): void {
  /* no-op */
}

export function queueOfflineSale(_payload: unknown): string {
  return `web_${Date.now()}`;
}

export function getPendingSales(): Array<{ id: string; payload: string }> {
  return [];
}

export function markSaleSynced(_id: string): void {
  /* no-op */
}

export function markSaleFailed(_id: string, _errorMessage: string): void {
  /* no-op */
}

export function pendingSalesCount(): number {
  return 0;
}
