import React, { useState, useEffect } from 'react';
import { 
  ShoppingBag, 
  RefreshCw, 
  Warehouse, 
  Truck, 
  Users, 
  Stethoscope, 
} from 'lucide-react';
import api from '../../lib/api';
import toast from 'react-hot-toast';

export const ReorderShortbookPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'REORDER' | 'SHORTBOOK'>('REORDER');
  const [loading, setLoading] = useState(false);
  const [reorders, setReorders] = useState<any[]>([]);
  const [shortbookItems, setShortbookItems] = useState<any[]>([]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [reRes, sbRes] = await Promise.all([
        api.get('/inventory/reorder-recommendations'),
        api.get('/shortbook/consolidated'),
      ]);
      setReorders(reRes.data?.data || []);
      setShortbookItems(sbRes.data?.data || []);
    } catch (err) {
      toast.error('Failed to load replenishment intelligence');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  return (
    <div className="space-y-6">
      {/* Header & Tabs */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-bg-surface p-5 rounded-xl border border-border">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <ShoppingBag className="w-6 h-6 text-accent-primary" />
            Reorder & shortbook
          </h1>
          <p className="text-xs text-muted mt-1">
            Plan replenishment using demand, supplier lead times, and available stock.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-bg-card p-1 rounded-lg border border-border">
            <button
              onClick={() => setActiveTab('REORDER')}
              className={`px-3 py-1.5 text-xs font-bold rounded-md transition-colors ${
                activeTab === 'REORDER'
                  ? 'bg-accent-primary text-foreground-strong'
                  : 'text-muted hover:text-foreground'
              }`}
            >
              Reorder Recommendations ({reorders.length})
            </button>
            <button
              onClick={() => setActiveTab('SHORTBOOK')}
              className={`px-3 py-1.5 text-xs font-bold rounded-md transition-colors ${
                activeTab === 'SHORTBOOK'
                  ? 'bg-accent-primary text-foreground-strong'
                  : 'text-muted hover:text-foreground'
              }`}
            >
              Shortbook ({shortbookItems.length})
            </button>
          </div>

          <button
            onClick={loadData}
            className="flex items-center gap-1 px-3 py-2 text-xs font-semibold rounded-lg border border-border hover:bg-bg-card text-foreground"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {activeTab === 'REORDER' && (
        <div className="bg-bg-surface rounded-xl border border-border overflow-hidden">
          <div className="p-4 border-b border-border font-bold text-xs text-foreground flex justify-between items-center">
            <span>Replenishment Candidates (Safety Stock & Lead Time Demand)</span>
            <span className="text-xs font-normal text-muted">
              {reorders.filter((r) => r.recommendedType === 'WAREHOUSE_REPLENISHMENT_CANDIDATE').length} Available in Central Warehouse
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-foreground">
              <thead className="bg-bg-card border-b border-border text-[11px] font-bold text-muted uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">Medicine Name</th>
                  <th className="py-3 px-3 text-right">Available</th>
                  <th className="py-3 px-3 text-right">Demand / Day</th>
                  <th className="py-3 px-3 text-right">Days Cover</th>
                  <th className="py-3 px-3 text-right">Reorder Point</th>
                  <th className="py-3 px-3 text-right">Deficit</th>
                  <th className="py-3 px-3 text-right">Pack Size</th>
                  <th className="py-3 px-3 text-right">Recommended Qty</th>
                  <th className="py-3 px-4 text-center">Fulfillment Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {reorders.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-8 text-center text-muted">
                      No medicines currently below reorder threshold. Inventory is optimal!
                    </td>
                  </tr>
                ) : (
                  reorders.map((r) => (
                    <tr key={r.medicineId} className="hover:bg-bg-card/40">
                      <td className="py-3 px-4 font-semibold text-foreground">
                        {r.medicineName}
                        <div className="text-[10px] text-muted font-normal">{r.reason}</div>
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-bold">{r.availableStock}</td>
                      <td className="py-3 px-3 text-right font-mono text-muted">{r.avgDailyDemand.toFixed(1)}</td>
                      <td className="py-3 px-3 text-right font-mono">
                        <span className={r.daysOfCover < 7 ? 'text-danger font-bold' : 'text-foreground'}>
                          {r.daysOfCover}d
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-muted">{r.reorderPoint}</td>
                      <td className="py-3 px-3 text-right font-mono text-warning font-bold">{r.calculatedDeficit}</td>
                      <td className="py-3 px-3 text-right font-mono text-muted">{r.packSize}</td>
                      <td className="py-3 px-3 text-right font-mono font-bold text-accent-primary text-sm">
                        {r.recommendedQuantity}
                      </td>
                      <td className="py-3 px-4 text-center">
                        {r.recommendedType === 'WAREHOUSE_REPLENISHMENT_CANDIDATE' ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-info/10 text-info border border-info/30">
                            <Warehouse className="w-3 h-3" />
                            Warehouse Candidate ({r.warehouseAvailableUnits} avail)
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-success/10 text-success border border-success/30">
                            <Truck className="w-3 h-3" />
                            Supplier PO (MOQ {r.minimumOrderQuantity})
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'SHORTBOOK' && (
        <div className="bg-bg-surface rounded-xl border border-border overflow-hidden">
          <div className="p-4 border-b border-border font-bold text-xs text-foreground">
            Consolidated Shortages & Out-of-Stock Demand Aggregations
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-foreground">
              <thead className="bg-bg-card border-b border-border text-[11px] font-bold text-muted uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">Medicine & Generic</th>
                  <th className="py-3 px-3 text-right">Total Qty Needed</th>
                  <th className="py-3 px-3 text-center">Requests Count</th>
                  <th className="py-3 px-3 text-center">Customer Requests</th>
                  <th className="py-3 px-3 text-center">Rx Shortages</th>
                  <th className="py-3 px-3">Sources</th>
                  <th className="py-3 px-3">Preferred Supplier</th>
                  <th className="py-3 px-4">First / Last Requested</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {shortbookItems.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-muted">
                      No active shortage entries in shortbook.
                    </td>
                  </tr>
                ) : (
                  shortbookItems.map((sb) => (
                    <tr key={sb.medicineId} className="hover:bg-bg-card/40">
                      <td className="py-3 px-4">
                        <div className="font-semibold text-foreground">{sb.medicineName}</div>
                        <div className="text-[10px] text-muted">{sb.genericName || '—'}</div>
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-bold text-accent-primary text-sm">
                        {sb.totalQuantityNeeded}
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-bg-card text-foreground">
                          {sb.requestCount}x
                        </span>
                      </td>
                      <td className="py-3 px-3 text-center">
                        {sb.customerRequestCount > 0 ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-warning bg-warning/10 px-2 py-0.5 rounded border border-warning/30">
                            <Users className="w-3 h-3" />
                            {sb.customerRequestCount}
                          </span>
                        ) : '0'}
                      </td>
                      <td className="py-3 px-3 text-center">
                        {sb.prescriptionShortageCount > 0 ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-violet bg-violet/10 px-2 py-0.5 rounded border border-violet/30">
                            <Stethoscope className="w-3 h-3" />
                            {sb.prescriptionShortageCount}
                          </span>
                        ) : '0'}
                      </td>
                      <td className="py-3 px-3">
                        <div className="flex flex-wrap gap-1">
                          {sb.sources.map((s: string) => (
                            <span key={s} className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-bg-card text-muted">
                              {s}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="py-3 px-3 text-muted">{sb.preferredSupplierName || '—'}</td>
                      <td className="py-3 px-4 text-[10px] text-muted">
                        <div>First: {new Date(sb.firstRequestedAt).toLocaleDateString()}</div>
                        <div>Last: {new Date(sb.lastRequestedAt).toLocaleDateString()}</div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
