import { useSessionStore } from '../store/sessionStore';

export function useRole() {
  const { user } = useSessionStore();
  const role = user?.role;

  return {
    isOwner: role === 'OWNER',
    canBill: role === 'OWNER' || role === 'PHARMACIST' || role === 'CASHIER',
    canManageInventory: role === 'OWNER' || role === 'PHARMACIST',
    canViewReports: role === 'OWNER' || role === 'PHARMACIST',
    canManageUsers: role === 'OWNER',
    role
  };
}
