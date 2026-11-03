import React, { useState } from 'react';
import {
  ArrowLeft,
  CheckCircle,
  XCircle,
  Truck,
  Box,
  Clock,
  Check,
} from 'lucide-react';

export interface TransferDetailWorkspaceProps {
  transfer: any;
  onBack: () => void;
  onApprove: () => Promise<void>;
  onReject: (reason: string) => Promise<void>;
  onCancel?: (reason: string) => Promise<void>;
  onDispatch: (carrier: string, tracking: string) => Promise<void>;
  onReceive: (items: any[], condition: string) => Promise<void>;
  onPack?: (pkgType: string, isColdChain: boolean, items: any[]) => Promise<void>;
  onRecordPick: (allocId: string, qty: number, barcode?: string, batch?: string) => Promise<void>;
  onCompletePick: () => Promise<void>;
  onResolveVariance?: (varId: string, resolution: string, notes: string) => Promise<void>;
}

export const TransferDetailWorkspace: React.FC<TransferDetailWorkspaceProps> = ({
  transfer,
  onBack,
  onApprove,
  onReject,
  onDispatch,
  onReceive,
  onRecordPick,
  onCompletePick,
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'items' | 'picking' | 'dispatch' | 'receiving' | 'timeline'>('overview');
  const [carrierName, setCarrierName] = useState('Internal Express Logistics');
  const [trackingReference, setTrackingReference] = useState('');
  const [receiptCondition, setReceiptCondition] = useState<'GOOD' | 'DAMAGED_PACKAGING' | 'TEMPERATURE_BREACH' | 'TAMPERED'>('GOOD');
  const [pickedQuantities, setPickedQuantities] = useState<Record<string, number>>({});
  const [receivedInputs, setReceivedInputs] = useState<Record<string, { accepted: number; damaged: number; short: number; excess: number }>>({});
  const [isProcessing, setIsProcessing] = useState(false);

  // Initialize receipt inputs if empty
  React.useEffect(() => {
    if (transfer?.allocations) {
      const initialReceipt: Record<string, { accepted: number; damaged: number; short: number; excess: number }> = {};
      const initialPick: Record<string, number> = {};
      for (const a of transfer.allocations) {
        const qty = Number(a.quantity_dispatched || a.quantity_picked || a.quantity_allocated);
        initialReceipt[a.id] = { accepted: qty, damaged: 0, short: 0, excess: 0 };
        initialPick[a.id] = Number(a.quantity_picked || a.quantity_allocated);
      }
      setReceivedInputs(initialReceipt);
      setPickedQuantities(initialPick);
    }
  }, [transfer]);

  if (!transfer) return null;

  const handlePickSubmit = async (allocId: string) => {
    try {
      setIsProcessing(true);
      const qty = pickedQuantities[allocId] || 1;
      await onRecordPick(allocId, qty);
    } catch (err: any) {
      alert(`Pick failed: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDispatchSubmit = async () => {
    try {
      setIsProcessing(true);
      await onDispatch(carrierName, trackingReference);
    } catch (err: any) {
      alert(`Dispatch failed: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReceiveSubmit = async () => {
    try {
      setIsProcessing(true);
      const itemsPayload = (transfer.allocations || []).map((a: any) => {
        const input = receivedInputs[a.id] || { accepted: 0, damaged: 0, short: 0, excess: 0 };
        return {
          transferItemId: a.transfer_item_id,
          batchAllocationId: a.id,
          medicineId: a.medicine_id,
          batchId: a.batch_id,
          quantityAccepted: input.accepted,
          quantityDamaged: input.damaged,
          quantityShort: input.short,
          quantityExcess: input.excess,
        };
      });
      await onReceive(itemsPayload, receiptCondition);
    } catch (err: any) {
      alert(`Receipt failed: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header Bar */}
      <div className="bg-surface border border-border rounded-lg p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-1.5 bg-surface-elevated hover:bg-surface-alt text-foreground rounded border border-border transition"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold text-foreground-strong font-mono">{transfer.transfer_number}</h1>
              <span className="px-2 py-0.5 rounded text-xs font-semibold bg-primary/10 text-primary border border-primary/20">
                {transfer.status}
              </span>
              {transfer.is_cold_chain && (
                <span className="px-2 py-0.5 rounded text-xs font-semibold bg-info/10 text-info border border-info/20">
                  COLD CHAIN
                </span>
              )}
            </div>
            <p className="text-xs text-muted mt-0.5">
              {transfer.source_name} ({transfer.source_location_type}) → {transfer.destination_name} ({transfer.destination_location_type})
            </p>
          </div>
        </div>

        {/* Action Buttons based on Status */}
        <div className="flex items-center gap-2">
          {transfer.status === 'REQUESTED' && (
            <>
              <button
                onClick={onApprove}
                disabled={isProcessing}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-success hover:bg-success text-on-primary text-xs font-semibold rounded shadow-sm transition"
              >
                <CheckCircle className="w-3.5 h-3.5" /> Approve Transfer
              </button>
              <button
                onClick={() => {
                  const r = prompt('Enter rejection reason:');
                  if (r) onReject(r);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-danger/80 hover:bg-danger text-on-primary text-xs font-semibold rounded shadow-sm transition"
              >
                <XCircle className="w-3.5 h-3.5" /> Reject
              </button>
            </>
          )}

          {transfer.status === 'APPROVED' && (
            <button
              onClick={() => setActiveTab('picking')}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-info hover:bg-info text-on-primary text-xs font-semibold rounded shadow-sm transition"
            >
              <Box className="w-3.5 h-3.5" /> Start Picking
            </button>
          )}

          {(transfer.status === 'PICKED' || transfer.status === 'PACKED') && (
            <button
              onClick={() => setActiveTab('dispatch')}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-primary hover:bg-primary text-foreground-strong text-xs font-semibold rounded shadow-sm transition"
            >
              <Truck className="w-3.5 h-3.5" /> Dispatch Stock
            </button>
          )}

          {(transfer.status === 'DISPATCHED' || transfer.status === 'IN_TRANSIT' || transfer.status === 'PARTIALLY_RECEIVED') && (
            <button
              onClick={() => setActiveTab('receiving')}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-success hover:bg-success text-on-primary text-xs font-semibold rounded shadow-sm transition"
            >
              <Check className="w-3.5 h-3.5" /> Receive at Destination
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border bg-surface/40 rounded-t-lg px-2">
        {[
          { key: 'overview', label: 'Overview' },
          { key: 'items', label: `Items (${transfer.items?.length || 0})` },
          { key: 'picking', label: 'Picking & Bin Route' },
          { key: 'dispatch', label: 'Dispatch & Carrier' },
          { key: 'receiving', label: 'Receiving & Variances' },
          { key: 'timeline', label: 'Audit Timeline' },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as any)}
            className={`px-4 py-2 text-xs font-medium border-b-2 transition ${
              activeTab === tab.key
                ? 'border-primary/25 text-primary bg-surface-elevated/50'
                : 'border-transparent text-muted hover:text-foreground-strong'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Contents */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-3 gap-4">
          <div className="col-span-2 bg-surface border border-border rounded-lg p-4 space-y-3">
            <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider">Transfer Details</h3>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-muted">Transfer Type:</span>
                <p className="text-foreground-strong font-medium">{transfer.transfer_type}</p>
              </div>
              <div>
                <span className="text-muted">Priority:</span>
                <p className="text-foreground-strong font-medium">{transfer.priority}</p>
              </div>
              <div>
                <span className="text-muted">Stock State Transferred:</span>
                <p className="text-foreground-strong font-mono font-medium">{transfer.stock_state_transferred}</p>
              </div>
              <div>
                <span className="text-muted">Total Requested Units:</span>
                <p className="text-foreground-strong font-mono font-medium">{transfer.total_quantity_requested}</p>
              </div>
              <div>
                <span className="text-muted">Total Dispatched Units:</span>
                <p className="text-foreground-strong font-mono font-medium">{transfer.total_quantity_dispatched || 0}</p>
              </div>
              <div>
                <span className="text-muted">Total Received Units:</span>
                <p className="text-foreground-strong font-mono font-medium">{transfer.total_quantity_received || 0}</p>
              </div>
            </div>
            {transfer.notes && (
              <div className="pt-2 border-t border-border">
                <span className="text-xs text-muted">Special Notes:</span>
                <p className="text-xs text-foreground mt-0.5">{transfer.notes}</p>
              </div>
            )}
          </div>

          <div className="bg-surface border border-border rounded-lg p-4 space-y-3">
            <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider">Estimated Valuation</h3>
            <div className="p-3 bg-background rounded border border-border">
              <span className="text-xs text-muted">Total Acquisition Cost:</span>
              <p className="text-lg font-bold text-success font-mono mt-1">
                ₹{((transfer.total_value_paise || 0) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </p>
              <p className="text-[11px] text-muted mt-1">Acquisition cost basis preserved at destination location.</p>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'items' && (
        <div className="bg-surface border border-border rounded-lg overflow-hidden">
          <table className="w-full text-left text-xs text-foreground">
            <thead className="bg-surface-elevated/80 text-muted uppercase tracking-wider font-semibold border-b border-border">
              <tr>
                <th className="px-3.5 py-2.5">Medicine SKU</th>
                <th className="px-3.5 py-2.5 text-center">Requested Qty</th>
                <th className="px-3.5 py-2.5 text-center">Allocated Qty</th>
                <th className="px-3.5 py-2.5 text-center">Dispatched Qty</th>
                <th className="px-3.5 py-2.5 text-center">Received Qty</th>
                <th className="px-3.5 py-2.5 text-right">Unit Cost</th>
                <th className="px-3.5 py-2.5 text-right">Total Value</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {transfer.items?.map((item: any) => (
                <tr key={item.id}>
                  <td className="px-3.5 py-2.5">
                    <p className="font-semibold text-foreground-strong">{item.medicine_name}</p>
                    <span className="text-[10px] text-muted font-mono">{item.medicine_id}</span>
                  </td>
                  <td className="px-3.5 py-2.5 text-center font-mono">{item.requested_quantity} {item.requested_unit}</td>
                  <td className="px-3.5 py-2.5 text-center font-mono text-primary">{item.allocated_quantity || 0}</td>
                  <td className="px-3.5 py-2.5 text-center font-mono text-info">{item.dispatched_quantity || 0}</td>
                  <td className="px-3.5 py-2.5 text-center font-mono text-success">{item.received_quantity || 0}</td>
                  <td className="px-3.5 py-2.5 text-right font-mono">₹{((item.unit_cost_paise || 0) / 100).toFixed(2)}</td>
                  <td className="px-3.5 py-2.5 text-right font-mono text-foreground-strong">
                    ₹{((item.total_value_paise || 0) / 100).toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'picking' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between bg-surface border border-border p-3 rounded-lg">
            <div>
              <h3 className="text-xs font-semibold text-foreground-strong">Warehouse / Store Pick Queue</h3>
              <p className="text-[11px] text-muted">Scan or confirm allocated batch lots in sequential bin order</p>
            </div>
            <button
              onClick={onCompletePick}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-info hover:bg-info text-on-primary text-xs font-semibold rounded transition"
            >
              <Check className="w-3.5 h-3.5" /> Complete Picking
            </button>
          </div>

          <div className="bg-surface border border-border rounded-lg overflow-hidden">
            <table className="w-full text-left text-xs text-foreground">
              <thead className="bg-surface-elevated/80 text-muted uppercase tracking-wider font-semibold border-b border-border">
                <tr>
                  <th className="px-3.5 py-2.5">Bin Code</th>
                  <th className="px-3.5 py-2.5">Batch Lot</th>
                  <th className="px-3.5 py-2.5">Expiry Date</th>
                  <th className="px-3.5 py-2.5 text-center">Allocated</th>
                  <th className="px-3.5 py-2.5 text-center">Picked Qty</th>
                  <th className="px-3.5 py-2.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {transfer.allocations?.map((alloc: any) => (
                  <tr key={alloc.id}>
                    <td className="px-3.5 py-2.5 font-mono text-primary font-semibold">{alloc.source_bin_id || 'MAIN-STORAGE'}</td>
                    <td className="px-3.5 py-2.5 font-mono text-foreground-strong">{alloc.batch_number}</td>
                    <td className="px-3.5 py-2.5 text-muted">{alloc.expiry_date}</td>
                    <td className="px-3.5 py-2.5 text-center font-mono font-medium">{alloc.quantity_allocated}</td>
                    <td className="px-3.5 py-2.5 text-center">
                      <input
                        type="number"
                        min="1"
                        value={pickedQuantities[alloc.id] ?? alloc.quantity_allocated}
                        onChange={(e) =>
                          setPickedQuantities({ ...pickedQuantities, [alloc.id]: Number(e.target.value) })
                        }
                        className="w-16 px-1.5 py-1 bg-surface-elevated border border-border rounded text-center text-xs text-foreground-strong font-mono"
                      />
                    </td>
                    <td className="px-3.5 py-2.5 text-right">
                      <button
                        onClick={() => handlePickSubmit(alloc.id)}
                        disabled={isProcessing}
                        className="px-2.5 py-1 bg-surface-elevated hover:bg-surface-alt text-primary rounded border border-border text-xs font-medium transition"
                      >
                        Confirm Pick
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'dispatch' && (
        <div className="bg-surface border border-border rounded-lg p-4 space-y-4 max-w-xl">
          <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider">Dispatch Execution Note</h3>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-muted mb-1">Carrier / Logistics Name</label>
              <input
                type="text"
                value={carrierName}
                onChange={(e) => setCarrierName(e.target.value)}
                className="w-full bg-surface-elevated border border-border rounded px-2.5 py-1.5 text-xs text-foreground-strong focus:outline-none focus:border-primary/25"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted mb-1">Tracking Number / Vehicle Ref</label>
              <input
                type="text"
                value={trackingReference}
                onChange={(e) => setTrackingReference(e.target.value)}
                placeholder="e.g. TRK-HYD-9982"
                className="w-full bg-surface-elevated border border-border rounded px-2.5 py-1.5 text-xs text-foreground-strong focus:outline-none focus:border-primary/25 font-mono"
              />
            </div>

            <div className="p-3 bg-background rounded border border-border text-xs text-muted">
              <span className="font-semibold text-primary">Inventory Rule:</span> Dispatched stock will move to{' '}
              <span className="font-mono text-foreground-strong font-semibold">IN_TRANSIT</span>. Destination stock will remain
              unchanged until physical destination receiving.
            </div>

            <button
              onClick={handleDispatchSubmit}
              disabled={isProcessing}
              className="w-full flex items-center justify-center gap-2 py-2 bg-primary hover:bg-primary text-foreground-strong font-semibold text-xs rounded transition shadow-sm"
            >
              <Truck className="w-4 h-4" /> Authorize Dispatch & Release In Transit
            </button>
          </div>
        </div>
      )}

      {activeTab === 'receiving' && (
        <div className="space-y-4">
          <div className="bg-surface border border-border rounded-lg p-4 space-y-3">
            <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider">Destination Inward Verification</h3>
            <div className="flex items-center gap-3">
              <label className="text-xs text-muted font-medium">Physical Condition:</label>
              <select
                value={receiptCondition}
                onChange={(e) => setReceiptCondition(e.target.value as any)}
                className="bg-surface-elevated border border-border text-xs text-foreground-strong rounded px-2.5 py-1.5"
              >
                <option value="GOOD">Good / Intact</option>
                <option value="DAMAGED_PACKAGING">Damaged Packaging</option>
                <option value="TEMPERATURE_BREACH">Cold Chain Temperature Breach</option>
                <option value="TAMPERED">Tampered Seal</option>
              </select>
            </div>
          </div>

          <div className="bg-surface border border-border rounded-lg overflow-hidden">
            <table className="w-full text-left text-xs text-foreground">
              <thead className="bg-surface-elevated/80 text-muted uppercase tracking-wider font-semibold border-b border-border">
                <tr>
                  <th className="px-3.5 py-2.5">Batch Lot</th>
                  <th className="px-3.5 py-2.5 text-center">Dispatched</th>
                  <th className="px-3.5 py-2.5 text-center">Accepted (Sound)</th>
                  <th className="px-3.5 py-2.5 text-center">Damaged</th>
                  <th className="px-3.5 py-2.5 text-center">Short</th>
                  <th className="px-3.5 py-2.5 text-center">Excess</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {transfer.allocations?.map((alloc: any) => {
                  const input = receivedInputs[alloc.id] || { accepted: 0, damaged: 0, short: 0, excess: 0 };
                  return (
                    <tr key={alloc.id}>
                      <td className="px-3.5 py-2.5 font-mono text-foreground-strong">{alloc.batch_number}</td>
                      <td className="px-3.5 py-2.5 text-center font-mono font-semibold">
                        {alloc.quantity_dispatched || alloc.quantity_allocated}
                      </td>
                      <td className="px-3.5 py-2.5 text-center">
                        <input
                          type="number"
                          min="0"
                          value={input.accepted}
                          onChange={(e) =>
                            setReceivedInputs({
                              ...receivedInputs,
                              [alloc.id]: { ...input, accepted: Number(e.target.value) },
                            })
                          }
                          className="w-16 px-1.5 py-1 bg-surface-elevated border border-border rounded text-center text-xs text-success font-mono"
                        />
                      </td>
                      <td className="px-3.5 py-2.5 text-center">
                        <input
                          type="number"
                          min="0"
                          value={input.damaged}
                          onChange={(e) =>
                            setReceivedInputs({
                              ...receivedInputs,
                              [alloc.id]: { ...input, damaged: Number(e.target.value) },
                            })
                          }
                          className="w-16 px-1.5 py-1 bg-surface-elevated border border-border rounded text-center text-xs text-danger font-mono"
                        />
                      </td>
                      <td className="px-3.5 py-2.5 text-center">
                        <input
                          type="number"
                          min="0"
                          value={input.short}
                          onChange={(e) =>
                            setReceivedInputs({
                              ...receivedInputs,
                              [alloc.id]: { ...input, short: Number(e.target.value) },
                            })
                          }
                          className="w-16 px-1.5 py-1 bg-surface-elevated border border-border rounded text-center text-xs text-warning font-mono"
                        />
                      </td>
                      <td className="px-3.5 py-2.5 text-center">
                        <input
                          type="number"
                          min="0"
                          value={input.excess}
                          onChange={(e) =>
                            setReceivedInputs({
                              ...receivedInputs,
                              [alloc.id]: { ...input, excess: Number(e.target.value) },
                            })
                          }
                          className="w-16 px-1.5 py-1 bg-surface-elevated border border-border rounded text-center text-xs text-primary font-mono"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end">
            <button
              onClick={handleReceiveSubmit}
              disabled={isProcessing}
              className="flex items-center gap-1.5 px-4 py-2 bg-success hover:bg-success text-on-primary font-semibold text-xs rounded transition shadow-sm"
            >
              <CheckCircle className="w-4 h-4" /> Post Receipt & Increment Destination Inventory
            </button>
          </div>
        </div>
      )}

      {activeTab === 'timeline' && (
        <div className="bg-surface border border-border rounded-lg p-4 space-y-3">
          <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider">Immutable Lifecycle Events</h3>
          <div className="space-y-2">
            {transfer.events?.map((ev: any) => (
              <div key={ev.id} className="flex items-start gap-3 p-2.5 bg-background rounded border border-border text-xs">
                <div className="p-1 rounded bg-surface-elevated text-primary mt-0.5">
                  <Clock className="w-3.5 h-3.5" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-foreground-strong">{ev.event_type}</span>
                    <span className="text-muted font-mono">{new Date(ev.created_at).toLocaleString()}</span>
                  </div>
                  <p className="text-muted mt-0.5">{ev.notes}</p>
                  <span className="text-[10px] text-muted">Performed by: {ev.performed_by}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
