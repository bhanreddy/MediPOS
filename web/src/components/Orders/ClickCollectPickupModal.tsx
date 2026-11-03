import React, { useState } from 'react';
import api from '../../lib/api';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';

interface ClickCollectPickupModalProps {
  orderId: string;
  onClose: () => void;
  onSuccess?: () => void;
}

export const ClickCollectPickupModal: React.FC<ClickCollectPickupModalProps> = ({
  orderId,
  onClose,
  onSuccess,
}) => {
  const [pickupCode, setPickupCode] = useState('');
  const [verifiedOrder, setVerifiedOrder] = useState<any>(null);
  const [tenderType, setTenderType] = useState<string>('CASH');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [completedSale, setCompletedSale] = useState<any>(null);

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pickupCode.trim()) return;

    try {
      setLoading(true);
      setError(null);
      const res = await api.post(`/orders/${orderId}/pickup/verify`, {
        pickup_code: pickupCode.trim(),
      });
      setVerifiedOrder(res.data.data.order);
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Invalid pickup PIN / verification code');
    } finally {
      setLoading(false);
    }
  };

  const handleCompletePickup = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.post(`/orders/${orderId}/complete-pickup`, {
        payments: verifiedOrder?.payment_status === 'PAID'
          ? []
          : [{ tender_type: tenderType, amount: verifiedOrder?.grand_total || 0 }],
      });
      setCompletedSale(res.data.data);
      onSuccess?.();
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Failed to complete order pickup');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/75  z-50 flex items-center justify-center p-4 overflow-hidden animate-fadeIn">
      <div className="bg-surface border border-border w-full max-w-lg rounded-2xl shadow-2xl p-6 text-foreground-strong space-y-5">
        <div className="flex justify-between items-center border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <span className="text-xl">🏷️</span>
            <h2 className="text-base font-black text-foreground-strong uppercase tracking-tight">Click & Collect Pickup Handoff</h2>
          </div>
          <button onClick={onClose} className="text-muted hover:text-foreground-strong text-sm">✕</button>
        </div>

        {completedSale ? (
          <div className="text-center py-6 space-y-4">
            <div className="w-12 h-12 bg-success/8 text-success border border-success/25 rounded-full flex items-center justify-center mx-auto text-2xl font-bold">
              ✓
            </div>
            <div>
              <h3 className="text-lg font-bold text-foreground-strong">Order Completed & Billed</h3>
              <p className="text-xs text-muted mt-1">
                Sale Invoice Generated: <strong className="font-mono text-success">{completedSale.invoiceNumber}</strong>
              </p>
            </div>
            <div className="bg-surface-elevated/80 p-4 rounded-xl text-left text-xs space-y-2 border border-border">
              <div className="flex justify-between">
                <span className="text-muted">Total Billed:</span>
                <strong className="font-mono text-foreground-strong">₹{completedSale.sale?.grand_total?.toFixed(2)}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Stock Deducted:</span>
                <span className="text-success font-semibold">Consumed from Reserved</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Ledger Entry:</span>
                <span className="text-foreground font-mono">Sale</span>
              </div>
            </div>
            <Button variant="primary" className="w-full font-bold" onClick={onClose}>
              Done & Return to OMS
            </Button>
          </div>
        ) : !verifiedOrder ? (
          <form onSubmit={handleVerifyCode} className="space-y-4">
            <p className="text-xs text-muted leading-relaxed">
              Ask customer for their 6-digit Pickup PIN or QR code sent via WhatsApp/SMS to authorize order handoff.
            </p>
            <div>
              <label className="block text-xs font-semibold text-muted uppercase mb-1">
                Customer Pickup PIN / Code
              </label>
              <input
                type="text"
                autoFocus
                placeholder="e.g. 847291"
                value={pickupCode}
                onChange={e => setPickupCode(e.target.value)}
                className="w-full bg-background border border-border rounded-lg px-4 py-3 text-center text-2xl font-mono tracking-widest text-success font-bold focus:outline-none focus:border-primary"
              />
            </div>
            {error && (
              <div className="text-xs font-semibold text-danger bg-danger/8 border border-danger/25 p-2.5 rounded">
                {error}
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={onClose}>Cancel</Button>
              <Button variant="primary" type="submit" disabled={loading || !pickupCode.trim()}>
                {loading ? 'Verifying...' : 'Verify Code'}
              </Button>
            </div>
          </form>
        ) : (
          <div className="space-y-4">
            <div className="bg-success/8 border border-success/60 p-4 rounded-xl flex items-center justify-between">
              <div>
                <p className="text-xs text-success font-bold uppercase">✓ Pickup Code Verified</p>
                <p className="text-sm font-bold text-foreground-strong mt-0.5">{verifiedOrder.order_number}</p>
              </div>
              <Badge variant="success">READY</Badge>
            </div>

            {verifiedOrder.payment_status === 'PAID' ? (
              <div className="bg-surface-elevated/60 p-3 rounded-lg border border-border text-xs flex justify-between items-center">
                <span className="text-muted">Payment Status:</span>
                <span className="font-bold text-success font-mono">PREPAID (₹{verifiedOrder.grand_total})</span>
              </div>
            ) : (
              <div className="space-y-3">
                <label className="block text-xs font-semibold text-muted uppercase">
                  Collect Payment (Amount Due: ₹{verifiedOrder.grand_total?.toFixed(2)})
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {['CASH', 'UPI', 'CARD'].map(t => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setTenderType(t)}
                      className={`py-2 px-3 text-xs font-bold rounded-lg border transition ${
                        tenderType === t
                          ? 'bg-primary text-on-primary border-primary shadow'
                          : 'bg-surface-elevated text-foreground border-border hover:bg-surface-alt'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {error && (
              <div className="text-xs font-semibold text-danger bg-danger/8 border border-danger/25 p-2.5 rounded">
                {error}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <Button variant="secondary" onClick={() => setVerifiedOrder(null)}>Back</Button>
              <Button variant="success" className="font-bold" disabled={loading} onClick={handleCompletePickup}>
                {loading ? 'Processing Sale...' : 'Handover & Convert to Sale'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
