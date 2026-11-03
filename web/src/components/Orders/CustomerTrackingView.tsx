import React, { useState, useEffect } from 'react';
import api from '../../lib/api';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';

interface CustomerTrackingViewProps {
  orderId: string;
  onClose?: () => void;
}

export const CustomerTrackingView: React.FC<CustomerTrackingViewProps> = ({
  orderId,
  onClose,
}) => {
  const [tracking, setTracking] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    api.get(`/orders/${orderId}/tracking`)
      .then(res => setTracking(res.data.data))
      .catch(err => setError(err.response?.data?.error?.message || 'Order tracking details not found'))
      .finally(() => setLoading(false));
  }, [orderId]);

  if (loading) {
    return (
      <div className="p-8 text-center text-muted text-sm">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        Loading tracking timeline...
      </div>
    );
  }

  if (error || !tracking) {
    return (
      <div className="p-6 text-center text-danger bg-danger/8 border border-danger/60 rounded-xl">
        <p className="font-bold mb-2">Tracking Error</p>
        <p className="text-xs text-foreground">{error || 'Order tracking not found'}</p>
        {onClose && <Button variant="secondary" className="mt-4" onClick={onClose}>Close</Button>}
      </div>
    );
  }

  const steps = [
    { num: 1, label: 'Order Placed' },
    { num: 2, label: 'Confirmed' },
    { num: 3, label: 'Preparing' },
    { num: 4, label: 'Ready for Pickup / Delivery' },
    { num: 5, label: 'Completed' },
  ];

  return (
    <div className="bg-surface border border-border rounded-2xl p-6 text-foreground-strong max-w-xl mx-auto space-y-6 shadow-2xl">
      <div className="flex justify-between items-center border-b border-border pb-4">
        <div>
          <span className="text-[10px] text-primary uppercase font-bold tracking-wider">Live Order Status</span>
          <h2 className="text-xl font-mono font-black text-foreground-strong">{tracking.orderNumber}</h2>
        </div>
        <Badge variant={tracking.currentStep === 5 ? 'success' : 'primary'}>
          {tracking.displayStatus}
        </Badge>
      </div>

      {/* Progress Bar Stepper */}
      <div className="py-4">
        <div className="flex justify-between items-center relative mb-4">
          <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-1 bg-surface-elevated -z-0" />
          <div
            className="absolute left-0 top-1/2 -translate-y-1/2 h-1 bg-primary transition-all duration-500 -z-0"
            style={{ width: `${Math.min(100, (tracking.currentStep / 5) * 100)}%` }}
          />
          {steps.map(s => {
            const isDone = tracking.currentStep >= s.num;
            const isCurrent = tracking.currentStep === s.num;
            return (
              <div key={s.num} className="relative z-10 flex flex-col items-center">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs transition ${
                    isDone
                      ? 'bg-primary text-on-primary ring-4 ring-slate-900 shadow-lg'
                      : 'bg-surface-elevated text-muted border border-border'
                  } ${isCurrent ? 'animate-pulse' : ''}`}
                >
                  {isDone ? '✓' : s.num}
                </div>
              </div>
            );
          })}
        </div>
        <div className="text-center mt-3">
          <h3 className="text-base font-bold text-foreground-strong">{tracking.displayStatus}</h3>
          <p className="text-xs text-muted mt-1 leading-relaxed">{tracking.description}</p>
        </div>
      </div>

      {onClose && (
        <div className="pt-4 border-t border-border flex justify-end">
          <Button variant="secondary" onClick={onClose}>Close Tracker</Button>
        </div>
      )}
    </div>
  );
};
