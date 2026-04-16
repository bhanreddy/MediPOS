import { create } from 'zustand';
import api from './api';
import { supabase } from './supabase';

export interface AuthState {
  session: any | null;
  user: any | null;
  clinic_id: string | null;
  role: 'SUPER_ADMIN' | 'OWNER' | 'PHARMACIST' | 'CASHIER' | 'VIEWER' | null;
  isLoading: boolean;
  isSuperAdmin: boolean;
  isOwner: boolean;
  canBill: boolean;
  canViewReports: boolean;
  
  signIn: (sessionData: any, userData: any) => void;
  signOut: () => Promise<void>;
  checkSession: () => Promise<void>;
}

export const useAuth = create<AuthState>((set) => ({
  session: null,
  user: null,
  clinic_id: null,
  role: null,
  isLoading: true,
  isSuperAdmin: false,
  isOwner: false,
  canBill: false,
  canViewReports: false,
  
  signIn: (sessionData, userData) => {
    set({
      session: sessionData,
      user: userData,
      clinic_id: userData?.clinic_id || null,
      role: userData?.role || null,
      isLoading: false,
      isSuperAdmin: userData?.role === 'SUPER_ADMIN',
      isOwner: userData?.role === 'OWNER',
      canBill: ['OWNER', 'PHARMACIST', 'CASHIER', 'SUPER_ADMIN'].includes(userData?.role),
      canViewReports: ['OWNER', 'PHARMACIST', 'SUPER_ADMIN', 'VIEWER'].includes(userData?.role)
    });
  },
  
  signOut: async () => {
    await supabase.auth.signOut();
    set({ session: null, user: null, clinic_id: null, role: null, isSuperAdmin: false, isOwner: false, canBill: false, canViewReports: false });
    window.location.href = '/login';
  },

  checkSession: async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        set({ isLoading: false });
        return;
      }
      
      // Try backend for role/clinic info; fall back to Supabase session if unavailable
      try {
        const { data: userData } = await api.get('/auth/me');
        set((state) => ({
          ...state,
          session,
          user: userData?.user,
          clinic_id: userData?.user?.clinic_id || null,
          role: userData?.user?.role || null,
          isSuperAdmin: userData?.user?.role === 'SUPER_ADMIN',
          isOwner: userData?.user?.role === 'OWNER',
          canBill: ['OWNER', 'PHARMACIST', 'CASHIER', 'SUPER_ADMIN'].includes(userData?.user?.role),
          canViewReports: ['OWNER', 'PHARMACIST', 'SUPER_ADMIN', 'VIEWER'].includes(userData?.user?.role),
          isLoading: false
        }));
      } catch {
        const meta = session.user.user_metadata as Record<string, string> | undefined;
        const fallbackRole = 'OWNER';
        set((state) => ({
          ...state,
          session,
          user: {
            id: session.user.id,
            email: session.user.email,
            full_name: meta?.full_name ?? meta?.name ?? session.user.email?.split('@')[0],
            role: fallbackRole,
            clinic_id: null,
          },
          clinic_id: null,
          role: fallbackRole,
          isSuperAdmin: false,
          isOwner: true,
          canBill: true,
          canViewReports: true,
          isLoading: false
        }));
      }
    } catch (err) {
      console.debug('Session check failed', err);
      set({ isLoading: false });
    }
  }
}));
