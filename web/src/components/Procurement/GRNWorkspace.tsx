import React, { useState, useEffect } from 'react';
import api from '../../lib/api';

export const GRNWorkspace: React.FC = () => {
  const [grns, setGrns] = useState<any[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [selectedGrn, setSelectedGrn] = useState<any | null>(null);
  const [isReceivingModalOpen, setIsReceivingModalOpen] = useState<boolean>(false);

  // Receiving Form State
  const [supplierId, setSupplierId] = useState<string>('');
  const [poId, setPoId] = useState<string>('');
  const [deliveryNote, setDeliveryNote] = useState<string>('');
  const [grnItems, setGrnItems] = useState<Array<{
    poItemId?: string;
    medicineId: string;
    medicineName: string;
    batchNumber: string;
    expiryDate: string;
    orderedQuantity: number;
    receivedPaidQuantity: number;
    freeQuantity: number;
    damagedQuantity: number;
    rejectedQuantity: number;
    purchaseRateRupees: number;
    mrpRupees: number;
  }>>([]);

  const fetchGRNs = async () => {
    setIsLoading(true);
    try {
      const res = await api.get('/procurement/grn');
      if (res.data?.data) {
        setGrns(res.data.data);
      }
    } catch (err) {
      console.error('Failed to load GRNs:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchPOsAndSuppliers = async () => {
    try {
      const [poRes, suppRes] = await Promise.all([
        api.get('/procurement/purchase-orders?status=APPROVED'),
        api.get('/suppliers'),
      ]);
      if (poRes.data?.data) setPurchaseOrders(poRes.data.data);
      if (suppRes.data?.data) setSuppliers(suppRes.data.data);
    } catch (err) {
      console.error('Failed to load POs/Suppliers:', err);
    }
  };

  useEffect(() => {
    fetchGRNs();
    fetchPOsAndSuppliers();
  }, []);

  const handleSelectPo = (id: string) => {
    setPoId(id);
    const po = purchaseOrders.find((p) => p.id === id);
    if (po) {
      setSupplierId(po.supplier_id);
      const defaultExpDate = new Date();
      defaultExpDate.setFullYear(defaultExpDate.getFullYear() + 2);
      const expStr = defaultExpDate.toISOString().slice(0, 10);

      setGrnItems(
        (po.items || []).map((it: any) => ({
          poItemId: it.id,
          medicineId: it.medicine_id,
          medicineName: it.medicine_name,
          batchNumber: `B-${Math.floor(1000 + Math.random() * 9000)}`,
          expiryDate: expStr,
          orderedQuantity: Number(it.ordered_quantity || 0),
          receivedPaidQuantity: Math.max(0, Number(it.ordered_quantity || 0) - Number(it.received_quantity || 0)),
          freeQuantity: Number(it.free_quantity_expected || 0),
          damagedQuantity: 0,
          rejectedQuantity: 0,
          purchaseRateRupees: Number(it.purchase_rate_paise || 0) / 100,
          mrpRupees: Number(it.mrp_expected_paise || 0) / 100 || 150,
        }))
      );
    }
  };

  const handleCreateAndPostGrn = async () => {
    if (!supplierId) {
      alert('Please select a supplier');
      return;
    }
    if (grnItems.length === 0) {
      alert('No line items to receive');
      return;
    }

    try {
      // 1. Create GRN
      const createRes = await api.post('/procurement/grn', {
        supplierId,
        poId: poId || null,
        supplierDeliveryNote: deliveryNote,
        items: grnItems.map((it) => ({
          poItemId: it.poItemId || null,
          medicineId: it.medicineId,
          batchNumber: it.batchNumber,
          expiryDate: it.expiryDate,
          orderedQuantity: it.orderedQuantity,
          receivedPaidQuantity: Number(it.receivedPaidQuantity),
          freeQuantity: Number(it.freeQuantity || 0),
          damagedQuantity: Number(it.damagedQuantity || 0),
          rejectedQuantity: Number(it.rejectedQuantity || 0),
          purchaseRatePaise: Math.round(Number(it.purchaseRateRupees) * 100),
          mrpPaise: Math.round(Number(it.mrpRupees) * 100),
        })),
      });

      const newGrn = createRes.data.data;

      // 2. Post GRN to commit batches and stock positions
      await api.post(`/procurement/grn/${newGrn.id}/post`);

      setIsReceivingModalOpen(false);
      fetchGRNs();
      alert(`GRN #${newGrn.grn_number} successfully posted! Stock and batches committed.`);
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to receive stock');
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
            Goods Receipt Notes & Stock Inward ({grns.length})
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setIsReceivingModalOpen(true);
              setPoId('');
              setGrnItems([]);
            }}
            className="px-3 py-1.5 text-xs font-bold rounded bg-success hover:bg-success text-on-primary transition flex items-center gap-1"
          >
            📥 Inward Receiving Session
          </button>
        </div>
      </div>

      {/* SPLIT VIEW: GRN LIST + DETAILS DRAWER */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 flex-1 min-h-0">
        {/* GRN LIST TABLE */}
        <div className="md:col-span-2 bg-surface-elevated/40 rounded-xl border border-border overflow-hidden flex flex-col">
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-surface-elevated/90 text-foreground border-b border-border uppercase font-semibold text-[11px] tracking-wider">
                  <th className="p-3">GRN #</th>
                  <th className="p-3">PO Reference</th>
                  <th className="p-3">Supplier</th>
                  <th className="p-3">Received At</th>
                  <th className="p-3">Items Inwarded</th>
                  <th className="p-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {grns.map((g) => (
                  <tr
                    key={g.id}
                    onClick={() => setSelectedGrn(g)}
                    className={`hover:bg-surface-alt/50 cursor-pointer transition ${
                      selectedGrn?.id === g.id ? 'bg-surface-alt/60 border-l-4 border-success/25' : ''
                    }`}
                  >
                    <td className="p-3 font-mono font-bold text-foreground-strong">{g.grn_number}</td>
                    <td className="p-3 font-mono text-info">{g.po_number || 'Direct Inward'}</td>
                    <td className="p-3 font-semibold text-foreground-strong">{g.supplier_name || 'N/A'}</td>
                    <td className="p-3 text-muted font-mono">
                      {g.received_at ? new Date(g.received_at).toLocaleDateString('en-IN') : 'N/A'}
                    </td>
                    <td className="p-3 text-foreground">{g.items?.length || 0} batches</td>
                    <td className="p-3">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${
                          g.status === 'POSTED'
                            ? 'bg-success/8 text-success border border-success/25'
                            : g.status === 'REVIEW'
                            ? 'bg-danger/8 text-danger border border-danger/25'
                            : 'bg-warning/8 text-warning border border-warning/25'
                        }`}
                      >
                        {g.status}
                      </span>
                    </td>
                  </tr>
                ))}
                {grns.length === 0 && !isLoading && (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-muted">
                      No Goods Receipt Notes posted yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* DETAILS DRAWER */}
        <div className="bg-surface-elevated/50 rounded-xl border border-border p-4 flex flex-col gap-4 overflow-y-auto">
          {selectedGrn ? (
            <>
              <div className="flex justify-between items-start border-b border-border pb-3">
                <div>
                  <div className="text-xs text-muted uppercase font-semibold">GRN Inward Record</div>
                  <div className="text-base font-black text-foreground-strong font-mono">{selectedGrn.grn_number}</div>
                </div>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                    selectedGrn.status === 'POSTED' ? 'bg-success/8 text-success' : 'bg-warning/8 text-warning'
                  }`}
                >
                  {selectedGrn.status}
                </span>
              </div>

              <div className="text-xs space-y-2 text-foreground">
                <div>
                  <span className="text-muted">Supplier:</span> <strong className="text-foreground-strong">{selectedGrn.supplier_name}</strong>
                </div>
                <div>
                  <span className="text-muted">Delivery Note:</span> <strong className="text-foreground-strong">{selectedGrn.supplier_delivery_note || 'N/A'}</strong>
                </div>
                <div>
                  <span className="text-muted">Received By:</span> <strong className="text-foreground-strong">{selectedGrn.received_by}</strong>
                </div>
              </div>

              {/* BATCHES INWARDED */}
              <div className="space-y-2">
                <div className="text-xs font-bold uppercase text-muted">Inward Batches ({selectedGrn.items?.length || 0})</div>
                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {selectedGrn.items?.map((it: any) => (
                    <div key={it.id} className="p-2.5 rounded bg-surface/70 border border-border text-xs">
                      <div className="flex justify-between font-bold text-foreground-strong">
                        <span>{it.medicine_name || it.medicine_id}</span>
                        <span className="text-success font-mono">Accepted: {it.accepted_quantity}</span>
                      </div>
                      <div className="flex justify-between text-[11px] text-muted mt-1">
                        <span>Batch: <strong className="text-foreground-strong">{it.batch_number}</strong></span>
                        <span>Exp: <strong className="text-foreground-strong">{it.expiry_date}</strong></span>
                      </div>
                      <div className="flex justify-between text-[11px] text-muted mt-1">
                        <span>Paid: {it.received_paid_quantity} | Free: {it.free_quantity || 0}</span>
                        <span>Damaged: {it.damaged_quantity || 0}</span>
                      </div>
                      {it.effective_cost_paise && (
                        <div className="text-[10px] text-muted mt-1 font-mono">
                          Effective Acquisition Rate: <strong className="text-success">{formatRupees(it.effective_cost_paise)}</strong>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="h-full flex items-center justify-center text-muted text-xs text-center p-6">
              Select a Goods Receipt Note to view verified physical inward batches and effective cost calculations.
            </div>
          )}
        </div>
      </div>

      {/* RECEIVING SESSION MODAL */}
      {isReceivingModalOpen && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <div className="bg-surface-elevated border border-border rounded-xl max-w-4xl w-full p-6 space-y-4 text-foreground-strong shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-border pb-3">
              <div>
                <h3 className="text-base font-bold uppercase tracking-wider text-foreground-strong">Inward Goods Receipt Session (GRN)</h3>
                <p className="text-xs text-muted">Match against approved Purchase Order or record direct supplier delivery</p>
              </div>
              <button onClick={() => setIsReceivingModalOpen(false)} className="text-muted hover:text-foreground-strong">✕</button>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-muted uppercase mb-1">Link Purchase Order</label>
                <select
                  value={poId}
                  onChange={(e) => handleSelectPo(e.target.value)}
                  className="w-full bg-surface border border-border rounded p-2 text-xs text-foreground-strong"
                >
                  <option value="">Direct Receiving (No PO)...</option>
                  {purchaseOrders.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.po_number} — {p.supplier_name}
                    </option>
                  ))}
                </select>
              </div>

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
                <label className="block text-xs font-semibold text-muted uppercase mb-1">Delivery Note / Challan #</label>
                <input
                  type="text"
                  placeholder="e.g. DN-90821"
                  value={deliveryNote}
                  onChange={(e) => setDeliveryNote(e.target.value)}
                  className="w-full bg-surface border border-border rounded p-2 text-xs text-foreground-strong"
                />
              </div>
            </div>

            {/* HIGH-DENSITY RECEIVING GRID */}
            <div className="space-y-2">
              <div className="text-xs font-bold uppercase text-foreground">Receiving Line Items</div>
              <div className="border border-border rounded-lg overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-surface text-muted uppercase text-[10px]">
                    <tr>
                      <th className="p-2">Product</th>
                      <th className="p-2">Batch #</th>
                      <th className="p-2">Expiry Date</th>
                      <th className="p-2 text-center">Paid Qty</th>
                      <th className="p-2 text-center">Free Qty</th>
                      <th className="p-2 text-center">Damaged</th>
                      <th className="p-2">Purchase Rate (₹)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {grnItems.map((it, idx) => (
                      <tr key={idx} className="bg-surface-elevated/60">
                        <td className="p-2 font-bold text-foreground-strong">{it.medicineName}</td>
                        <td className="p-2">
                          <input
                            type="text"
                            value={it.batchNumber}
                            onChange={(e) => {
                              const val = e.target.value;
                              setGrnItems((prev) =>
                                prev.map((item, i) => (i === idx ? { ...item, batchNumber: val } : item))
                              );
                            }}
                            className="w-24 bg-surface border border-border rounded p-1 text-xs text-foreground-strong font-mono"
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="date"
                            value={it.expiryDate}
                            onChange={(e) => {
                              const val = e.target.value;
                              setGrnItems((prev) =>
                                prev.map((item, i) => (i === idx ? { ...item, expiryDate: val } : item))
                              );
                            }}
                            className="bg-surface border border-border rounded p-1 text-xs text-foreground-strong font-mono"
                          />
                        </td>
                        <td className="p-2 text-center">
                          <input
                            type="number"
                            min="0"
                            value={it.receivedPaidQuantity}
                            onChange={(e) => {
                              const val = Number(e.target.value);
                              setGrnItems((prev) =>
                                prev.map((item, i) => (i === idx ? { ...item, receivedPaidQuantity: val } : item))
                              );
                            }}
                            className="w-16 bg-surface border border-border rounded p-1 text-center font-bold text-foreground-strong text-xs"
                          />
                        </td>
                        <td className="p-2 text-center">
                          <input
                            type="number"
                            min="0"
                            value={it.freeQuantity}
                            onChange={(e) => {
                              const val = Number(e.target.value);
                              setGrnItems((prev) =>
                                prev.map((item, i) => (i === idx ? { ...item, freeQuantity: val } : item))
                              );
                            }}
                            className="w-16 bg-surface border border-border rounded p-1 text-center font-bold text-success text-xs"
                          />
                        </td>
                        <td className="p-2 text-center">
                          <input
                            type="number"
                            min="0"
                            value={it.damagedQuantity}
                            onChange={(e) => {
                              const val = Number(e.target.value);
                              setGrnItems((prev) =>
                                prev.map((item, i) => (i === idx ? { ...item, damagedQuantity: val } : item))
                              );
                            }}
                            className="w-16 bg-surface border border-border rounded p-1 text-center font-bold text-danger text-xs"
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="number"
                            step="0.01"
                            value={it.purchaseRateRupees}
                            onChange={(e) => {
                              const val = Number(e.target.value);
                              setGrnItems((prev) =>
                                prev.map((item, i) => (i === idx ? { ...item, purchaseRateRupees: val } : item))
                              );
                            }}
                            className="w-20 bg-surface border border-border rounded p-1 text-xs text-foreground-strong"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-border">
              <button
                onClick={() => setIsReceivingModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold rounded bg-surface-alt hover:bg-surface-alt text-foreground-strong"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateAndPostGrn}
                className="px-4 py-2 text-xs font-bold rounded bg-success hover:bg-success text-on-primary shadow-lg"
              >
                ✓ Post GRN & Inward Stock
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
