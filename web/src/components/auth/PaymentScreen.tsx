import { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Button } from '../ui/Button';
import { AuthFrame } from './AuthFrame';
import { uiSlice } from '../../state/slices';
import type { RootState } from '../../state/store';
import { createSubscriptionOrder, type PlanId } from '../../services/subscriptionApi';
import { AuthService } from '../../services/authService';
import type { AuthGate } from '../../services/authGateService';
import {
  PHONEPE_SESSION_PAYMENT_ERROR,
  PHONEPE_SESSION_PENDING_USER,
  redirectToPhonePeCheckout,
} from '../../payment/phonePePG';

export function PaymentScreen({
  onNavigate,
  title = 'Activate subscription',
  subtitle = 'Choose a plan to unlock billing, inventory, and compliance tools.',
}: {
  onNavigate: (gate: AuthGate) => void;
  title?: string;
  subtitle?: string;
}) {
  const [plan, setPlan] = useState<PlanId>('monthly');
  const [error, setError] = useState('');
  const dispatch = useDispatch();
  const { isLoading } = useSelector((s: RootState) => s.ui);

  useEffect(() => {
    const pe = sessionStorage.getItem(PHONEPE_SESSION_PAYMENT_ERROR);
    if (pe) {
      setError(pe);
      sessionStorage.removeItem(PHONEPE_SESSION_PAYMENT_ERROR);
    }
  }, []);

  const startCheckout = async () => {
    setError('');
    dispatch(uiSlice.actions.setLoading(true));
    try {
      const order = await createSubscriptionOrder(plan);
      if (!order.redirect_url || !order.merchant_order_id) {
        throw new Error('Invalid response from payment server (missing redirect).');
      }
      redirectToPhonePeCheckout(PHONEPE_SESSION_PENDING_USER, order.merchant_order_id, order.redirect_url);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Payment start failed';
      setError(msg);
    } finally {
      dispatch(uiSlice.actions.setLoading(false));
    }
  };

  return (
    <AuthFrame title={title} subtitle={subtitle}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-8">
          {(
            [
              { id: 'monthly' as const, label: 'Monthly', hint: 'Flexible for new shops' },
              { id: 'yearly' as const, label: 'Yearly', hint: 'Best value (2 months free)' },
            ] as const
          ).map(p => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPlan(p.id)}
              aria-pressed={plan === p.id}
              className={`text-left rounded-lg border p-4 transition-colors ${
                plan === p.id
                  ? 'border-primary bg-primary/10 ring-2 ring-primary/30'
                  : 'border-border hover:border-border/80 bg-surface-elevated/60'
              }`}
            >
              <p className="text-xs font-black uppercase tracking-widest text-muted">{p.label}</p>
              <p className="text-sm font-bold text-foreground-strong mt-1">{p.hint}</p>
            </button>
          ))}
        </div>

        {error && <p className="text-danger text-sm font-semibold mt-4">{error}</p>}

        <div className="flex flex-col sm:flex-row gap-3 mt-8">
          <Button className="flex-1 h-12" isLoading={isLoading} onClick={() => void startCheckout()}>
            Pay with PhonePe
          </Button>
          <Button
            variant="secondary"
            className="flex-1 h-12"
            disabled={isLoading}
            onClick={() =>
              void (async () => {
                sessionStorage.removeItem(PHONEPE_SESSION_PENDING_USER);
                await AuthService.logout();
                onNavigate('login');
              })()
            }
          >
            Sign out
          </Button>
        </div>

        <p className="text-[11px] text-muted mt-6 leading-relaxed">
          Complete your payment securely with PhonePe. Your subscription will activate once your payment is confirmed.
        </p>
    </AuthFrame>
  );
}
