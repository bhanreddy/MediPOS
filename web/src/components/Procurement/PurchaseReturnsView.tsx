import React, { useState, useEffect } from 'react';
import api from '../../lib/api';

export const PurchaseReturnsView: React.FC = () => {
  const [returns, setReturns] = useState<any[]>([]);
  const [debitNotes, setDebitNotes] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [batches, setBatches] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [selectedReturn, setSelectedReturn] = useState<any | null>(null);
  const [isReturnModalOpen, setIsReturnModalOpen] = useState<boolean>(false);

  // Return Form State
  const [supplierId, setSupplierId] = useState<string>('');
  const [reason, setReason] = useState<string>('DAMAGED_RECEIPT');
  const [selectedBatchId, setSelectedBatchId] = useState<string>('');
  const [returnQuantity, setReturnQuantity] = useState<number>(1);
  const [notes, setNotes] = useState<string>('');

  const fetchReturnsAndDebitNotes = async () => {
    setIsLoading(true);
    try {
      const [retRes, dnRes, suppRes, batchRes] = await Promise.all([
        api.get('/procurement/returns'),
        api.get('/procurement/debit-notes'),
        api.get('/suppliers'),
        api.get('/inventory/batches', { params: { limit: 1000, include_unavailable: true } }),
      ]);
      if (retRes.data?.data) setReturns(retRes.data.data);
      if (dnRes.data?.data) setDebitNotes(dnRes.data.data);
      if (suppRes.data?.data) setSuppliers(suppRes.data.data);
      if (batchRes.data?.data) setBatches(batchRes.data.data);
    } catch (err) {
      console.error('Failed to load purchase returns:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchReturnsAndDebitNotes();
  }, []);

  const handleCreateReturn = async () => {
    if (!supplierId || !selectedBatchId || returnQuantity <= 0) {
      alert('Supplier, Batch, and positive Quantity are required');
      return;
    }

    try {
      const batch = batches.find((b) => b.id === selectedBatchId || b._local_id === selectedBatchId);
      await api.post('/procurement/returns', {
        supplierId,
        reason,
        notes,
        lines: [
          {
            medicineId: batch?.medicine_id,
            batchId: selectedBatchId,
            quantity: returnQuantity,
            ratePaise: Math.round(Number(batch?.purchase_price || 0) * 100),
          },
        ],
      });
      setIsReturnModalOpen(false);
      fetchReturnsAndDebitNotes();
      alert('Purchase Return successfully executed and Debit Note issued!');
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to execute purchase return');
    }
  };

  const formatRupees = (paise: number) => {
    return `₹${((paise || 0) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  return (
    <div className="flex flex-col h-full gap-4">
      {/* TOOLBAR */}
      <div className="flex justify-between items-center bg-surface-elevated/60 p-3 rounded-lg border border-border">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-bold uppercase tracking-wider text-foreground-strong">
            Purchase Returns ({returns.length}) | Debit Notes Issued ({debitNotes.length})
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsReturnModalOpen(true)}
            className="px-3 py-1.5 text-xs font-bold rounded bg-danger hover:bg-danger text-on-primary transition flex items-center gap-1"
          >
            ↩️ Create Purchase Return
          </button>
        </div>
      </div>

      {/* SPLIT VIEW: RETURNS LIST + DETAILS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 flex-1 min-h-0">
        {/* RETURNS TABLE */}
        <div className="md:col-span-2 bg-surface-elevated/40 rounded-xl border border-border overflow-hidden flex flex-col">
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-surface-elevated/90 text-foreground border-b border-border uppercase font-semibold text-[11px] tracking-wider">
                  <th className="p-3">Return #</th>
                  <th className="p-3">Supplier</th>
                  <th className="p-3">Reason</th>
                  <th className="p-3">Debit Note #</th>
                  <th className="p-3">Total Value</th>
                  <th className="p-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {returns.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => setSelectedReturn(r)}
                    className={`hover:bg-surface-alt/50 cursor-pointer transition ${
                      selectedReturn?.id === r.id ? 'bg-surface-alt/60 border-l-4 border-danger/25' : ''
                    }`}
                  >
                    <td className="p-3 font-mono font-bold text-foreground-strong">{r.return_number}</td>
                    <td className="p-3 font-semibold text-foreground-strong">{r.supplier_name || 'N/A'}</td>
                    <td className="p-3">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-surface-alt text-foreground">
                        {r.reason}
                      </span>
                    </td>
                    <td className="p-3 font-mono text-violet font-bold">{r.debit_note_number || 'N/A'}</td>
                    <td className="p-3 font-mono font-bold text-danger">
                      ₹{Number(r.total_value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="p-3">
                      <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-success/8 text-success border border-success/25">
                        {r.status}
                      </span>
                    </td>
                  </tr>
                ))}
                {returns.length === 0 && !isLoading && (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-muted">
                      No purchase returns or debit notes recorded.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* DETAILS DRAWER */}
        <div className="bg-surface-elevated/50 rounded-xl border border-border p-4 flex flex-col gap-4 overflow-y-auto">
          {selectedReturn ? (
            <>
              <div className="flex justify-between items-start border-b border-border pb-3">
                <div>
                  <div className="text-xs text-muted uppercase font-semibold">Return & Debit Note</div>
                  <div className="text-base font-black text-foreground-strong font-mono">{selectedReturn.return_number}</div>
                </div>
                <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-violet/8 text-violet">
                  {selectedReturn.debit_note_number || 'DEBIT NOTE'}
                </span>
              </div>

              <div className="text-xs space-y-2 text-foreground">
                <div>
                  <span className="text-muted">Supplier:</span> <strong className="text-foreground-strong">{selectedReturn.supplier_name}</strong>
                </div>
                <div>
                  <span className="text-muted">Reason:</span> <strong className="text-foreground-strong">{selectedReturn.reason}</strong>
                </div>
                <div>
                  <span className="text-muted">Total Credit Value:</span> <strong className="text-danger text-sm">{formatRupees(selectedReturn.total_value_paise || Math.round(Number(selectedReturn.total_value || 0) * 100))}</strong>
                </div>
              </div>

              {/* RETURNED BATCH ITEMS */}
              <div className="space-y-2">
                <div className="text-xs font-bold uppercase text-muted">Returned Batches ({selectedReturn.lines?.length || 0})</div>
                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {selectedReturn.lines?.map((ln: any) => (
                    <div key={ln.id} className="p-2.5 rounded bg-surface/70 border border-border text-xs">
                      <div className="flex justify-between font-bold text-foreground-strong">
                        <span>{ln.medicine_name || ln.medicine_id}</span>
                        <span className="text-danger font-mono">Qty: {ln.quantity}</span>
                      </div>
                      <div className="flex justify-between text-[11px] text-muted mt-1">
                        <span>Batch: <strong className="text-foreground-strong">{ln.batch_number}</strong></span>
                        <span>Rate: {formatRupees(ln.rate_paise || Math.round(Number(ln.rate || 0) * 100))}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="h-full flex items-center justify-center text-muted text-xs text-center p-6">
              Select a purchase return to view batch level stock adjustments and linked statutory debit notes.
            </div>
          )}
        </div>
      </div>

      {/* CREATE RETURN MODAL */}
      {isReturnModalOpen && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <div className="bg-surface-elevated border border-border rounded-xl max-w-md w-full p-6 space-y-4 text-foreground-strong shadow-2xl">
            <h3 className="text-base font-bold uppercase tracking-wider text-danger">Create Purchase Return</h3>

            <div>
              <label className="block text-xs font-semibold text-muted uppercase mb-1">Supplier</label>
              <select
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
                className="w-full bg-surface border border-border rounded p-2 text-xs text-foreground-strong"
              >
                <option value="">Select Supplier...</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-muted uppercase mb-1">Return Reason</label>
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full bg-surface border border-border rounded p-2 text-xs text-foreground-strong"
              >
                <option value="DAMAGED_RECEIPT">Damaged on Receipt</option>
                <option value="NEAR_EXPIRY">Near Expiry / Short Shelf Life</option>
                <option value="WRONG_ITEM">Wrong Item Supplied</option>
                <option value="RECALL">Statutory Manufacturer Recall</option>
                <option value="EXCESS">Excess Quantity Receipt</option>
                <option value="QUALITY_ISSUE">Quality Discrepancy</option>
                <option value="SUPPLIER_AGREEMENT">Commercial Supplier Agreement</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-muted uppercase mb-1">Select Batch in Stock</label>
              <select
                value={selectedBatchId}
                onChange={(e) => setSelectedBatchId(e.target.value)}
                className="w-full bg-surface border border-border rounded p-2 text-xs text-foreground-strong"
              >
                <option value="">Select Stock Batch...</option>
                {batches.map((b) => (
                  <option key={b.id || b._local_id} value={b.id || b._local_id}>
                    {b.name || b.medicine_name} — Batch: {b.batch_number} (Avail: {b.quantity_remaining || b.quantity})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-muted uppercase mb-1">Quantity to Return</label>
              <input
                type="number"
                min="1"
                value={returnQuantity}
                onChange={(e) => setReturnQuantity(Number(e.target.value))}
                className="w-full bg-surface border border-border rounded p-2 text-xs text-foreground-strong font-bold"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-muted uppercase mb-1">Return Notes / Reason Details</label>
              <input
                type="text"
                placeholder="Optional supplier dispute notes..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full bg-surface border border-border rounded p-2 text-xs text-foreground-strong"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <button
                onClick={() => setIsReturnModalOpen(false)}
                className="px-3 py-1.5 text-xs font-semibold rounded bg-surface-alt hover:bg-surface-alt text-foreground-strong"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateReturn}
                className="px-3 py-1.5 text-xs font-bold rounded bg-danger hover:bg-danger text-on-primary"
              >
                Confirm Return & Debit Note
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
