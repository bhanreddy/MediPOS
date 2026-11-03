import React, { useState } from 'react';
import { X, Plus, Trash2, Check } from 'lucide-react';

export interface TransferRequestDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: any) => Promise<void>;
  locations: any[];
  medicines: any[];
}

export const TransferRequestDrawer: React.FC<TransferRequestDrawerProps> = ({
  isOpen,
  onClose,
  onSubmit,
  locations,
  medicines,
}) => {
  const [transferType, setTransferType] = useState('WAREHOUSE_TO_STORE');
  const [sourceLocationType, setSourceLocationType] = useState('WAREHOUSE');
  const [sourceLocationId, setSourceLocationId] = useState('');
  const [destinationLocationType, setDestinationLocationType] = useState('STORE');
  const [destinationLocationId, setDestinationLocationId] = useState('');
  const [priority, setPriority] = useState('NORMAL');
  const [reason] = useState('MANUAL');
  const [stockStateTransferred, setStockStateTransferred] = useState('AVAILABLE');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [items, setItems] = useState<
    Array<{
      medicineId: string;
      requestedUnit: string;
      conversionFactor: number;
      requestedQuantity: number;
    }>
  >([{ medicineId: '', requestedUnit: 'strip', conversionFactor: 1, requestedQuantity: 10 }]);

  if (!isOpen) return null;

  const handleAddItem = () => {
    setItems((prev) => [
      ...prev,
      { medicineId: '', requestedUnit: 'strip', conversionFactor: 1, requestedQuantity: 10 },
    ]);
  };

  const handleRemoveItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleItemChange = (index: number, field: string, value: any) => {
    setItems((prev) => {
      const next = [...prev];
      (next[index] as any)[field] = value;
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sourceLocationId || !destinationLocationId) {
      alert('Please select both source and destination locations');
      return;
    }
    if (sourceLocationId === destinationLocationId) {
      alert('Source and destination locations cannot be identical');
      return;
    }

    const validItems = items.filter((i) => i.medicineId && i.requestedQuantity > 0);
    if (validItems.length === 0) {
      alert('Please add at least one valid item to the transfer request');
      return;
    }

    try {
      setIsSubmitting(true);
      await onSubmit({
        transferType,
        sourceLocationType,
        sourceLocationId,
        destinationLocationType,
        destinationLocationId,
        priority,
        reason,
        stockStateTransferred,
        notes,
        items: validItems,
      });
      onClose();
    } catch (err: any) {
      alert(`Failed to create transfer: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const sourceLocations = locations.filter((l) => l.type === sourceLocationType);
  const destLocations = locations.filter((l) => l.type === destinationLocationType);

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black/60  flex justify-end">
      <div className="w-full max-w-2xl bg-surface border-l border-border h-full flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border bg-background">
          <div>
            <h2 className="text-base font-semibold text-foreground-strong">Create Stock Transfer Request</h2>
            <p className="text-xs text-muted">Initiate an internal stock movement between stores or warehouses</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted hover:text-foreground-strong hover:bg-surface-elevated transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Transfer Type & Priority */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-muted mb-1">Transfer Type</label>
              <select
                value={transferType}
                onChange={(e) => {
                  const t = e.target.value;
                  setTransferType(t);
                  if (t === 'STORE_TO_STORE') {
                    setSourceLocationType('STORE');
                    setDestinationLocationType('STORE');
                  } else if (t === 'WAREHOUSE_TO_STORE') {
                    setSourceLocationType('WAREHOUSE');
                    setDestinationLocationType('STORE');
                  } else if (t === 'STORE_TO_WAREHOUSE' || t === 'RECALL_TRANSFER') {
                    setSourceLocationType('STORE');
                    setDestinationLocationType('WAREHOUSE');
                  } else if (t === 'WAREHOUSE_TO_WAREHOUSE') {
                    setSourceLocationType('WAREHOUSE');
                    setDestinationLocationType('WAREHOUSE');
                  }
                }}
                className="w-full bg-surface-elevated border border-border rounded px-2.5 py-1.5 text-xs text-foreground-strong focus:outline-none focus:border-primary/25"
              >
                <option value="WAREHOUSE_TO_STORE">Warehouse to Store (Replenishment)</option>
                <option value="STORE_TO_STORE">Store to Store (Rebalance)</option>
                <option value="STORE_TO_WAREHOUSE">Store to Warehouse (Excess/Return)</option>
                <option value="RECALL_TRANSFER">Recall Consolidation Transfer</option>
                <option value="EMERGENCY_TRANSFER">Emergency Patient Demand</option>
                <option value="WAREHOUSE_TO_WAREHOUSE">Warehouse to Warehouse</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-muted mb-1">Priority</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="w-full bg-surface-elevated border border-border rounded px-2.5 py-1.5 text-xs text-foreground-strong focus:outline-none focus:border-primary/25"
              >
                <option value="LOW">Low (Standard)</option>
                <option value="NORMAL">Normal</option>
                <option value="HIGH">High</option>
                <option value="URGENT">Urgent (Stockout Risk)</option>
                <option value="CRITICAL">Critical (Patient Waiting / Recall)</option>
              </select>
            </div>
          </div>

          {/* Location Routing */}
          <div className="grid grid-cols-2 gap-3 bg-background p-3 rounded-lg border border-border">
            <div>
              <label className="block text-xs font-medium text-primary mb-1">Source Location ({sourceLocationType})</label>
              <select
                value={sourceLocationId}
                onChange={(e) => setSourceLocationId(e.target.value)}
                required
                className="w-full bg-surface-elevated border border-border rounded px-2.5 py-1.5 text-xs text-foreground-strong focus:outline-none focus:border-primary/25"
              >
                <option value="">Select Source Location</option>
                {sourceLocations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name} ({l.code})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-success mb-1">Destination Location ({destinationLocationType})</label>
              <select
                value={destinationLocationId}
                onChange={(e) => setDestinationLocationId(e.target.value)}
                required
                className="w-full bg-surface-elevated border border-border rounded px-2.5 py-1.5 text-xs text-foreground-strong focus:outline-none focus:border-success/25"
              >
                <option value="">Select Destination Location</option>
                {destLocations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name} ({l.code})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Stock State */}
          <div className="flex items-center gap-4 bg-background p-2.5 rounded border border-border">
            <span className="text-xs text-muted font-medium">Stock State:</span>
            {['AVAILABLE', 'QUARANTINED', 'RECALLED', 'DAMAGED'].map((state) => (
              <label key={state} className="flex items-center gap-1.5 text-xs text-foreground cursor-pointer">
                <input
                  type="radio"
                  name="stockState"
                  value={state}
                  checked={stockStateTransferred === state}
                  onChange={(e) => setStockStateTransferred(e.target.value)}
                  className="text-primary focus:ring-0"
                />
                {state}
              </label>
            ))}
          </div>

          {/* Items Section */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-foreground uppercase tracking-wider">
                Transfer Line Items ({items.length})
              </label>
              <button
                type="button"
                onClick={handleAddItem}
                className="flex items-center gap-1 text-xs text-primary hover:text-primary transition font-medium"
              >
                <Plus className="w-3.5 h-3.5" /> Add Line
              </button>
            </div>

            <div className="space-y-2">
              {items.map((item, idx) => (
                <div key={idx} className="flex items-center gap-2 bg-surface-elevated/80 p-2 rounded border border-border">
                  <div className="flex-1">
                    <select
                      value={item.medicineId}
                      onChange={(e) => handleItemChange(idx, 'medicineId', e.target.value)}
                      required
                      className="w-full bg-surface border border-border rounded px-2 py-1 text-xs text-foreground-strong focus:outline-none focus:border-primary/25"
                    >
                      <option value="">Select Medicine SKU</option>
                      {medicines.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name} ({m.generic_name || 'Generic'})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="w-24">
                    <input
                      type="number"
                      min="1"
                      placeholder="Qty"
                      value={item.requestedQuantity}
                      onChange={(e) => handleItemChange(idx, 'requestedQuantity', Number(e.target.value))}
                      required
                      className="w-full bg-surface border border-border rounded px-2 py-1 text-xs text-foreground-strong focus:outline-none focus:border-primary/25 text-center font-mono"
                    />
                  </div>

                  <div className="w-20">
                    <select
                      value={item.requestedUnit}
                      onChange={(e) => handleItemChange(idx, 'requestedUnit', e.target.value)}
                      className="w-full bg-surface border border-border rounded px-1.5 py-1 text-xs text-foreground focus:outline-none"
                    >
                      <option value="strip">Strip</option>
                      <option value="box">Box</option>
                      <option value="pack">Pack</option>
                      <option value="bottle">Bottle</option>
                      <option value="unit">Unit</option>
                    </select>
                  </div>

                  {items.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveItem(idx)}
                      className="p-1 text-muted hover:text-danger transition"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-medium text-muted mb-1">Transfer Notes / Special Instructions</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Urgent prescription replenishment for Counter 2"
              rows={2}
              className="w-full bg-surface-elevated border border-border rounded px-2.5 py-1.5 text-xs text-foreground-strong focus:outline-none focus:border-primary/25"
            />
          </div>

          {/* Submit Action */}
          <div className="pt-3 border-t border-border flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 bg-surface-elevated hover:bg-surface-alt text-foreground rounded text-xs transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-primary hover:bg-primary text-foreground-strong font-medium text-xs rounded transition shadow-sm disabled:opacity-50"
            >
              <Check className="w-3.5 h-3.5" />
              {isSubmitting ? 'Creating Transfer...' : 'Submit Transfer Request'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
