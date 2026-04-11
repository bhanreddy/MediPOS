import { create } from 'zustand';

interface UserContext {
  id: string;
  clinic_id: string;
  role: 'OWNER' | 'PHARMACIST' | 'CASHIER' | 'VIEWER';
  email: string;
}

interface SessionState {
  user: UserContext | null;
  setUser: (user: UserContext | null) => void;
  clear: () => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  user: null,
  setUser: (user) => set({ user }),
  clear: () => set({ user: null }),
}));
