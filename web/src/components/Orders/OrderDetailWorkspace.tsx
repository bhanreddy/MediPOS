import React, { useState, useEffect } from 'react';
import api from '../../lib/api';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';

interface OrderDetailWorkspaceProps {
  orderId: string;
  onClose: () => void;
  onRefresh?: () => void;
  onOpenPicking?: (orderId: string) => void;
  onOpenPickup?: (orderId: string) => void;
}

export const OrderDetailWorkspace: React.FC<OrderDetailWorkspaceProps> = ({
  orderId,
  onClose,
  onRefresh,
  onOpenPicking,
  onOpenPickup,
}) => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'items' | 'prescription' | 'reservations' | 'fulfilment' | 'packages' | 'payments' | 'timeline'>('overview');
  const [actionLoading, setActionLoading] = useState(false);

  const fetchDetail = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.get(`/orders/${orderId}`);
      setData(res.data.data);
    } catch (err: any) {
      setError(err.response?.data?.error?.message || err.message || 'Failed to load order details');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDetail();
  }, [orderId]);

  const handleCancelOrder = async () => {
    const reason = prompt('Enter cancellation reason (e.g. CUSTOMER_REQUEST, OUT_OF_STOCK):', 'CUSTOMER_REQUEST');
    if (!reason) return;
    try {
      setActionLoading(true);
      await api.post(`/orders/${orderId}/cancel`, { reason });
      await fetchDetail();
      onRefresh?.();
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Failed to cancel order');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/60  z-50 flex items-center justify-center p-4">
        <div className="bg-surface-elevated border border-border p-8 rounded-xl text-center max-w-md w-full shadow-2xl">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm font-semibold text-foreground">Loading Order Details...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="fixed inset-0 bg-black/60  z-50 flex items-center justify-center p-4">
        <div className="bg-surface-elevated border border-danger/40 p-6 rounded-xl text-center max-w-md w-full shadow-2xl">
          <p className="text-danger font-bold mb-2">Error Loading Order</p>
          <p className="text-xs text-muted mb-4">{error || 'Order record not found'}</p>
          <Button variant="secondary" onClick={onClose}>Close</Button>
        </div>
      </div>
    );
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'CONFIRMED':
      case 'INVENTORY_RESERVED':
        return <Badge variant="primary">{status}</Badge>;
      case 'PICKING':
      case 'PACKED':
        return <Badge variant="warning">{status}</Badge>;
      case 'READY_FOR_PICKUP':
      case 'READY_FOR_DISPATCH':
        return <Badge variant="success">{status.replace(/_/g, ' ')}</Badge>;
      case 'COMPLETED':
        return <Badge variant="success">COMPLETED</Badge>;
      case 'CANCELLED':
        return <Badge variant="danger">CANCELLED</Badge>;
      case 'PRESCRIPTION_PENDING':
        return <Badge variant="warning">RX PENDING</Badge>;
      default:
        return <Badge variant="neutral">{status}</Badge>;
    }
  };

  return (
    <div className="fixed inset-0 bg-black/75  z-50 flex items-center justify-center p-2 sm:p-4 overflow-hidden animate-fadeIn">
      <div className="bg-surface border border-border w-full max-w-6xl h-[90vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden text-foreground-strong">
        {/* Header bar */}
        <div className="px-6 py-4 bg-surface-elevated/80 border-b border-border flex justify-between items-center flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-mono font-black text-foreground-strong tracking-tight">{data.order_number}</h2>
                {getStatusBadge(data.status)}
                <Badge variant={data.priority === 'CRITICAL' || data.priority === 'URGENT' ? 'danger' : 'neutral'}>
                  {data.priority}
                </Badge>
              </div>
              <p className="text-xs text-muted mt-1">
                Placed on {new Date(data.placed_at || data.created_at).toLocaleString()} • Channel: <span className="font-semibold text-foreground-strong">{data.channel}</span> ({data.source})
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {(data.status === 'CONFIRMED' || data.status === 'INVENTORY_RESERVED' || data.status === 'PICKING') && (
              <Button
                variant="primary"
                onClick={() => {
                  onClose();
                  onOpenPicking?.(data.id);
                }}
              >
                📦 Open Pick & Pack
              </Button>
            )}

            {(data.status === 'READY_FOR_PICKUP' || data.status === 'PACKED') && (
              <Button
                variant="primary"
                onClick={() => {
                  onClose();
                  onOpenPickup?.(data.id);
                }}
              >
                🏷️ Verify Pickup & Convert Sale
              </Button>
            )}

            {data.status !== 'COMPLETED' && data.status !== 'CANCELLED' && (
              <Button
                variant="danger"
                disabled={actionLoading}
                onClick={handleCancelOrder}
              >
                Cancel Order
              </Button>
            )}

            <button
              onClick={onClose}
              className="p-2 text-muted hover:text-foreground-strong rounded-lg hover:bg-surface-alt transition"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-border bg-surface/50 px-6 gap-2 overflow-x-auto">
          {[
            { id: 'overview', label: 'Overview' },
            { id: 'items', label: `Items (${data.items?.length || 0})` },
            { id: 'prescription', label: 'Prescription Safety' },
            { id: 'reservations', label: 'FEFO Reservations' },
            { id: 'fulfilment', label: 'Fulfilment & Picking' },
            { id: 'packages', label: `Packages (${data.packages?.length || 0})` },
            { id: 'payments', label: 'Payments & Refunds' },
            { id: 'timeline', label: 'Audit Timeline' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`py-3 px-4 text-xs font-bold uppercase tracking-wider border-b-2 transition ${
                activeTab === tab.id
                  ? 'border-primary text-primary bg-surface-elevated/40'
                  : 'border-transparent text-muted hover:text-foreground-strong'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content Body */}
        <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-6">
          {activeTab === 'overview' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Customer Box */}
              <div className="bg-surface-elevated/50 border border-border rounded-xl p-5 space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-primary">Customer Details</h3>
                <div className="text-sm">
                  <p className="font-bold text-foreground-strong text-base">{data.customer_name || 'Walk-in / Online Customer'}</p>
                  <p className="text-foreground mt-1">📞 {data.customer_phone || 'No phone'}</p>
                  {data.customer_email && <p className="text-foreground text-xs">✉️ {data.customer_email}</p>}
                </div>
                {data.addressSnapshot && (
                  <div className="pt-3 border-t border-border">
                    <p className="text-xs font-semibold text-muted uppercase">Delivery Address Snapshot</p>
                    <p className="text-xs text-foreground-strong mt-1 font-medium leading-relaxed">
                      {data.addressSnapshot.recipient_name} ({data.addressSnapshot.phone})<br />
                      {data.addressSnapshot.address_line_1}, {data.addressSnapshot.address_line_2}<br />
                      {data.addressSnapshot.city}, {data.addressSnapshot.state} - {data.addressSnapshot.pincode}
                    </p>
                  </div>
                )}
              </div>

              {/* Fulfilment & Store Box */}
              <div className="bg-surface-elevated/50 border border-border rounded-xl p-5 space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-primary">Fulfilment Strategy</h3>
                <div className="space-y-2 text-xs">
                  <div>
                    <span className="text-muted">Fulfilment Mode:</span>{' '}
                    <strong className="text-foreground-strong">{data.fulfilment_type.replace(/_/g, ' ')}</strong>
                  </div>
                  <div>
                    <span className="text-muted">Assigned Store:</span>{' '}
                    <strong className="text-foreground-strong">{data.store_name || 'Main Dispensary'} ({data.store_code || 'HYD-01'})</strong>
                  </div>
                  {data.pickup_code && (
                    <div className="bg-surface/80 p-3 rounded-lg border border-border">
                      <span className="text-muted block text-xs">Pickup Verification Code:</span>
                      <strong className="font-mono text-lg text-success tracking-widest">{data.pickup_code}</strong>
                    </div>
                  )}
                </div>
              </div>

              {/* Commercial Summary Box */}
              <div className="bg-surface-elevated/50 border border-border rounded-xl p-5 space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-primary">Commercial Snapshot</h3>
                <div className="space-y-1.5 text-xs text-foreground">
                  <div className="flex justify-between">
                    <span>Items Subtotal:</span>
                    <span className="font-mono">₹{data.subtotal?.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-success">
                    <span>Discounts Applied:</span>
                    <span className="font-mono">-₹{data.discount_total?.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>GST (CGST/SGST/IGST):</span>
                    <span className="font-mono">₹{data.tax_total?.toFixed(2)}</span>
                  </div>
                  {Number(data.delivery_charge || 0) > 0 && (
                    <div className="flex justify-between">
                      <span>Delivery Fee:</span>
                      <span className="font-mono">₹{data.delivery_charge?.toFixed(2)}</span>
                    </div>
                  )}
                  {Number(data.loyalty_redemption_paise || 0) > 0 && (
                    <div className="flex justify-between text-primary">
                      <span>Loyalty Redeemed:</span>
                      <span className="font-mono">-₹{((data.loyalty_redemption_paise || 0) / 100).toFixed(2)}</span>
                    </div>
                  )}
                  <div className="pt-2 border-t border-border flex justify-between text-sm font-bold text-foreground-strong">
                    <span>Grand Total:</span>
                    <span className="font-mono text-success text-base">₹{data.grand_total?.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'items' && (
            <div className="border border-border rounded-xl overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-surface-elevated text-muted font-bold uppercase tracking-wider border-b border-border">
                  <tr>
                    <th className="p-3">Medicine / Product</th>
                    <th className="p-3">Unit</th>
                    <th className="p-3 text-right">Req Qty</th>
                    <th className="p-3 text-right">Fulfilled</th>
                    <th className="p-3 text-right">Unit Price</th>
                    <th className="p-3 text-right">Discount</th>
                    <th className="p-3 text-right">Tax (GST)</th>
                    <th className="p-3 text-right">Line Total</th>
                    <th className="p-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.items?.map((it: any) => (
                    <tr key={it.id} className="hover:bg-surface-elevated/40">
                      <td className="p-3 font-semibold text-foreground-strong">
                        {it.medicine_name}
                        {it.prescription_required ? (
                          <span className="ml-2 text-[10px] bg-danger/8 text-danger border border-danger/25 px-1.5 py-0.5 rounded font-mono">
                            Rx
                          </span>
                        ) : null}
                      </td>
                      <td className="p-3 text-foreground">{it.requested_unit}</td>
                      <td className="p-3 text-right font-mono text-foreground-strong">{it.requested_quantity}</td>
                      <td className="p-3 text-right font-mono text-success">{it.fulfilled_quantity}</td>
                      <td className="p-3 text-right font-mono">₹{(it.unit_price_paise / 100).toFixed(2)}</td>
                      <td className="p-3 text-right font-mono text-muted">₹{(it.discount_amount_paise / 100).toFixed(2)}</td>
                      <td className="p-3 text-right font-mono text-muted">₹{(it.tax_amount_paise / 100).toFixed(2)}</td>
                      <td className="p-3 text-right font-mono font-bold text-foreground-strong">₹{(it.line_total_paise / 100).toFixed(2)}</td>
                      <td className="p-3 text-center">
                        <Badge variant="neutral">{it.status}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'prescription' && (
            <div className="bg-surface-elevated/40 border border-border rounded-xl p-6 space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-sm font-bold uppercase tracking-wider text-foreground-strong">Prescription Verification Status</h3>
                <Badge variant={data.prescription_status === 'VERIFIED' ? 'success' : (data.prescription_status === 'NOT_REQUIRED' ? 'neutral' : 'warning')}>
                  {data.prescription_status}
                </Badge>
              </div>
              <p className="text-xs text-muted leading-relaxed">
                Prescription medicines require verification by a licensed pharmacist before packing and dispensing.
              </p>
            </div>
          )}

          {activeTab === 'reservations' && (
            <div className="border border-border rounded-xl overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-surface-elevated text-muted font-bold uppercase tracking-wider border-b border-border">
                  <tr>
                    <th className="p-3">Medicine</th>
                    <th className="p-3">Allocated Batch</th>
                    <th className="p-3 text-right">Allocated Qty</th>
                    <th className="p-3 text-right">Picked Qty</th>
                    <th className="p-3">Reservation ID</th>
                    <th className="p-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.fulfilmentItems?.map((fi: any) => (
                    <tr key={fi.id} className="hover:bg-surface-elevated/40">
                      <td className="p-3 font-semibold text-foreground-strong">{fi.medicine_id}</td>
                      <td className="p-3 font-mono text-warning">{fi.batch_id || 'FEFO Auto'}</td>
                      <td className="p-3 text-right font-mono text-foreground-strong">{fi.quantity_allocated}</td>
                      <td className="p-3 text-right font-mono text-success">{fi.quantity_picked}</td>
                      <td className="p-3 font-mono text-muted text-[10px]">{fi.reservation_id || 'N/A'}</td>
                      <td className="p-3 text-center"><Badge variant="primary">{fi.status}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'packages' && (
            <div className="space-y-4">
              {data.packages?.map((pkg: any) => (
                <div key={pkg.id} className="bg-surface-elevated/50 border border-border rounded-xl p-5 flex justify-between items-center flex-wrap gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-mono font-bold text-foreground-strong text-base">{pkg.package_label}</h4>
                      {pkg.is_cold_chain ? <Badge variant="warning">❄️ Cold Chain</Badge> : null}
                      {pkg.is_prescription_required ? <Badge variant="danger">Rx Regulated</Badge> : null}
                    </div>
                    <p className="text-xs text-muted mt-1">
                      Seal: <span className="font-mono text-foreground-strong">{pkg.seal_number}</span> • Packed by: <span className="text-foreground-strong">{pkg.packed_by}</span> at {new Date(pkg.packed_at).toLocaleTimeString()}
                    </p>
                  </div>
                  <div className="text-right font-mono text-xs text-foreground">
                    Type: {pkg.package_type}<br />Weight: {pkg.weight_kg} kg
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'payments' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-sm font-bold uppercase tracking-wider text-foreground-strong">Payment Transactions</h3>
                <Badge variant={data.payment_status === 'PAID' ? 'success' : 'warning'}>{data.payment_status}</Badge>
              </div>
              <div className="border border-border rounded-xl overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-surface-elevated text-muted font-bold uppercase tracking-wider border-b border-border">
                    <tr>
                      <th className="p-3">Time</th>
                      <th className="p-3">Tender Mode</th>
                      <th className="p-3">Reference / Txn #</th>
                      <th className="p-3 text-right">Amount</th>
                      <th className="p-3 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {data.paymentTransactions?.map((pt: any) => (
                      <tr key={pt.id} className="hover:bg-surface-elevated/40">
                        <td className="p-3 text-muted">{new Date(pt.created_at).toLocaleTimeString()}</td>
                        <td className="p-3 font-bold text-foreground-strong">{pt.tender_type}</td>
                        <td className="p-3 font-mono text-foreground">{pt.reference_number || 'N/A'}</td>
                        <td className="p-3 text-right font-mono font-bold text-success">₹{pt.amount?.toFixed(2)}</td>
                        <td className="p-3 text-center"><Badge variant="success">{pt.status}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'timeline' && (
            <div className="space-y-4 pl-4 border-l-2 border-border ml-4">
              {data.timeline?.map((ev: any) => (
                <div key={ev.id} className="relative pl-6">
                  <div className="absolute -left-[31px] top-1.5 w-3 h-3 rounded-full bg-primary ring-4 ring-slate-900" />
                  <div className="flex items-baseline gap-2">
                    <span className="font-bold text-foreground-strong text-xs">{ev.event_type}</span>
                    <span className="text-[10px] text-muted font-mono">{new Date(ev.created_at).toLocaleString()}</span>
                  </div>
                  <p className="text-xs text-foreground mt-0.5">{ev.notes || `State transition to ${ev.to_status}`}</p>
                  <p className="text-[10px] text-muted">By {ev.actor_name || ev.actor_id}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
