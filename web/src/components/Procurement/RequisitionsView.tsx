import React, { useState, useEffect } from 'react';
import api from '../../lib/api';

export const RequisitionsView: React.FC = () => {
  const [requisitions, setRequisitions] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [selectedReq, setSelectedReq] = useState<any | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false);
  const [isRejectModalOpen, setIsRejectModalOpen] = useState<boolean>(false);
  const [rejectionReason, setRejectionReason] = useState<string>('');

  // Form State for new Requisition
  const [source, setSource] = useState<string>('MANUAL');
  const [priority, setPriority] = useState<string>('MEDIUM');
  const [notes, setNotes] = useState<string>('');
  const [items, setItems] = useState<Array<{ medicineId: string; medicineName: string; requestedQuantity: number; justification: string }>>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchResults, setSearchResults] = useState<any[]>([]);

  const fetchRequisitions = async () => {
    setIsLoading(true);
    try {
      const res = await api.get('/procurement/requisitions');
      if (res.data?.data) {
        setRequisitions(res.data.data);
      }
    } catch (err) {
      console.error('Failed to load requisitions:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRequisitions();
  }, []);

  const searchMedicines = async (q: string) => {
    setSearchQuery(q);
    if (q.length < 2) {
      setSearchResults([]);
      return;
    }
    try {
      const res = await api.get('/inventory/medicines/search', { params: { q, include_substitutes: false } });
      if (res.data?.results) {
        setSearchResults(res.data.results.slice(0, 8));
      }
    } catch (err) {
      console.error('Search failed:', err);
    }
  };

  const handleAddItem = (med: any) => {
    setItems((prev) => [
      ...prev,
      {
        medicineId: med.id,
        medicineName: med.name,
        requestedQuantity: 10,
        justification: 'Stock replenishment demand',
      },
    ]);
    setSearchQuery('');
    setSearchResults([]);
  };

  const handleCreateRequisition = async () => {
    if (items.length === 0) {
      alert('Please add at least one item');
      return;
    }
    try {
      await api.post('/procurement/requisitions', {
        source,
        priority,
        notes,
        items: items.map((it) => ({
          medicineId: it.medicineId,
          requestedQuantity: Number(it.requestedQuantity),
          justification: it.justification,
        })),
      });
      setIsCreateModalOpen(false);
      setItems([]);
      fetchRequisitions();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to create requisition');
    }
  };

  const handleApprove = async (id: string) => {
    try {
      await api.post(`/procurement/requisitions/${id}/approve`);
      fetchRequisitions();
      if (selectedReq?.id === id) {
        const updated = await api.get(`/procurement/requisitions/${id}`);
        setSelectedReq(updated.data.data);
      }
    } catch (err: any) {
      alert(err.response?.data?.error || 'Approval failed');
    }
  };

  const handleReject = async () => {
    if (!selectedReq || !rejectionReason.trim()) {
      alert('Rejection reason is required');
      return;
    }
    try {
      await api.post(`/procurement/requisitions/${selectedReq.id}/reject`, {
        rejectionReason,
      });
      setIsRejectModalOpen(false);
      setRejectionReason('');
      fetchRequisitions();
      const updated = await api.get(`/procurement/requisitions/${selectedReq.id}`);
      setSelectedReq(updated.data.data);
    } catch (err: any) {
      alert(err.response?.data?.error || 'Rejection failed');
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
            Purchase Requisitions ({requisitions.length})
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="px-3 py-1.5 text-xs font-bold rounded bg-success hover:bg-success text-on-primary transition flex items-center gap-1"
          >
            + Create Requisition
          </button>
        </div>
      </div>

      {/* SPLIT VIEW: REQUISITION LIST + DETAILS DRAWER */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 flex-1 min-h-0">
        {/* REQUISITION LIST TABLE */}
        <div className="md:col-span-2 bg-surface-elevated/40 rounded-xl border border-border overflow-hidden flex flex-col">
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-surface-elevated/90 text-foreground border-b border-border uppercase font-semibold text-[11px] tracking-wider">
                  <th className="p-3">Req #</th>
                  <th className="p-3">Source</th>
                  <th className="p-3">Priority</th>
                  <th className="p-3">Items</th>
                  <th className="p-3">Date</th>
                  <th className="p-3">Status</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {requisitions.map((req) => (
                  <tr
                    key={req.id}
                    onClick={() => setSelectedReq(req)}
                    className={`hover:bg-surface-alt/50 cursor-pointer transition ${
                      selectedReq?.id === req.id ? 'bg-surface-alt/60 border-l-4 border-success/25' : ''
                    }`}
                  >
                    <td className="p-3 font-mono font-bold text-foreground-strong">{req.requisition_number}</td>
                    <td className="p-3">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-surface-alt text-foreground">
                        {req.source}
                      </span>
                    </td>
                    <td className="p-3">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                          req.priority === 'URGENT' || req.priority === 'HIGH'
                            ? 'bg-danger/8 text-danger border border-danger/25'
                            : 'bg-surface-alt text-foreground'
                        }`}
                      >
                        {req.priority}
                      </span>
                    </td>
                    <td className="p-3 font-semibold text-foreground">{req.items?.length || 0}</td>
                    <td className="p-3 text-muted font-mono">
                      {req.requested_at ? new Date(req.requested_at).toLocaleDateString('en-IN') : 'N/A'}
                    </td>
                    <td className="p-3">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${
                          req.status === 'APPROVED'
                            ? 'bg-success/8 text-success border border-success/25'
                            : req.status === 'REJECTED'
                            ? 'bg-danger/8 text-danger border border-danger/25'
                            : req.status === 'ORDERED'
                            ? 'bg-info/8 text-info border border-info/25'
                            : 'bg-warning/8 text-warning border border-warning/25'
                        }`}
                      >
                        {req.status}
                      </span>
                    </td>
                    <td className="p-3 text-right">
                      {req.status === 'DRAFT' || req.status === 'PENDING_APPROVAL' ? (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleApprove(req.id);
                          }}
                          className="px-2 py-1 text-[11px] font-bold rounded bg-success hover:bg-success text-on-primary mr-1"
                        >
                          Approve
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
                {requisitions.length === 0 && !isLoading && (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-muted">
                      No purchase requisitions recorded yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* DETAILS DRAWER */}
        <div className="bg-surface-elevated/50 rounded-xl border border-border p-4 flex flex-col gap-4 overflow-y-auto">
          {selectedReq ? (
            <>
              <div className="flex justify-between items-start border-b border-border pb-3">
                <div>
                  <div className="text-xs text-muted uppercase font-semibold">Requisition Detail</div>
                  <div className="text-base font-black text-foreground-strong font-mono">{selectedReq.requisition_number}</div>
                </div>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                    selectedReq.status === 'APPROVED' ? 'bg-success/8 text-success' : 'bg-warning/8 text-warning'
                  }`}
                >
                  {selectedReq.status}
                </span>
              </div>

              <div className="text-xs space-y-2 text-foreground">
                <div>
                  <span className="text-muted">Source:</span> <strong className="text-foreground-strong">{selectedReq.source}</strong>
                </div>
                <div>
                  <span className="text-muted">Requested By:</span> <strong className="text-foreground-strong">{selectedReq.requested_by}</strong>
                </div>
                {selectedReq.notes && (
                  <div className="p-2 bg-surface/60 rounded border border-border text-[11px] text-foreground">
                    {selectedReq.notes}
                  </div>
                )}
                {selectedReq.rejection_reason && (
                  <div className="p-2 bg-danger/8 rounded border border-danger/25 text-[11px] text-danger">
                    <strong>Rejection Reason:</strong> {selectedReq.rejection_reason}
                  </div>
                )}
              </div>

              {/* LINE ITEMS */}
              <div className="space-y-2">
                <div className="text-xs font-bold uppercase text-muted">Requisition Items ({selectedReq.items?.length || 0})</div>
                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {selectedReq.items?.map((it: any) => (
                    <div key={it.id} className="p-2.5 rounded bg-surface/70 border border-border text-xs">
                      <div className="flex justify-between font-bold text-foreground-strong">
                        <span>{it.medicine_name || it.medicine_id}</span>
                        <span className="text-success">{it.requested_quantity} {it.requested_unit || 'units'}</span>
                      </div>
                      <div className="flex justify-between text-[11px] text-muted mt-1">
                        <span>On-Hand: {it.current_stock || 0}</span>
                        <span>Est: {formatRupees(it.estimated_cost_paise || 0)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* ACTION BUTTONS */}
              <div className="pt-3 border-t border-border flex gap-2">
                {(selectedReq.status === 'DRAFT' || selectedReq.status === 'PENDING_APPROVAL') && (
                  <>
                    <button
                      onClick={() => handleApprove(selectedReq.id)}
                      className="flex-1 py-2 text-xs font-bold rounded bg-success hover:bg-success text-on-primary transition"
                    >
                      ✓ Approve Requisition
                    </button>
                    <button
                      onClick={() => setIsRejectModalOpen(true)}
                      className="flex-1 py-2 text-xs font-bold rounded bg-danger hover:bg-danger text-on-primary transition"
                    >
                      ✕ Reject
                    </button>
                  </>
                )}
              </div>
            </>
          ) : (
            <div className="h-full flex items-center justify-center text-muted text-xs text-center p-6">
              Select a requisition from the list to view demand justification and approval actions.
            </div>
          )}
        </div>
      </div>

      {/* CREATE REQUISITION MODAL */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <div className="bg-surface-elevated border border-border rounded-xl max-w-2xl w-full p-6 space-y-4 text-foreground-strong shadow-2xl">
            <div className="flex justify-between items-center border-b border-border pb-3">
              <h3 className="text-base font-bold uppercase tracking-wider text-foreground-strong">Create Purchase Requisition</h3>
              <button onClick={() => setIsCreateModalOpen(false)} className="text-muted hover:text-foreground-strong">✕</button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-muted uppercase mb-1">Source</label>
                <select
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                  className="w-full bg-surface border border-border rounded p-2 text-xs text-foreground-strong"
                >
                  <option value="MANUAL">Manual Request</option>
                  <option value="REORDER_ENGINE">Reorder Engine</option>
                  <option value="SHORTBOOK">Shortbook Demand</option>
                  <option value="PRESCRIPTION_DEMAND">Prescription Demand</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-muted uppercase mb-1">Priority</label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                  className="w-full bg-surface border border-border rounded p-2 text-xs text-foreground-strong"
                >
                  <option value="LOW">Low</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HIGH">High</option>
                  <option value="URGENT">Urgent</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-muted uppercase mb-1">Notes / Demand Justification</label>
              <input
                type="text"
                placeholder="Optional justification note..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full bg-surface border border-border rounded p-2 text-xs text-foreground-strong"
              />
            </div>

            {/* MEDICINE SEARCH INPUT */}
            <div>
              <label className="block text-xs font-semibold text-muted uppercase mb-1">Add Product</label>
              <input
                type="text"
                placeholder="Search medicine by name or composition..."
                value={searchQuery}
                onChange={(e) => searchMedicines(e.target.value)}
                className="w-full bg-surface border border-border rounded p-2 text-xs text-foreground-strong"
              />
              {searchResults.length > 0 && (
                <div className="bg-surface border border-border rounded mt-1 max-h-40 overflow-y-auto divide-y divide-border">
                  {searchResults.map((m) => (
                    <div
                      key={m.id}
                      onClick={() => handleAddItem(m)}
                      className="p-2 text-xs hover:bg-surface-elevated cursor-pointer flex justify-between items-center"
                    >
                      <span className="font-semibold text-foreground-strong">{m.name}</span>
                      <span className="text-[11px] text-muted">{m.brand_name || m.generic_name}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ADDED ITEMS LIST */}
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {items.map((it, idx) => (
                <div key={idx} className="flex items-center gap-3 p-2 bg-surface/80 rounded border border-border text-xs">
                  <span className="flex-1 font-bold text-foreground-strong">{it.medicineName}</span>
                  <div className="flex items-center gap-1">
                    <span className="text-muted">Qty:</span>
                    <input
                      type="number"
                      min="1"
                      value={it.requestedQuantity}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        setItems((prev) =>
                          prev.map((item, i) => (i === idx ? { ...item, requestedQuantity: val } : item))
                        );
                      }}
                      className="w-16 bg-surface-elevated border border-border rounded p-1 text-center font-bold text-foreground-strong text-xs"
                    />
                  </div>
                  <button
                    onClick={() => setItems((prev) => prev.filter((_, i) => i !== idx))}
                    className="text-danger hover:text-danger font-bold"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-border">
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold rounded bg-surface-alt hover:bg-surface-alt text-foreground-strong"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateRequisition}
                className="px-4 py-2 text-xs font-bold rounded bg-success hover:bg-success text-on-primary"
              >
                Create Requisition Draft
              </button>
            </div>
          </div>
        </div>
      )}

      {/* REJECTION REASON MODAL */}
      {isRejectModalOpen && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <div className="bg-surface-elevated border border-border rounded-xl max-w-md w-full p-6 space-y-4 text-foreground-strong shadow-2xl">
            <h3 className="text-base font-bold uppercase tracking-wider text-danger">Reject Purchase Requisition</h3>
            <p className="text-xs text-muted">
              Please enter a formal justification for rejecting requisition {selectedReq?.requisition_number}:
            </p>
            <textarea
              rows={3}
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="e.g. Sufficient stock available in Central Warehouse / Budget limit exceeded..."
              className="w-full bg-surface border border-border rounded p-2 text-xs text-foreground-strong"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setIsRejectModalOpen(false)}
                className="px-3 py-1.5 text-xs font-semibold rounded bg-surface-alt hover:bg-surface-alt text-foreground-strong"
              >
                Cancel
              </button>
              <button
                onClick={handleReject}
                className="px-3 py-1.5 text-xs font-bold rounded bg-danger hover:bg-danger text-on-primary"
              >
                Confirm Rejection
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
