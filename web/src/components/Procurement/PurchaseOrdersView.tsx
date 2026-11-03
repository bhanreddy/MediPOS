import React, { useState, useEffect } from 'react';
import api from '../../lib/api';

export const PurchaseOrdersView: React.FC = () => {
  const [purchaseOrders, setPurchaseOrders] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [selectedPo, setSelectedPo] = useState<any | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false);
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState<boolean>(false);
  const [confirmDeliveryDate, setConfirmDeliveryDate] = useState<string>('');
  const [confirmNotes, setConfirmNotes] = useState<string>('');

  // Form State for new PO
  const [supplierId, setSupplierId] = useState<string>('');
  const [paymentTerms, setPaymentTerms] = useState<string>('NET_30');
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [items, setItems] = useState<Array<{ medicineId: string; medicineName: string; orderedQuantity: number; purchaseRateRupees: number; gstRate: number }>>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchResults, setSearchResults] = useState<any[]>([]);

  const fetchPOs = async () => {
    setIsLoading(true);
    try {
      const res = await api.get('/procurement/purchase-orders');
      if (res.data?.data) {
        setPurchaseOrders(res.data.data);
      }
    } catch (err) {
      console.error('Failed to load purchase orders:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchSuppliers = async () => {
    try {
      const res = await api.get('/suppliers');
      if (res.data?.data) {
        setSuppliers(res.data.data);
      }
    } catch (err) {
      console.error('Failed to load suppliers:', err);
    }
  };

  useEffect(() => {
    fetchPOs();
    fetchSuppliers();
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
        orderedQuantity: 1,
        purchaseRateRupees: Number(med.purchase_price ?? med.medicine_batches?.[0]?.purchase_price ?? 0),
        gstRate: Number(med.gst_rate ?? 0),
      },
    ]);
    setSearchQuery('');
    setSearchResults([]);
  };

  const handleCreatePo = async () => {
    if (saving) return;
    if (!supplierId) {
      alert('Please select a supplier');
      return;
    }
    if (items.length === 0) {
      alert('Please add at least one item');
      return;
    }
    if (items.some(item => !Number.isInteger(item.orderedQuantity) || item.orderedQuantity <= 0 || !Number.isFinite(item.purchaseRateRupees) || item.purchaseRateRupees < 0)) {
      alert('Enter a positive whole quantity and a valid nonnegative purchase rate for each item.');
      return;
    }
    setSaving(true);
    try {
      await api.post('/procurement/purchase-orders', {
        supplierId,
        paymentTerms,
        expectedDeliveryDate,
        notes,
        items: items.map((it) => ({
          medicineId: it.medicineId,
          orderedQuantity: Number(it.orderedQuantity),
          purchaseRatePaise: Math.round(Number(it.purchaseRateRupees) * 100),
          gstRate: it.gstRate,
        })),
      });
      setIsCreateModalOpen(false);
      setItems([]);
      fetchPOs();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to create purchase order');
    } finally {
      setSaving(false);
    }
  };

  const handleApprove = async (id: string) => {
    try {
      await api.post(`/procurement/purchase-orders/${id}/approve`);
      fetchPOs();
      if (selectedPo?.id === id) {
        const updated = await api.get(`/procurement/purchase-orders/${id}`);
        setSelectedPo(updated.data.data);
      }
    } catch (err: any) {
      alert(err.response?.data?.error || 'Approval failed');
    }
  };

  const handleSupplierConfirm = async () => {
    if (!selectedPo) return;
    try {
      await api.post(`/procurement/purchase-orders/${selectedPo.id}/confirm`, {
        expectedDeliveryDate: confirmDeliveryDate,
        notes: confirmNotes,
      });
      setIsConfirmModalOpen(false);
      fetchPOs();
      const updated = await api.get(`/procurement/purchase-orders/${selectedPo.id}`);
      setSelectedPo(updated.data.data);
    } catch (err: any) {
      alert(err.response?.data?.error || 'Supplier confirmation failed');
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
            Purchase Orders ({purchaseOrders.length})
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="px-3 py-1.5 text-xs font-bold rounded bg-info hover:bg-info text-foreground-strong transition flex items-center gap-1"
          >
            + Create Purchase Order
          </button>
        </div>
      </div>

      {/* SPLIT VIEW: PO LIST + DETAILS DRAWER */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 flex-1 min-h-0">
        {/* PO LIST TABLE */}
        <div className="md:col-span-2 bg-surface-elevated/40 rounded-xl border border-border overflow-hidden flex flex-col">
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-surface-elevated/90 text-foreground border-b border-border uppercase font-semibold text-[11px] tracking-wider">
                  <th className="p-3">PO #</th>
                  <th className="p-3">Supplier</th>
                  <th className="p-3">Order Date</th>
                  <th className="p-3">Items</th>
                  <th className="p-3">Total Value</th>
                  <th className="p-3">Status</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {purchaseOrders.map((po) => (
                  <tr
                    key={po.id}
                    onClick={() => setSelectedPo(po)}
                    className={`hover:bg-surface-alt/50 cursor-pointer transition ${
                      selectedPo?.id === po.id ? 'bg-surface-alt/60 border-l-4 border-info/25' : ''
                    }`}
                  >
                    <td className="p-3 font-mono font-bold text-foreground-strong">
                      {po.po_number} {po.version > 1 ? <span className="text-warning text-[10px]">(v{po.version})</span> : null}
                    </td>
                    <td className="p-3 font-semibold text-foreground-strong">{po.supplier_name || 'N/A'}</td>
                    <td className="p-3 text-muted font-mono">{po.order_date || 'N/A'}</td>
                    <td className="p-3 text-foreground">{po.items?.length || 0} items</td>
                    <td className="p-3 font-mono font-bold text-success">{formatRupees(po.total_paise)}</td>
                    <td className="p-3">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${
                          po.status === 'APPROVED'
                            ? 'bg-success/8 text-success border border-success/25'
                            : po.status === 'CONFIRMED'
                            ? 'bg-info/8 text-info border border-info/25'
                            : po.status === 'RECEIVED'
                            ? 'bg-violet/8 text-violet border border-violet/25'
                            : po.status === 'PARTIALLY_RECEIVED'
                            ? 'bg-info/8 text-info border border-info/25'
                            : 'bg-warning/8 text-warning border border-warning/25'
                        }`}
                      >
                        {po.status}
                      </span>
                    </td>
                    <td className="p-3 text-right">
                      {po.status === 'DRAFT' || po.status === 'PENDING_APPROVAL' ? (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleApprove(po.id);
                          }}
                          className="px-2 py-1 text-[11px] font-bold rounded bg-success hover:bg-success text-on-primary mr-1"
                        >
                          Approve
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
                {purchaseOrders.length === 0 && !isLoading && (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-muted">
                      No purchase orders generated yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* DETAILS DRAWER */}
        <div className="bg-surface-elevated/50 rounded-xl border border-border p-4 flex flex-col gap-4 overflow-y-auto">
          {selectedPo ? (
            <>
              <div className="flex justify-between items-start border-b border-border pb-3">
                <div>
                  <div className="text-xs text-muted uppercase font-semibold">Purchase Order Details</div>
                  <div className="text-base font-black text-foreground-strong font-mono">{selectedPo.po_number}</div>
                </div>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                    selectedPo.status === 'APPROVED' ? 'bg-success/8 text-success' : 'bg-info/8 text-info'
                  }`}
                >
                  {selectedPo.status}
                </span>
              </div>

              <div className="text-xs space-y-2 text-foreground">
                <div>
                  <span className="text-muted">Supplier:</span> <strong className="text-foreground-strong">{selectedPo.supplier_name}</strong>
                </div>
                <div>
                  <span className="text-muted">Payment Terms:</span> <strong className="text-foreground-strong">{selectedPo.payment_terms}</strong>
                </div>
                <div>
                  <span className="text-muted">Expected Delivery:</span> <strong className="text-foreground-strong">{selectedPo.expected_delivery_date || 'Not specified'}</strong>
                </div>
                <div>
                  <span className="text-muted">Total PO Value:</span> <strong className="text-success text-sm">{formatRupees(selectedPo.total_paise)}</strong>
                </div>
              </div>

              {/* LINE ITEMS */}
              <div className="space-y-2">
                <div className="text-xs font-bold uppercase text-muted">PO Items ({selectedPo.items?.length || 0})</div>
                <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                  {selectedPo.items?.map((it: any) => (
                    <div key={it.id} className="p-2.5 rounded bg-surface/70 border border-border text-xs">
                      <div className="flex justify-between font-bold text-foreground-strong">
                        <span>{it.medicine_name || it.medicine_id}</span>
                        <span className="text-info font-mono">{it.ordered_quantity} {it.purchase_unit || 'units'}</span>
                      </div>
                      <div className="flex justify-between text-[11px] text-muted mt-1">
                        <span>Rate: {formatRupees(it.purchase_rate_paise)}</span>
                        <span>Received: {it.received_quantity || 0}</span>
                      </div>
                      {it.scheme_summary && (
                        <div className="text-[10px] text-success mt-1 font-semibold">
                          🎁 {it.scheme_summary}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* VERSION HISTORY */}
              {selectedPo.versions && selectedPo.versions.length > 1 && (
                <div className="space-y-1 pt-2 border-t border-border">
                  <div className="text-[11px] font-bold uppercase text-muted">Version History</div>
                  <div className="space-y-1 text-[11px] text-muted">
                    {selectedPo.versions.map((v: any) => (
                      <div key={v.id} className="flex justify-between p-1.5 bg-surface/40 rounded">
                        <span>v{v.version_number}: {v.change_reason}</span>
                        <span className="font-mono text-muted">{v.changed_by}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ACTIONS */}
              <div className="pt-3 border-t border-border flex gap-2">
                {(selectedPo.status === 'DRAFT' || selectedPo.status === 'PENDING_APPROVAL') && (
                  <button
                    onClick={() => handleApprove(selectedPo.id)}
                    className="flex-1 py-2 text-xs font-bold rounded bg-success hover:bg-success text-on-primary transition"
                  >
                    ✓ Approve PO
                  </button>
                )}
                {selectedPo.status === 'APPROVED' && (
                  <button
                    onClick={() => setIsConfirmModalOpen(true)}
                    className="flex-1 py-2 text-xs font-bold rounded bg-info hover:bg-info text-foreground-strong transition"
                  >
                    📝 Record Supplier Confirmation
                  </button>
                )}
              </div>
            </>
          ) : (
            <div className="h-full flex items-center justify-center text-muted text-xs text-center p-6">
              Select a purchase order to inspect line items, version history, and supplier confirmation details.
            </div>
          )}
        </div>
      </div>

      {/* CREATE PURCHASE ORDER MODAL */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <div className="bg-surface-elevated border border-border rounded-xl max-w-2xl w-full p-6 space-y-4 text-foreground-strong shadow-2xl">
            <div className="flex justify-between items-center border-b border-border pb-3">
              <h3 className="text-base font-bold uppercase tracking-wider text-foreground-strong">Generate Purchase Order</h3>
              <button onClick={() => setIsCreateModalOpen(false)} className="text-muted hover:text-foreground-strong">✕</button>
            </div>

            <div className="grid grid-cols-3 gap-4">
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
                <label className="block text-xs font-semibold text-muted uppercase mb-1">Payment Terms</label>
                <select
                  value={paymentTerms}
                  onChange={(e) => setPaymentTerms(e.target.value)}
                  className="w-full bg-surface border border-border rounded p-2 text-xs text-foreground-strong"
                >
                  <option value="NET_15">Net 15 Days</option>
                  <option value="NET_30">Net 30 Days</option>
                  <option value="NET_45">Net 45 Days</option>
                  <option value="NET_60">Net 60 Days</option>
                  <option value="IMMEDIATE">Immediate</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-muted uppercase mb-1">Expected Delivery</label>
                <input
                  type="date"
                  value={expectedDeliveryDate}
                  onChange={(e) => setExpectedDeliveryDate(e.target.value)}
                  className="w-full bg-surface border border-border rounded p-2 text-xs text-foreground-strong"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-muted uppercase mb-1">Order Notes / Instructions</label>
              <input
                type="text"
                placeholder="Optional supplier instructions..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full bg-surface border border-border rounded p-2 text-xs text-foreground-strong"
              />
            </div>

            {/* MEDICINE SEARCH */}
            <div>
              <label className="block text-xs font-semibold text-muted uppercase mb-1">Add Product to Order</label>
              <input
                type="text"
                placeholder="Search product..."
                value={searchQuery}
                onChange={(e) => searchMedicines(e.target.value)}
                className="w-full bg-surface border border-border rounded p-2 text-xs text-foreground-strong"
              />
              {searchResults.length > 0 && (
                <div className="bg-surface border border-border rounded mt-1 max-h-36 overflow-y-auto divide-y divide-border">
                  {searchResults.map((m) => (
                    <div
                      key={m.id}
                      onClick={() => handleAddItem(m)}
                      className="p-2 text-xs hover:bg-surface-elevated cursor-pointer flex justify-between items-center"
                    >
                      <span className="font-semibold text-foreground-strong">{m.name}</span>
                      <span className="text-[11px] text-muted">Last cost: ₹{m.purchase_price ?? m.medicine_batches?.[0]?.purchase_price ?? 0}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ADDED ITEMS LIST */}
            <div className="space-y-2 max-h-44 overflow-y-auto">
              {items.map((it, idx) => (
                <div key={idx} className="flex items-center gap-3 p-2 bg-surface/80 rounded border border-border text-xs">
                  <span className="flex-1 font-bold text-foreground-strong">{it.medicineName}</span>
                  <div className="flex items-center gap-1">
                    <span className="text-muted">Qty:</span>
                    <input
                      type="number"
                      min="1"
                      aria-label={`Order quantity for ${it.medicineName}`}
                      value={it.orderedQuantity}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        setItems((prev) =>
                          prev.map((item, i) => (i === idx ? { ...item, orderedQuantity: val } : item))
                        );
                      }}
                      className="w-16 bg-surface-elevated border border-border rounded p-1 text-center font-bold text-foreground-strong text-xs"
                    />
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-muted">₹ Rate:</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      aria-label={`Purchase rate for ${it.medicineName}`}
                      value={it.purchaseRateRupees}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        setItems((prev) =>
                          prev.map((item, i) => (i === idx ? { ...item, purchaseRateRupees: val } : item))
                        );
                      }}
                      className="w-20 bg-surface-elevated border border-border rounded p-1 text-center font-bold text-foreground-strong text-xs"
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
                onClick={handleCreatePo}
                disabled={saving}
                className="px-4 py-2 text-xs font-bold rounded bg-info hover:bg-info text-foreground-strong"
              >
                {saving ? 'Saving…' : 'Generate Purchase Order'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SUPPLIER CONFIRMATION MODAL */}
      {isConfirmModalOpen && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <div className="bg-surface-elevated border border-border rounded-xl max-w-md w-full p-6 space-y-4 text-foreground-strong shadow-2xl">
            <h3 className="text-base font-bold uppercase tracking-wider text-info">Supplier Order Confirmation</h3>
            <div>
              <label className="block text-xs font-semibold text-muted uppercase mb-1">Confirmed Delivery Date</label>
              <input
                type="date"
                value={confirmDeliveryDate}
                onChange={(e) => setConfirmDeliveryDate(e.target.value)}
                className="w-full bg-surface border border-border rounded p-2 text-xs text-foreground-strong"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted uppercase mb-1">Confirmation Notes / Tracking</label>
              <textarea
                rows={3}
                value={confirmNotes}
                onChange={(e) => setConfirmNotes(e.target.value)}
                placeholder="e.g. Confirmed by representative via email. Tracking LR #..."
                className="w-full bg-surface border border-border rounded p-2 text-xs text-foreground-strong"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setIsConfirmModalOpen(false)}
                className="px-3 py-1.5 text-xs font-semibold rounded bg-surface-alt hover:bg-surface-alt text-foreground-strong"
              >
                Cancel
              </button>
              <button
                onClick={handleSupplierConfirm}
                className="px-3 py-1.5 text-xs font-bold rounded bg-info hover:bg-info text-foreground-strong"
              >
                Save Confirmation
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
