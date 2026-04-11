import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useSessionStore } from '../store/sessionStore';
import { router } from 'expo-router';
import { api } from '../lib/api';

export function useSession() {
  const sessionStore = useSessionStore();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initializeSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          await fetchUserProfile(session.user.id);
        } else {
          sessionStore.clear();
        }
      } catch (err) {
        console.error("Session init error:", err);
      } finally {
        setLoading(false);
      }
    };

    initializeSession();

    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        await fetchUserProfile(session.user.id);
      } else {
        sessionStore.clear();
      }
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  const fetchUserProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();
        
      if (error) throw error;
      sessionStore.setUser(data as any);
    } catch (err) {
      console.error("User profile fetch error:", err);
      sessionStore.clear();
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    sessionStore.clear();
    router.replace('/(auth)/login');
  };

  return {
    session: null, // Subsumed by Supabase Go-to
    user: sessionStore.user,
    clinic_id: sessionStore.user?.clinic_id,
    role: sessionStore.user?.role,
    loading,
    signOut
  };
}
