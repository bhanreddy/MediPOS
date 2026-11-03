import { useEffect, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { tryCompletePhonePeReturn } from '../../services/completePhonePeReturn';
import { useAuth } from '../../lib/auth';
import { Button } from '../ui/Button';
import { AuthFrame } from './AuthFrame';

export function PaymentReturnPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isLoading: loading, session } = useAuth();
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (loading || !session) return;
    let active = true;
    void tryCompletePhonePeReturn().then(() => {
      if (active) navigate('/dashboard', { replace: true });
    }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : 'Payment verification is temporarily unavailable.');
    });
    return () => { active = false; };
  }, [loading, session, attempt, navigate]);
  return <AuthFrame title="Payment confirmation" subtitle="Confirming your subscription payment.">
    <section className="space-y-4 text-sm text-muted" aria-live="polite">
      {loading ? <p>Restoring your session…</p> : !session ? <>
        <p>Sign in to confirm your payment. Your pending order is saved for verification.</p>
        <Link className="text-primary font-semibold" to="/login" state={{ paymentReturn: `${location.pathname}${location.search}` }}>Sign in</Link>
      </> : error ? <>
        <p role="alert">{error}</p>
        <Button onClick={() => { setError(''); setAttempt(value => value + 1); }}>Retry verification</Button>
        <Link className="block" to="/dashboard">Return to dashboard</Link>
      </> : <p>Checking your payment securely…</p>}
    </section>
  </AuthFrame>;
}
