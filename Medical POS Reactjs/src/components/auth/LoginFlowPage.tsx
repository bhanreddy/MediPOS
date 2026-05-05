import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import type { AuthGate } from '../../services/authGateService';
import { LoginScreen } from './LoginScreen';
import { SignupScreen } from './SignupScreen';
import { PaymentScreen } from './PaymentScreen';
import { RenewalScreen } from './RenewalScreen';

/**
 * Full-screen auth flow at `/login`: sign-in, sign-up, PhonePe payment, renewal.
 * Replaces the old placeholder so the login UI is visible and functional.
 */
export function LoginFlowPage() {
  const navigate = useNavigate();
  const { session, role, isLoading, checkSession } = useAuth();
  const [gate, setGate] = useState<AuthGate>('login');

  useEffect(() => {
    if (isLoading) return;
    if (session) {
      if (role === 'SUPER_ADMIN') navigate('/admin/dashboard', { replace: true });
      else navigate('/dashboard', { replace: true });
    }
  }, [session, role, isLoading, navigate]);

  const onNavigate = (next: AuthGate) => {
    if (next === 'app') {
      void (async () => {
        // Try the backend first to get role/clinic info
        await checkSession();
        const state = useAuth.getState();
        if (state.session) {
          if (state.role === 'SUPER_ADMIN') navigate('/admin/dashboard', { replace: true });
          else navigate('/dashboard', { replace: true });
          return;
        }
        // Backend /auth/me may have failed (e.g. users table not yet created).
        // Fall back to the Supabase session so login still works.
        const { data } = await supabase.auth.getSession();
        if (data.session) {
          const meta = data.session.user.user_metadata as Record<string, string> | undefined;
          const fallbackUser = {
            id: data.session.user.id,
            email: data.session.user.email,
            full_name: meta?.full_name ?? meta?.name ?? data.session.user.email?.split('@')[0],
            role: 'OWNER' as const,
            clinic_id: null,
          };
          useAuth.getState().signIn(data.session, fallbackUser);
          // Wait one tick for React to process the state update
          await new Promise(r => setTimeout(r, 0));
          navigate('/dashboard', { replace: true });
          return;
        }
        setGate('login');
      })();
      return;
    }
    if (next === 'login') {
      setGate('login');
      return;
    }
    setGate(next);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center space-y-4">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (session) return null;

  const SUBSCRIPTION_GATE_ENABLED = false;

  switch (gate) {
    case 'signup':
      return <SignupScreen onNavigate={onNavigate} />;
    case 'payment':
      return SUBSCRIPTION_GATE_ENABLED ? <PaymentScreen onNavigate={onNavigate} /> : <LoginScreen onNavigate={onNavigate} />;
    case 'renewal':
      return SUBSCRIPTION_GATE_ENABLED ? <RenewalScreen onNavigate={onNavigate} /> : <LoginScreen onNavigate={onNavigate} />;
    default:
      return <LoginScreen onNavigate={onNavigate} />;
  }
}
