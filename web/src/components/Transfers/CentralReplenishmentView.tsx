import React, { useState, useEffect } from 'react';
import { RefreshCw, Zap } from 'lucide-react';
import api from '../../lib/api';

export const CentralReplenishmentView: React.FC = () => {
  const [activeSubTab, setActiveSubTab] = useState<'replenishment' | 'rebalancing' | 'expiry'>('replenishment');
  const [stores, setStores] = useState<any[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState('');
  const [decisions, setDecisions] = useState<any[]>([]);
  const [rebalancingRecs, setRebalancingRecs] = useState<any[]>([]);
  const [expiryPlans, setExpiryPlans] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    loadStores();
  }, []);

  const loadStores = async () => {
    try {
      const res = await api.get('/transfers/locations');
      const storeLocs = (res.data || []).filter((l: any) => l.type === 'STORE');
      setStores(storeLocs);
      if (storeLocs.length > 0) {
        setSelectedStoreId(storeLocs[0].id);
      }
    } catch (err: any) {
      console.error('Failed to load stores:', err);
    }
  };

  useEffect(() => {
    if (selectedStoreId && activeSubTab === 'replenishment') {
      loadReplenishment();
    } else if (activeSubTab === 'rebalancing') {
      loadRebalancing();
    } else if (activeSubTab === 'expiry') {
      loadExpiry();
    }
  }, [selectedStoreId, activeSubTab]);

  const loadReplenishment = async () => {
    if (!selectedStoreId) return;
    try {
      setIsLoading(true);
      const res = await api.get(`/transfers/replenishment/recommendations?storeId=${selectedStoreId}`);
      setDecisions(res.data || []);
    } catch (err: any) {
      console.error('Replenishment load failed:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const loadRebalancing = async () => {
    try {
      setIsLoading(true);
      const res = await api.get('/transfers/rebalancing/recommendations');
      setRebalancingRecs(res.data || []);
    } catch (err: any) {
      console.error('Rebalancing load failed:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const loadExpiry = async () => {
    try {
      setIsLoading(true);
      const res = await api.get('/transfers/expiry/redistributions');
      setExpiryPlans(res.data || []);
    } catch (err: any) {
      console.error('Expiry redistribution load failed:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerateTransfers = async () => {
    try {
      setIsGenerating(true);
      await api.post('/transfers/replenishment/generate-transfers', {
        storeId: selectedStoreId,
        decisions: decisions.filter((d: any) => d.decisionType === 'WAREHOUSE_TRANSFER' || d.decisionType === 'STORE_REBALANCE'),
      });
      alert('Internal transfer requests successfully generated!');
      loadReplenishment();
    } catch (err: any) {
      alert(`Generation failed: ${err.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Sub-tab navigation */}
      <div className="flex items-center justify-between border-b border-border bg-surface/60 p-2 rounded-t-lg">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveSubTab('replenishment')}
            className={`px-3 py-1.5 text-xs font-semibold rounded transition ${
              activeSubTab === 'replenishment' ? 'bg-primary text-foreground-strong' : 'text-muted hover:text-foreground-strong'
            }`}
          >
            Central Warehouse Replenishment
          </button>
          <button
            onClick={() => setActiveSubTab('rebalancing')}
            className={`px-3 py-1.5 text-xs font-semibold rounded transition ${
              activeSubTab === 'rebalancing' ? 'bg-primary text-foreground-strong' : 'text-muted hover:text-foreground-strong'
            }`}
          >
            Cross-Store Rebalancing
          </button>
          <button
            onClick={() => setActiveSubTab('expiry')}
            className={`px-3 py-1.5 text-xs font-semibold rounded transition ${
              activeSubTab === 'expiry' ? 'bg-primary text-foreground-strong' : 'text-muted hover:text-foreground-strong'
            }`}
          >
            Near-Expiry Redistribution
          </button>
        </div>

        {activeSubTab === 'replenishment' && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted font-medium">Destination Store:</span>
            <select
              value={selectedStoreId}
              onChange={(e) => setSelectedStoreId(e.target.value)}
              className="bg-surface-elevated border border-border text-xs text-foreground-strong rounded px-2.5 py-1 focus:outline-none focus:border-primary/25"
            >
              {stores.map((s: any) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.code})
                </option>
              ))}
            </select>
            <button
              onClick={loadReplenishment}
              className="p-1.5 bg-surface-elevated hover:bg-surface-alt text-foreground rounded border border-border transition"
              title="Refresh analysis"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        )}
      </div>

      {/* Sub-tab 1: Central Warehouse Replenishment */}
      {activeSubTab === 'replenishment' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between bg-surface border border-border p-3 rounded-lg">
            <div>
              <h3 className="text-xs font-semibold text-foreground-strong">Replenishment Deficit & Source Optimization</h3>
              <p className="text-[11px] text-muted">Evaluates ROP deficit against central warehouse and pending transfers</p>
            </div>
            <button
              onClick={handleGenerateTransfers}
              disabled={isGenerating || decisions.filter((d: any) => d.recommendedTransferQuantity > 0).length === 0}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-primary hover:bg-primary text-foreground-strong text-xs font-semibold rounded shadow-sm transition disabled:opacity-50"
            >
              <Zap className="w-3.5 h-3.5" /> Auto-Generate Transfer Requests
            </button>
          </div>

          <div className="bg-surface border border-border rounded-lg overflow-hidden">
            <table className="w-full text-left text-xs text-foreground">
              <thead className="bg-surface-elevated/80 text-muted uppercase tracking-wider font-semibold border-b border-border">
                <tr>
                  <th className="px-3.5 py-2.5">Medicine SKU</th>
                  <th className="px-3.5 py-2.5 text-center">Available</th>
                  <th className="px-3.5 py-2.5 text-center">Days Cover</th>
                  <th className="px-3.5 py-2.5 text-center">Target ROP</th>
                  <th className="px-3.5 py-2.5 text-center">Incoming Pipeline</th>
                  <th className="px-3.5 py-2.5 text-center">Deficit</th>
                  <th className="px-3.5 py-2.5">Recommended Decision</th>
                  <th className="px-3.5 py-2.5 text-right">Transfer Qty</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {isLoading ? (
                  <tr>
                    <td colSpan={8} className="text-center py-8 text-muted">
                      <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-primary" />
                      Analyzing store demand & inventory pipelines...
                    </td>
                  </tr>
                ) : decisions.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-8 text-muted">
                      No replenishment needed for this location. Stock levels are healthy.
                    </td>
                  </tr>
                ) : (
                  decisions.map((d: any, i: number) => (
                    <tr key={i} className="hover:bg-surface-elevated/40 transition">
                      <td className="px-3.5 py-2.5 font-semibold text-foreground-strong">{d.medicineName}</td>
                      <td className="px-3.5 py-2.5 text-center font-mono font-medium text-foreground-strong">{d.currentAvailableStock}</td>
                      <td className="px-3.5 py-2.5 text-center font-mono">{d.daysOfCover}d</td>
                      <td className="px-3.5 py-2.5 text-center font-mono">{d.targetStock}</td>
                      <td className="px-3.5 py-2.5 text-center font-mono text-primary">{d.incomingQuantity}</td>
                      <td className="px-3.5 py-2.5 text-center font-mono text-warning font-bold">{d.deficitQuantity}</td>
                      <td className="px-3.5 py-2.5">
                        <span
                          className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                            d.decisionType === 'WAREHOUSE_TRANSFER'
                              ? 'bg-primary/10 text-primary border border-primary/20'
                              : d.decisionType === 'STORE_REBALANCE'
                              ? 'bg-violet/10 text-violet border border-violet/20'
                              : d.decisionType === 'WAIT_FOR_INCOMING'
                              ? 'bg-info/10 text-info'
                              : 'bg-surface-elevated text-muted'
                          }`}
                        >
                          {d.decisionType}
                        </span>
                        <p className="text-[10px] text-muted mt-0.5">{d.reason}</p>
                      </td>
                      <td className="px-3.5 py-2.5 text-right font-mono font-bold text-primary">
                        {d.recommendedTransferQuantity || 0}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Sub-tab 2: Store Rebalancing */}
      {activeSubTab === 'rebalancing' && (
        <div className="bg-surface border border-border rounded-lg overflow-hidden">
          <table className="w-full text-left text-xs text-foreground">
            <thead className="bg-surface-elevated/80 text-muted uppercase tracking-wider font-semibold border-b border-border">
              <tr>
                <th className="px-3.5 py-2.5">Medicine SKU</th>
                <th className="px-3.5 py-2.5">Excess Source</th>
                <th className="px-3.5 py-2.5 text-center">Protected Stock</th>
                <th className="px-3.5 py-2.5 text-center">Transferable</th>
                <th className="px-3.5 py-2.5">Deficit Destination</th>
                <th className="px-3.5 py-2.5 text-center">Dest. Cover</th>
                <th className="px-3.5 py-2.5 text-right">Rebalanced Qty</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rebalancingRecs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-muted">
                    No store rebalancing candidates detected.
                  </td>
                </tr>
              ) : (
                rebalancingRecs.map((rec: any, i: number) => (
                  <tr key={i} className="hover:bg-surface-elevated/40 transition">
                    <td className="px-3.5 py-2.5 font-semibold text-foreground-strong">{rec.medicineName}</td>
                    <td className="px-3.5 py-2.5 text-foreground-strong">{rec.sourceStoreName}</td>
                    <td className="px-3.5 py-2.5 text-center font-mono text-muted">{rec.sourceProtectedStock}</td>
                    <td className="px-3.5 py-2.5 text-center font-mono text-success font-semibold">{rec.sourceTransferableQuantity}</td>
                    <td className="px-3.5 py-2.5 text-foreground-strong">{rec.destinationStoreName}</td>
                    <td className="px-3.5 py-2.5 text-center font-mono text-warning">{rec.destinationDaysCover}d</td>
                    <td className="px-3.5 py-2.5 text-right font-mono font-bold text-primary">
                      {rec.recommendedTransferQuantity}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Sub-tab 3: Expiry Redistribution */}
      {activeSubTab === 'expiry' && (
        <div className="bg-surface border border-border rounded-lg overflow-hidden">
          <table className="w-full text-left text-xs text-foreground">
            <thead className="bg-surface-elevated/80 text-muted uppercase tracking-wider font-semibold border-b border-border">
              <tr>
                <th className="px-3.5 py-2.5">Medicine & Batch</th>
                <th className="px-3.5 py-2.5">Expiry Date</th>
                <th className="px-3.5 py-2.5">Slow Source</th>
                <th className="px-3.5 py-2.5 text-center">At-Risk Qty</th>
                <th className="px-3.5 py-2.5">Fast Destination</th>
                <th className="px-3.5 py-2.5 text-center">Dest. Capacity</th>
                <th className="px-3.5 py-2.5 text-right">Transfer Qty</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {expiryPlans.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-muted">
                    No near-expiry redistribution plans needed.
                  </td>
                </tr>
              ) : (
                expiryPlans.map((p: any, i: number) => (
                  <tr key={i} className="hover:bg-surface-elevated/40 transition">
                    <td className="px-3.5 py-2.5">
                      <p className="font-semibold text-foreground-strong">{p.medicineName}</p>
                      <span className="text-[10px] text-muted font-mono">Lot: {p.batchNumber}</span>
                    </td>
                    <td className="px-3.5 py-2.5 font-mono text-warning">
                      {p.expiryDate} ({p.daysUntilExpiry}d)
                    </td>
                    <td className="px-3.5 py-2.5 text-foreground">{p.sourceStoreName}</td>
                    <td className="px-3.5 py-2.5 text-center font-mono text-danger font-bold">{p.sourceAtRiskQuantity}</td>
                    <td className="px-3.5 py-2.5 text-foreground">{p.destinationStoreName}</td>
                    <td className="px-3.5 py-2.5 text-center font-mono text-primary">{p.destinationCapacityBeforeExpiry}</td>
                    <td className="px-3.5 py-2.5 text-right font-mono font-bold text-success">
                      {p.recommendedTransferQuantity}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
