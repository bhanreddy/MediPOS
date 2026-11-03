import React, { useState, useEffect, useRef } from 'react';
import api from '../../lib/api';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';

interface PickingWorkspaceProps {
  orderId?: string | null;
  onClose: () => void;
  onRefresh?: () => void;
}

export const PickingWorkspace: React.FC<PickingWorkspaceProps> = ({
  orderId: initialOrderId,
  onClose,
  onRefresh,
}) => {
  const [activeOrderId, setActiveOrderId] = useState<string | null>(initialOrderId || null);
  const [pickQueue, setPickQueue] = useState<any[]>([]);
  const [orderDetail, setOrderDetail] = useState<any>(null);
  const [barcodeInput, setBarcodeInput] = useState('');
  const [scanMessage, setScanMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [shortageDialogItem, setShortageDialogItem] = useState<any>(null);
  const [shortageFoundCount, setShortageFoundCount] = useState<number>(0);
  const [actionLoading, setActionLoading] = useState(false);

  const barcodeInputRef = useRef<HTMLInputElement>(null);

  const fetchQueue = async () => {
    try {
      const res = await api.get('/orders/picking/queue', {
        headers: { 'x-store-id': 'default-store' },
      });
      setPickQueue(res.data.data || []);
      if (!activeOrderId && res.data.data?.length > 0) {
        setActiveOrderId(res.data.data[0].orderId);
      }
    } catch (err) {
      console.error('Failed to fetch pick queue:', err);
    }
  };

  const fetchOrderDetail = async (id: string) => {
    try {
      const res = await api.get(`/orders/${id}`);
      setOrderDetail(res.data.data);
    } catch (err) {
      console.error('Failed to fetch order detail for picking:', err);
    }
  };

  useEffect(() => {
    fetchQueue();
  }, []);

  useEffect(() => {
    if (activeOrderId) {
      fetchOrderDetail(activeOrderId);
      barcodeInputRef.current?.focus();
    }
  }, [activeOrderId]);

  const handleStartPicking = async () => {
    if (!activeOrderId) return;
    try {
      setActionLoading(true);
      await api.post(`/orders/${activeOrderId}/pick/start`);
      await fetchOrderDetail(activeOrderId);
      await fetchQueue();
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Failed to start picking');
    } finally {
      setActionLoading(false);
    }
  };

  const handleBarcodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const barcode = barcodeInput.trim();
    if (!barcode || !activeOrderId || !orderDetail) return;

    try {
      setScanMessage(null);
      // Find matching item in order
      const matchingItem = orderDetail.items?.find((it: any) =>
        it.medicine_name.toLowerCase().includes(barcode.toLowerCase()) ||
        it.medicine_id === barcode ||
        it.status !== 'PICKED'
      ) || orderDetail.items?.find((it: any) => it.status !== 'PICKED');

      if (!matchingItem) {
        setScanMessage({ type: 'error', text: 'All items are already picked for this order' });
        setBarcodeInput('');
        return;
      }

      await api.post(`/orders/${activeOrderId}/pick/item`, {
        order_item_id: matchingItem.id,
        barcode,
        quantity: matchingItem.requested_quantity,
      });

      setScanMessage({
        type: 'success',
        text: `✓ Picked ${matchingItem.requested_quantity}x ${matchingItem.medicine_name}`,
      });
      setBarcodeInput('');
      await fetchOrderDetail(activeOrderId);
      await fetchQueue();
    } catch (err: any) {
      setScanMessage({
        type: 'error',
        text: err.response?.data?.error?.message || 'Barcode validation failed',
      });
    } finally {
      barcodeInputRef.current?.focus();
    }
  };

  const handleRecordShortage = async () => {
    if (!shortageDialogItem || !activeOrderId) return;
    try {
      setActionLoading(true);
      await api.post(`/orders/${activeOrderId}/pick/shortage`, {
        order_item_id: shortageDialogItem.id,
        found_quantity: Number(shortageFoundCount),
        reason: 'PHYSICAL_SHORTAGE_DURING_PICK',
      });
      setShortageDialogItem(null);
      await fetchOrderDetail(activeOrderId);
      await fetchQueue();
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Failed to record shortage');
    } finally {
      setActionLoading(false);
    }
  };

  const handlePackOrder = async () => {
    if (!activeOrderId) return;
    try {
      setActionLoading(true);
      await api.post(`/orders/${activeOrderId}/pack`, {
        special_instructions: 'Handle with care',
      });
      alert('✓ Order successfully packed & labeled! Ready for customer pickup / dispatch.');
      await fetchQueue();
      onRefresh?.();
      onClose();
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Failed to complete packing');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80  z-50 flex items-center justify-center p-2 sm:p-4 overflow-hidden animate-fadeIn">
      <div className="bg-surface border border-border w-full max-w-7xl h-[92vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden text-foreground-strong">
        {/* Workspace Header */}
        <div className="px-6 py-4 bg-surface-elevated border-b border-border flex justify-between items-center">
          <div className="flex items-center gap-3">
            <span className="text-2xl">📦</span>
            <div>
              <h2 className="text-lg font-black tracking-tight text-foreground-strong uppercase">Store Pick & Pack Workspace</h2>
              <p className="text-xs text-muted">Barcode-driven fulfillment queue with batch validation and packaging</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-muted hover:text-foreground-strong rounded-lg hover:bg-surface-alt transition"
          >
            ✕
          </button>
        </div>

        {/* Split Body: Left Queue / Right Active Order */}
        <div className="flex-1 min-h-0 flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-border">
          {/* Left Column: Queue */}
          <div className="w-full md:w-80 bg-surface/60 overflow-y-auto p-4 space-y-3">
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-muted">Pick Queue ({pickQueue.length})</span>
              <button onClick={fetchQueue} className="text-xs text-primary hover:underline">Refresh</button>
            </div>

            {pickQueue.length === 0 ? (
              <div className="p-8 text-center text-muted text-xs">
                No active orders in picking queue.
              </div>
            ) : (
              pickQueue.map(q => (
                <div
                  key={q.orderId}
                  onClick={() => setActiveOrderId(q.orderId)}
                  className={`p-3 rounded-xl border cursor-pointer transition ${
                    activeOrderId === q.orderId
                      ? 'bg-surface-elevated border-primary shadow-md'
                      : 'bg-surface-elevated/40 border-border/60 hover:bg-surface-elevated/70'
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <strong className="font-mono text-sm text-foreground-strong">{q.orderNumber}</strong>
                    <Badge variant={q.priority === 'URGENT' || q.priority === 'CRITICAL' ? 'danger' : 'neutral'}>
                      {q.priority}
                    </Badge>
                  </div>
                  <p className="text-xs text-foreground mt-1 font-medium">{q.customerName}</p>
                  <div className="flex justify-between items-center text-[10px] text-muted mt-2">
                    <span>{q.totalItems} items ({q.totalQuantity} units)</span>
                    <Badge variant="primary">{q.status}</Badge>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Right Column: Picking Terminal */}
          <div className="flex-1 flex flex-col min-h-0 bg-surface/40">
            {orderDetail ? (
              <div className="flex-1 flex flex-col min-h-0 p-6 space-y-5">
                {/* Active Order Summary Header */}
                <div className="flex justify-between items-center bg-surface-elevated/70 border border-border p-4 rounded-xl flex-wrap gap-3">
                  <div>
                    <div className="flex items-center gap-3">
                      <h3 className="text-lg font-mono font-black text-foreground-strong">{orderDetail.order_number}</h3>
                      <Badge variant="primary">{orderDetail.status}</Badge>
                      <Badge variant="neutral">{orderDetail.fulfilment_type.replace(/_/g, ' ')}</Badge>
                    </div>
                    <p className="text-xs text-muted mt-1">Customer: <strong className="text-foreground-strong">{orderDetail.customer_name}</strong> • Phone: {orderDetail.customer_phone}</p>
                  </div>

                  <div className="flex items-center gap-2">
                    {orderDetail.status !== 'PICKING' && (
                      <Button
                        variant="primary"
                        disabled={actionLoading}
                        onClick={handleStartPicking}
                      >
                        ▶ Start Pick Session
                      </Button>
                    )}
                    <Button
                      variant="success"
                      disabled={actionLoading}
                      onClick={handlePackOrder}
                    >
                      📦 Finalize Packaging & Label
                    </Button>
                  </div>
                </div>

                {/* Barcode Scanner Input */}
                <div className="bg-surface-elevated/90 border-2 border-primary/60 rounded-xl p-4 shadow-lg">
                  <form onSubmit={handleBarcodeSubmit} className="flex gap-3">
                    <div className="flex-1">
                      <input
                        ref={barcodeInputRef}
                        type="text"
                        placeholder="Scan or type product barcode / name to confirm pick..."
                        value={barcodeInput}
                        onChange={e => setBarcodeInput(e.target.value)}
                        className="w-full bg-background border border-border rounded-lg px-4 py-2.5 text-sm font-mono text-foreground-strong placeholder-slate-500 focus:outline-none focus:border-primary"
                      />
                    </div>
                    <Button variant="primary" type="submit" className="font-bold px-6">
                      Scan & Pick
                    </Button>
                  </form>
                  {scanMessage && (
                    <div className={`mt-2.5 text-xs font-semibold px-3 py-1.5 rounded-md ${
                      scanMessage.type === 'success' ? 'bg-success/8 text-success border border-success/25' : 'bg-danger/8 text-danger border border-danger/25'
                    }`}>
                      {scanMessage.text}
                    </div>
                  )}
                </div>

                {/* Items Picking Checklist */}
                <div className="flex-1 min-h-0 border border-border rounded-xl overflow-y-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-surface-elevated text-muted font-bold uppercase tracking-wider sticky top-0 border-b border-border">
                      <tr>
                        <th className="p-3">Item / Medicine</th>
                        <th className="p-3">Unit</th>
                        <th className="p-3 text-right">Target Qty</th>
                        <th className="p-3 text-right">Picked</th>
                        <th className="p-3 text-center">Status</th>
                        <th className="p-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {orderDetail.items?.map((it: any) => {
                        const isPicked = it.fulfilled_quantity >= it.requested_quantity || it.status === 'PICKED';
                        return (
                          <tr key={it.id} className={isPicked ? 'bg-success/8' : 'hover:bg-surface-elevated/40'}>
                            <td className="p-3 font-semibold text-foreground-strong">
                              {it.medicine_name}
                              {it.prescription_required ? (
                                <span className="ml-2 text-[10px] bg-danger/8 text-danger border border-danger/25 px-1.5 py-0.5 rounded font-mono">
                                  Rx
                                </span>
                              ) : null}
                            </td>
                            <td className="p-3 text-foreground">{it.requested_unit}</td>
                            <td className="p-3 text-right font-mono text-foreground-strong text-sm">{it.requested_quantity}</td>
                            <td className="p-3 text-right font-mono font-bold text-success text-sm">{it.fulfilled_quantity}</td>
                            <td className="p-3 text-center">
                              {isPicked ? (
                                <Badge variant="success">PICKED</Badge>
                              ) : (
                                <Badge variant="warning">{it.status}</Badge>
                              )}
                            </td>
                            <td className="p-3 text-right">
                              {!isPicked && (
                                <div className="flex justify-end gap-1.5">
                                  <button
                                    onClick={() => {
                                      setShortageDialogItem(it);
                                      setShortageFoundCount(0);
                                    }}
                                    className="px-2 py-1 text-[11px] font-semibold bg-warning/8 text-warning border border-warning/60 rounded hover:bg-warning/8 transition"
                                  >
                                    Shortage
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center p-8 text-center text-muted text-sm">
                Select an order from the pick queue to begin picking.
              </div>
            )}
          </div>
        </div>

        {/* Shortage Dialog */}
        {shortageDialogItem && (
          <div className="fixed inset-0 bg-black/70  z-50 flex items-center justify-center p-4">
            <div className="bg-surface-elevated border border-border p-6 rounded-xl max-w-md w-full space-y-4 shadow-2xl">
              <h3 className="text-sm font-bold text-foreground-strong uppercase tracking-wider">Report Physical Shortage</h3>
              <p className="text-xs text-foreground">
                Item: <strong className="text-foreground-strong">{shortageDialogItem.medicine_name}</strong><br />
                Requested Quantity: <strong className="font-mono text-foreground-strong">{shortageDialogItem.requested_quantity}</strong>
              </p>
              <div>
                <label className="block text-xs font-semibold text-muted uppercase mb-1">
                  Actual Physical Quantity Found
                </label>
                <input
                  type="number"
                  min="0"
                  max={shortageDialogItem.requested_quantity}
                  value={shortageFoundCount}
                  onChange={e => setShortageFoundCount(Number(e.target.value))}
                  className="w-full bg-surface border border-border rounded px-3 py-2 text-foreground-strong font-mono"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="secondary" onClick={() => setShortageDialogItem(null)}>Cancel</Button>
                <Button variant="danger" disabled={actionLoading} onClick={handleRecordShortage}>Confirm Shortage</Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
