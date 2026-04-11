import { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { uiSlice } from '../../state/slices';
import type { RootState } from '../../state/store';
import { createSubscriptionOrder, type PlanId } from '../../services/subscriptionApi';
import { AuthService } from '../../services/authService';
import type { AuthGate } from '../../services/authGateService';

const PENDING_KEY = 'medpos_phonepe_merchant_order';

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
    const pe = sessionStorage.getItem('medpos_payment_error');
    if (pe) {
      setError(pe);
      sessionStorage.removeItem('medpos_payment_error');
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
      sessionStorage.setItem(PENDING_KEY, order.merchant_order_id);
      window.location.assign(order.redirect_url);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Payment start failed';
      setError(msg);
    } finally {
      dispatch(uiSlice.actions.setLoading(false));
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6 select-none font-sans">
      <div className="w-full max-w-lg bg-surface/95 border border-border/80 rounded-2xl shadow-xl p-8 ring-1 ring-black/5 dark:ring-white/10">
        <Badge variant="primary">Billing</Badge>
        <h2 className="text-2xl font-black text-foreground-strong mt-3 tracking-tight uppercase italic">{title}</h2>
        <p className="text-muted text-sm mt-2">{subtitle}</p>

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
              className={`text-left rounded-xl border p-4 transition-all ${
                plan === p.id
                  ? 'border-primary bg-primary/10 ring-2 ring-primary/30'
                  : 'border-border hover:border-border/80 bg-surface-elevated/60'
              }`}
            >
              <p className="text-xs font-black uppercase tracking-widest text-muted">{p.label}</p>
              <p className="text-sm font-bold text-foreground-strong mt-1">{p.hint}</p>
              <p className="text-[11px] text-muted mt-2">Amount is set on the server for this plan.</p>
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
                sessionStorage.removeItem(PENDING_KEY);
                await AuthService.logout();
                onNavigate('login');
              })()
            }
          >
            Sign out
          </Button>
        </div>

        <p className="text-[11px] text-muted mt-6 leading-relaxed">
          You will be redirected to PhonePe to complete payment. After paying, you will return to this app; the server
          verifies status and activates your subscription. Configure the same return URL in PhonePe and in{' '}
          <code className="text-foreground-strong">VITE_PHONEPE_RETURN_PATH</code> /{' '}
          <code className="text-foreground-strong">PHONEPE_REDIRECT_URL</code>.
        </p>
      </div>
    </div>
  );
}
