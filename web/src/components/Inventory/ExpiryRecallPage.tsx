import React, { useState, useEffect } from 'react';
import { 
  ShieldAlert, 
  Plus, 
  CheckCircle2, 
  RefreshCw,
} from 'lucide-react';
import api from '../../lib/api';
import toast from 'react-hot-toast';

export const ExpiryRecallPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'EXPIRY' | 'RECALL'>('EXPIRY');
  const [loading, setLoading] = useState(false);

  // Expiry state
  const [expiryData, setExpiryData] = useState<any>(null);

  // Recall state
  const [recalls, setRecalls] = useState<any[]>([]);
  const [selectedRecall, setSelectedRecall] = useState<any>(null);
  const [salesTrace, setSalesTrace] = useState<any>(null);
  const [rxTrace, setRxTrace] = useState<any[]>([]);
  const [showCreateRecallModal, setShowCreateRecallModal] = useState(false);
  const [medicines, setMedicines] = useState<any[]>([]);

  // Recall form
  const [recallRef, setRecallRef] = useState('');
  const [selectedProdId, setSelectedProdId] = useState('');
  const [batchNumber, setBatchNumber] = useState('');
  const [manufacturer, setManufacturer] = useState('');
  const [recallReason, setRecallReason] = useState('');
  const [severity, setSeverity] = useState('CLASS_I');

  const loadExpiryData = async () => {
    try {
      setLoading(true);
      const res = await api.get('/inventory/expiry-risk?days=180');
      setExpiryData(res.data?.data);
    } catch (err) {
      toast.error('Failed to load expiry intelligence');
    } finally {
      setLoading(false);
    }
  };

  const loadRecalls = async () => {
    try {
      setLoading(true);
      const [recRes, medRes] = await Promise.all([
        api.get('/inventory/recalls'),
        api.get('/inventory/medicines'),
      ]);
      setRecalls(recRes.data?.data || []);
      setMedicines(medRes.data?.data || []);
    } catch (err) {
      toast.error('Failed to load recalls');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'EXPIRY') {
      loadExpiryData();
    } else {
      loadRecalls();
    }
  }, [activeTab]);

  const handleCreateRecall = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/inventory/recalls', {
        recallReference: recallRef,
        productId: selectedProdId,
        batchNumber: batchNumber || null,
        manufacturer,
        reason: recallReason,
        severity,
      });
      toast.success('Recall draft registered');
      setShowCreateRecallModal(false);
      loadRecalls();
    } catch (err: any) {
      toast.error(err.response?.data?.error?.message || 'Failed to create recall');
    }
  };

  const handleActivateRecall = async (recallId: string) => {
    try {
      await api.post(`/inventory/recalls/${recallId}/activate`);
      toast.success('RECALL ACTIVATED: Inventory automatically locked across all stores!');
      loadRecalls();
    } catch (err: any) {
      toast.error(err.response?.data?.error?.message || 'Failed to activate recall');
    }
  };

  const handleViewTraces = async (recall: any) => {
    setSelectedRecall(recall);
    try {
      const [salesRes, rxRes] = await Promise.all([
        api.get(`/inventory/recalls/${recall.id}/trace/sales`),
        api.get(`/inventory/recalls/${recall.id}/trace/prescriptions`),
      ]);
      setSalesTrace(salesRes.data?.data);
      setRxTrace(rxRes.data?.data || []);
    } catch (err) {
      toast.error('Failed to fetch historical traces');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Tabs */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-bg-surface p-5 rounded-xl border border-border">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <ShieldAlert className="w-6 h-6 text-accent-primary" />
            Expiry & recalls
          </h1>
          <p className="text-xs text-muted mt-1">
            Review expiry risks, manage recalls, and trace affected stock.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-bg-card p-1 rounded-lg border border-border">
            <button
              onClick={() => setActiveTab('EXPIRY')}
              className={`px-3 py-1.5 text-xs font-bold rounded-md transition-colors ${
                activeTab === 'EXPIRY'
                  ? 'bg-accent-primary text-foreground-strong'
                  : 'text-muted hover:text-foreground'
              }`}
            >
              Expiry Intelligence
            </button>
            <button
              onClick={() => setActiveTab('RECALL')}
              className={`px-3 py-1.5 text-xs font-bold rounded-md transition-colors ${
                activeTab === 'RECALL'
                  ? 'bg-accent-primary text-foreground-strong'
                  : 'text-muted hover:text-foreground'
              }`}
            >
              Product Recalls
            </button>
          </div>

          <button
            onClick={activeTab === 'EXPIRY' ? loadExpiryData : loadRecalls}
            className="flex items-center gap-1 px-3 py-2 text-xs font-semibold rounded-lg border border-border hover:bg-bg-card text-foreground"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {activeTab === 'EXPIRY' && (
        <div className="space-y-6">
          {/* Expiry Buckets Summary */}
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
            {(expiryData?.buckets || []).map((b: any) => (
              <div key={b.bucket} className="bg-bg-surface p-3.5 rounded-xl border border-border">
                <p className="text-[10px] font-bold text-muted uppercase tracking-wider">{b.bucket}</p>
                <p className="text-base font-bold text-foreground mt-1">{b.totalUnits} Units</p>
                <p className="text-[10px] text-danger font-semibold mt-0.5">
                  ₹{((b.totalCostExposurePaise || 0) / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                </p>
              </div>
            ))}
          </div>

          {/* Expiry Risk Items Table */}
          <div className="bg-bg-surface rounded-xl border border-border overflow-hidden">
            <div className="p-4 border-b border-border font-bold text-xs text-foreground">
              Batches Approaching Expiry & Action Recommendations
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-foreground">
                <thead className="bg-bg-card border-b border-border text-[11px] font-bold text-muted uppercase tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Medicine & Batch</th>
                    <th className="py-3 px-3">Expiry Date</th>
                    <th className="py-3 px-3 text-right">Days Left</th>
                    <th className="py-3 px-3 text-right">Qty</th>
                    <th className="py-3 px-3 text-right">Daily Demand</th>
                    <th className="py-3 px-3 text-right">Risk Units</th>
                    <th className="py-3 px-3 text-right">Cost Exposure (₹)</th>
                    <th className="py-3 px-4 text-center">Action Recommendation</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {(!expiryData?.items || expiryData.items.length === 0) ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-muted">
                        No batches expiring within the threshold.
                      </td>
                    </tr>
                  ) : (
                    expiryData.items.map((it: any) => (
                      <tr key={it.batchId} className="hover:bg-bg-card/40">
                        <td className="py-3 px-4">
                          <div className="font-semibold text-foreground">{it.medicineName}</div>
                          <div className="text-[10px] text-muted">Batch #{it.batchNumber}</div>
                        </td>
                        <td className="py-3 px-3 text-muted">{it.expiryDate}</td>
                        <td className="py-3 px-3 text-right font-mono font-bold">
                          <span className={it.daysUntilExpiry <= 30 ? 'text-danger' : 'text-foreground'}>
                            {it.daysUntilExpiry <= 0 ? 'EXPIRED' : `${it.daysUntilExpiry}d`}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-right font-mono">{it.quantityRemaining}</td>
                        <td className="py-3 px-3 text-right font-mono text-muted">{it.avgDailyDemand?.toFixed(1) || '0.0'}</td>
                        <td className="py-3 px-3 text-right font-mono font-bold text-warning">{it.riskQuantityUnits}</td>
                        <td className="py-3 px-3 text-right font-mono font-bold text-danger">
                          ₹{(it.totalCostExposurePaise / 100).toFixed(2)}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                            it.recommendedAction === 'DISPOSE'
                              ? 'bg-danger/10 text-danger border border-danger/30'
                              : it.recommendedAction === 'PROMOTION_CANDIDATE'
                              ? 'bg-violet/10 text-violet border border-violet/30'
                              : it.recommendedAction === 'RETURN_TO_SUPPLIER'
                              ? 'bg-warning/10 text-warning border border-warning/30'
                              : 'bg-info/10 text-info border border-info/30'
                          }`}>
                            {it.recommendedAction.replace(/_/g, ' ')}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'RECALL' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-sm font-bold text-foreground">Registered Product Recalls</h2>
            <button
              onClick={() => setShowCreateRecallModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-danger text-foreground-strong text-xs font-bold rounded-lg hover:bg-danger shadow-sm"
            >
              <Plus className="w-4 h-4" />
              Register New Recall
            </button>
          </div>

          {/* Recalls Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {recalls.length === 0 ? (
              <p className="col-span-2 py-8 text-center text-muted text-xs">No recalls registered.</p>
            ) : (
              recalls.map((r) => (
                <div key={r.id} className="p-4 bg-bg-surface rounded-xl border border-border space-y-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-danger/10 text-danger border border-danger/30">
                        {r.severity} · {r.recall_type}
                      </span>
                      <h3 className="text-sm font-bold text-foreground mt-2">{r.product_name}</h3>
                      <p className="text-[11px] text-muted">
                        Ref: {r.recall_reference} {r.batch_number ? `· Batch #${r.batch_number}` : ''}
                      </p>
                    </div>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      r.status === 'ACTIVE'
                        ? 'bg-danger/10 text-danger border border-danger/30'
                        : 'bg-surface-alt/10 text-muted border border-border/30'
                    }`}>
                      {r.status}
                    </span>
                  </div>

                  <p className="text-xs text-muted line-clamp-2">Reason: {r.reason}</p>

                  <div className="flex justify-between items-center pt-2 border-t border-border">
                    {r.status === 'DRAFT' ? (
                      <button
                        onClick={() => handleActivateRecall(r.id)}
                        className="px-3 py-1 bg-danger text-foreground-strong text-xs font-bold rounded hover:bg-danger"
                      >
                        Activate & Lock Stock
                      </button>
                    ) : (
                      <span className="text-[11px] text-success font-semibold flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Stock Locked in POS/FEFO
                      </span>
                    )}

                    <button
                      onClick={() => handleViewTraces(r)}
                      className="text-xs font-bold text-accent-primary hover:underline"
                    >
                      Trace Sales & Patients &rarr;
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Recall Trace Modal */}
      {selectedRecall && salesTrace && (
        <div className="fixed inset-0 bg-black/60  z-50 flex items-center justify-center p-4">
          <div className="bg-bg-surface border border-border rounded-xl max-w-2xl w-full p-5 space-y-4 max-h-[85vh] overflow-y-auto custom-scrollbar shadow-2xl">
            <div className="flex justify-between items-center pb-3 border-b border-border">
              <div>
                <h2 className="text-base font-bold text-foreground">Recall Historical Traceability Report</h2>
                <p className="text-xs text-muted">{selectedRecall.product_name} · Ref: {selectedRecall.recall_reference}</p>
              </div>
              <button onClick={() => setSelectedRecall(null)} className="text-muted hover:text-foreground text-sm font-bold">
                ✕
              </button>
            </div>

            {/* Metrics */}
            <div className="grid grid-cols-4 gap-3">
              <div className="p-3 bg-bg-card rounded-lg border border-border">
                <p className="text-[10px] uppercase font-bold text-muted">Sold Units</p>
                <p className="text-base font-bold text-foreground mt-0.5">{salesTrace.totalUnitsSold}</p>
              </div>
              <div className="p-3 bg-bg-card rounded-lg border border-border">
                <p className="text-[10px] uppercase font-bold text-muted">Invoices</p>
                <p className="text-base font-bold text-foreground mt-0.5">{salesTrace.totalInvoicesCount}</p>
              </div>
              <div className="p-3 bg-bg-card rounded-lg border border-border">
                <p className="text-[10px] uppercase font-bold text-muted">Known Patients</p>
                <p className="text-base font-bold text-success mt-0.5">{salesTrace.identifiedCustomersCount}</p>
              </div>
              <div className="p-3 bg-bg-card rounded-lg border border-border">
                <p className="text-[10px] uppercase font-bold text-muted">Rx Dispensed</p>
                <p className="text-base font-bold text-violet mt-0.5">{rxTrace.length}</p>
              </div>
            </div>

            {/* Invoices List */}
            <div className="space-y-2">
              <h3 className="text-xs font-bold text-muted uppercase tracking-wider">Affected Sale Invoices</h3>
              <div className="border border-border rounded-lg max-h-48 overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-bg-card text-[10px] font-bold text-muted uppercase">
                    <tr>
                      <th className="p-2">Invoice #</th>
                      <th className="p-2">Date</th>
                      <th className="p-2">Customer Name</th>
                      <th className="p-2">Phone</th>
                      <th className="p-2 text-right">Qty</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {salesTrace.invoices.map((inv: any) => (
                      <tr key={inv.saleId}>
                        <td className="p-2 font-mono">{inv.invoiceNumber}</td>
                        <td className="p-2 text-muted">{new Date(inv.saleDate).toLocaleDateString()}</td>
                        <td className="p-2 font-semibold">{inv.customerName}</td>
                        <td className="p-2 text-muted">{inv.customerPhone || '—'}</td>
                        <td className="p-2 text-right font-bold">{inv.quantitySold}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create Recall Modal */}
      {showCreateRecallModal && (
        <div className="fixed inset-0 bg-black/60  z-50 flex items-center justify-center p-4">
          <div className="bg-bg-surface border border-border rounded-xl max-w-md w-full p-5 space-y-4 shadow-xl">
            <h2 className="text-base font-bold text-foreground">Register Product Recall</h2>
            <form onSubmit={handleCreateRecall} className="space-y-3 text-xs">
              <div>
                <label className="text-muted block mb-1">Recall Reference / Order Number</label>
                <input
                  type="text"
                  placeholder="e.g. CDSCO-2026-REC-098"
                  value={recallRef}
                  onChange={(e) => setRecallRef(e.target.value)}
                  className="w-full bg-bg-card border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="text-muted block mb-1">Product</label>
                <select
                  value={selectedProdId}
                  onChange={(e) => setSelectedProdId(e.target.value)}
                  className="w-full bg-bg-card border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none"
                  required
                >
                  <option value="">-- Select Product --</option>
                  {medicines.map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-muted block mb-1">Batch Number (Optional - Leave blank for whole product)</label>
                <input
                  type="text"
                  placeholder="e.g. BATCH-991A"
                  value={batchNumber}
                  onChange={(e) => setBatchNumber(e.target.value)}
                  className="w-full bg-bg-card border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none"
                />
              </div>

              <div>
                <label className="text-muted block mb-1">Manufacturer</label>
                <input
                  type="text"
                  placeholder="e.g. Cipla Ltd / Sun Pharma"
                  value={manufacturer}
                  onChange={(e) => setManufacturer(e.target.value)}
                  className="w-full bg-bg-card border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none"
                />
              </div>

              <div>
                <label className="text-muted block mb-1">Severity / Classification</label>
                <select
                  value={severity}
                  onChange={(e) => setSeverity(e.target.value)}
                  className="w-full bg-bg-card border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none"
                >
                  <option value="CLASS_I">Class I (Critical / Health Hazard)</option>
                  <option value="CLASS_II">Class II (Temporary / Reversible Risk)</option>
                  <option value="CLASS_III">Class III (Minor / Administrative Defect)</option>
                </select>
              </div>

              <div>
                <label className="text-muted block mb-1">Recall Reason / Statutory Notice</label>
                <textarea
                  rows={3}
                  placeholder="Describe failure reason, test report, or government circular..."
                  value={recallReason}
                  onChange={(e) => setRecallReason(e.target.value)}
                  className="w-full bg-bg-card border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none"
                  required
                />
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowCreateRecallModal(false)}
                  className="px-3 py-1.5 text-muted hover:text-foreground font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-danger text-foreground-strong font-bold rounded-lg hover:bg-danger"
                >
                  Save Recall Draft
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
