import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { matchesUserSubscriptionReturnPath } from '../../payment/phonePePG';
import { useAuth } from '../../lib/auth';
import { SessionRecovery } from './SessionRecovery';
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
  const location = useLocation();
  const requestedReturn = location.state?.paymentReturn;
  const paymentReturn = typeof requestedReturn === 'string' && matchesUserSubscriptionReturnPath(requestedReturn.split('?')[0]) ? requestedReturn : null;
  const { session, role, isLoading, isRecovering, checkSession } = useAuth();
  const [gate, setGate] = useState<AuthGate>('login');

  useEffect(() => {
    if (isLoading || isRecovering) return;
    if (session) {
      if (paymentReturn) { navigate(paymentReturn, { replace: true }); return; }
      if (role === 'SUPER_ADMIN')
        navigate('/admin/dashboard', { replace: true });
      else navigate('/dashboard', { replace: true });
    }
  }, [session, role, isLoading, isRecovering, navigate, paymentReturn]);

  const onNavigate = (next: AuthGate) => {
    if (next === 'app') {
      void (async () => {
        // Try the backend first to get role/clinic info
        await checkSession();
        const state = useAuth.getState();
        if (state.session) {
          if (paymentReturn) { navigate(paymentReturn, { replace: true }); return; }
          if (state.role === 'SUPER_ADMIN')
            navigate('/admin/dashboard', { replace: true });
          else navigate('/dashboard', { replace: true });
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

  if (isRecovering) return <SessionRecovery />;
  if (session) return null;

  const SUBSCRIPTION_GATE_ENABLED = false;

  switch (gate) {
    case 'signup':
      return <SignupScreen onNavigate={onNavigate} />;
    case 'payment':
      return SUBSCRIPTION_GATE_ENABLED ? (
        <PaymentScreen onNavigate={onNavigate} />
      ) : (
        <LoginScreen onNavigate={onNavigate} />
      );
    case 'renewal':
      return SUBSCRIPTION_GATE_ENABLED ? (
        <RenewalScreen onNavigate={onNavigate} />
      ) : (
        <LoginScreen onNavigate={onNavigate} />
      );
    default:
      return <LoginScreen onNavigate={onNavigate} />;
  }
}
