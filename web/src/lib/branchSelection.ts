const key = (userId: string, clinicId: string) => `medical.active-branch:${userId}:${clinicId}`;

export function getBranchSelection(userId?: string | null, clinicId?: string | null): string | null {
  if (!userId || !clinicId) return null;
  try {
    return sessionStorage.getItem(key(userId, clinicId));
  } catch {
    return null;
  }
}

export function setBranchSelection(userId: string, clinicId: string, storeId: string | null) {
  if (storeId) sessionStorage.setItem(key(userId, clinicId), storeId);
  else sessionStorage.removeItem(key(userId, clinicId));
}
