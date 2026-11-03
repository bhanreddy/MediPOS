import React, { useState, useEffect } from 'react';
import { 
  PackageSearch, 
  RefreshCw, 
  Search,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import api from '../../lib/api';
import toast from 'react-hot-toast';

export const InventoryCommandCenter: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [stockStateFilter, setStockStateFilter] = useState('ALL');
  const [abcFilter, setAbcFilter] = useState('ALL');
  const [movementFilter, setMovementFilter] = useState('ALL');
  const [expandedMedId, setExpandedMedId] = useState<string | null>(null);

  const [valuation, setValuation] = useState<any>(null);
  const [classifications, setClassifications] = useState<any[]>([]);
  const [medicines, setMedicines] = useState<any[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [valRes, classRes, medRes, alertRes] = await Promise.all([
        api.get('/inventory/valuation').catch(() => ({ data: { data: null } })),
        api.get('/inventory/classifications').catch(() => ({ data: { data: [] } })),
        api.get('/inventory/medicines').catch(() => ({ data: { data: [] } })),
        api.get('/inventory/alerts').catch(() => ({ data: { data: [] } })),
      ]);

      setValuation(valRes.data?.data);
      setClassifications(classRes.data?.data || []);
      setMedicines(medRes.data?.data || []);
      setAlerts(alertRes.data?.data || []);
    } catch (err: any) {
      toast.error('Failed to load inventory intelligence data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Merge classifications with medicine stock
  const classMap = new Map<string, any>();
  for (const c of classifications) {
    classMap.set(c.medicineId, c);
  }

  const filteredMedicines = medicines.filter((m) => {
    const cls = classMap.get(m.id);
    const matchesSearch =
      !search ||
      m.name?.toLowerCase().includes(search.toLowerCase()) ||
      m.generic_name?.toLowerCase().includes(search.toLowerCase());

    const matchesCat = categoryFilter === 'ALL' || m.category === categoryFilter;
    const matchesAbc = abcFilter === 'ALL' || cls?.abcClass === abcFilter;
    const matchesMovement = movementFilter === 'ALL' || cls?.movementClass === movementFilter;

    let matchesState = true;
    if (stockStateFilter === 'OUT_OF_STOCK') matchesState = (m.total_stock || 0) === 0;
    if (stockStateFilter === 'LOW_STOCK') matchesState = (m.total_stock || 0) > 0 && (m.total_stock || 0) <= (m.low_stock_threshold || 10);
    if (stockStateFilter === 'AVAILABLE') matchesState = (m.total_stock || 0) > (m.low_stock_threshold || 10);

    return matchesSearch && matchesCat && matchesAbc && matchesMovement && matchesState;
  });

  const categories = Array.from(new Set(medicines.map((m) => m.category).filter(Boolean)));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-bg-surface p-5 rounded-xl border border-border">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <PackageSearch className="w-6 h-6 text-accent-primary" />
            Inventory overview
          </h1>
          <p className="text-xs text-muted mt-1">
            Monitor availability, sales trends, stock value, and alerts.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={loadData}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border border-border hover:bg-bg-card transition-colors text-foreground"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh overview
          </button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <div className="bg-bg-surface p-4 rounded-xl border border-border">
          <p className="text-[11px] font-semibold text-muted uppercase tracking-wider">Total Stock Value</p>
          <p className="text-lg font-bold text-foreground mt-1">
            ₹{((valuation?.totalCostValuePaise || 0) / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
          </p>
          <p className="text-[10px] text-muted mt-0.5">
            MRP ₹{((valuation?.totalMrpValuePaise || 0) / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
          </p>
        </div>

        <div className="bg-bg-surface p-4 rounded-xl border border-border">
          <p className="text-[11px] font-semibold text-muted uppercase tracking-wider">Gross Margin Potential</p>
          <p className="text-lg font-bold text-violet mt-1">
            {valuation?.potentialGrossMarginPct || 0}%
          </p>
          <p className="text-[10px] text-muted mt-0.5">
            ₹{((valuation?.potentialGrossMarginPaise || 0) / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
          </p>
        </div>

        <div className="bg-bg-surface p-4 rounded-xl border border-border">
          <p className="text-[11px] font-semibold text-muted uppercase tracking-wider">Active SKUs</p>
          <p className="text-lg font-bold text-foreground mt-1">{valuation?.totalSkus || medicines.length}</p>
          <p className="text-[10px] text-muted mt-0.5">
            {valuation?.totalUnitsOnHand || 0} Units On Hand
          </p>
        </div>

        <div className="bg-bg-surface p-4 rounded-xl border border-border">
          <p className="text-[11px] font-semibold text-muted uppercase tracking-wider">Out of Stock</p>
          <p className="text-lg font-bold text-red-500 mt-1">
            {medicines.filter((m) => (m.total_stock || 0) === 0).length}
          </p>
          <p className="text-[10px] text-muted mt-0.5">
            {medicines.filter((m) => (m.total_stock || 0) > 0 && (m.total_stock || 0) <= (m.low_stock_threshold || 10)).length} Low Stock
          </p>
        </div>

        <div className="bg-bg-surface p-4 rounded-xl border border-border">
          <p className="text-[11px] font-semibold text-muted uppercase tracking-wider">Active Alerts</p>
          <p className="text-lg font-bold text-warning mt-1">{alerts.length}</p>
          <p className="text-[10px] text-muted mt-0.5">
            {alerts.filter((a) => a.severity === 'CRITICAL').length} Critical Alerts
          </p>
        </div>

        <div className="bg-bg-surface p-4 rounded-xl border border-border">
          <p className="text-[11px] font-semibold text-muted uppercase tracking-wider">Health Score</p>
          <div className="flex items-baseline gap-2 mt-1">
            <span className={`text-lg font-bold ${
              (valuation?.healthScore?.score || 100) >= 75 ? 'text-success' : 'text-warning'
            }`}>
              {valuation?.healthScore?.score || 100}/100
            </span>
            <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-bg-card text-muted">
              {valuation?.healthScore?.rating || 'GOOD'}
            </span>
          </div>
          <p className="text-[10px] text-muted mt-0.5">Audit-grade Index</p>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-bg-surface p-4 rounded-xl border border-border flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 text-muted absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search medicine name, generic name, barcode..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-bg-card border border-border rounded-lg pl-9 pr-3 py-1.5 text-xs text-foreground focus:outline-none focus:border-accent-primary"
          />
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs text-muted">Category:</label>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="bg-bg-card border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground focus:outline-none"
          >
            <option value="ALL">All Categories</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs text-muted">Stock State:</label>
          <select
            value={stockStateFilter}
            onChange={(e) => setStockStateFilter(e.target.value)}
            className="bg-bg-card border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground focus:outline-none"
          >
            <option value="ALL">All States</option>
            <option value="AVAILABLE">Available</option>
            <option value="LOW_STOCK">Low Stock</option>
            <option value="OUT_OF_STOCK">Out of Stock</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs text-muted">ABC Class:</label>
          <select
            value={abcFilter}
            onChange={(e) => setAbcFilter(e.target.value)}
            className="bg-bg-card border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground focus:outline-none"
          >
            <option value="ALL">All ABC</option>
            <option value="A">Class A (Top 70% Value)</option>
            <option value="B">Class B (Next 20% Value)</option>
            <option value="C">Class C (Remaining 10%)</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs text-muted">Velocity:</label>
          <select
            value={movementFilter}
            onChange={(e) => setMovementFilter(e.target.value)}
            className="bg-bg-card border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground focus:outline-none"
          >
            <option value="ALL">All Velocity</option>
            <option value="FAST_MOVING">Fast Moving (&ge;5/day)</option>
            <option value="NORMAL">Normal (1-5/day)</option>
            <option value="SLOW_MOVING">Slow Moving (&lt;1/day)</option>
            <option value="DEAD_STOCK">Dead Stock (&gt;180d)</option>
          </select>
        </div>
      </div>

      {/* High-Density Inventory Table */}
      <div className="bg-bg-surface rounded-xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-foreground">
            <thead className="bg-bg-card border-b border-border text-[11px] font-bold text-muted uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4 w-8"></th>
                <th className="py-3 px-4">Medicine & Generic</th>
                <th className="py-3 px-3">Category</th>
                <th className="py-3 px-3 text-center">ABC</th>
                <th className="py-3 px-3">Velocity</th>
                <th className="py-3 px-3 text-right">Available</th>
                <th className="py-3 px-3 text-right">Avg Daily</th>
                <th className="py-3 px-3 text-right">Days Cover</th>
                <th className="py-3 px-3 text-right">Cost (₹)</th>
                <th className="py-3 px-3 text-right">MRP (₹)</th>
                <th className="py-3 px-4 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredMedicines.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-8 text-center text-muted">
                    No medicines match the selected filter criteria.
                  </td>
                </tr>
              ) : (
                filteredMedicines.map((med) => {
                  const cls = classMap.get(med.id);
                  const isExpanded = expandedMedId === med.id;
                  const totalStock = Number(med.total_stock || 0);
                  const isLow = totalStock > 0 && totalStock <= (med.low_stock_threshold || 10);
                  const isOut = totalStock === 0;

                  return (
                    <React.Fragment key={med.id}>
                      <tr 
                        onClick={() => setExpandedMedId(isExpanded ? null : med.id)}
                        className="hover:bg-bg-card/50 cursor-pointer transition-colors"
                      >
                        <td className="py-3 px-4">
                          {isExpanded ? (
                            <ChevronDown className="w-4 h-4 text-muted" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-muted" />
                          )}
                        </td>
                        <td className="py-3 px-4 font-semibold">
                          <div className="text-foreground">{med.name}</div>
                          <div className="text-[10px] text-muted truncate max-w-[200px]">
                            {med.generic_name || '—'}
                          </div>
                        </td>
                        <td className="py-3 px-3 text-muted">{med.category || 'General'}</td>
                        <td className="py-3 px-3 text-center">
                          <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            cls?.abcClass === 'A' 
                              ? 'bg-purple-500/10 text-purple-400 border border-purple-500/30'
                              : cls?.abcClass === 'B'
                              ? 'bg-blue-500/10 text-blue-400 border border-blue-500/30'
                              : 'bg-zinc-500/10 text-zinc-400 border border-zinc-500/30'
                          }`}>
                            {cls?.abcClass || 'C'}
                          </span>
                        </td>
                        <td className="py-3 px-3">
                          <span className={`text-[10px] font-medium ${
                            cls?.movementClass === 'FAST_MOVING'
                              ? 'text-success font-bold'
                              : cls?.movementClass === 'DEAD_STOCK'
                              ? 'text-red-500 font-bold'
                              : 'text-muted'
                          }`}>
                            {cls?.movementClass?.replace('_', ' ') || 'NORMAL'}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-bold">
                          {totalStock}
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-muted">
                          {cls?.avgDailySales30d ? cls.avgDailySales30d.toFixed(1) : '0.0'}
                        </td>
                        <td className="py-3 px-3 text-right font-mono">
                          <span className={cls?.daysOfCover && cls.daysOfCover < 10 ? 'text-red-400 font-bold' : 'text-foreground'}>
                            {cls?.daysOfCover !== undefined ? (cls.daysOfCover >= 999 ? '999+' : `${cls.daysOfCover}d`) : '—'}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-muted">
                          ₹{Number(med.purchase_price || 0).toFixed(2)}
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-semibold text-foreground">
                          ₹{Number(med.mrp || 0).toFixed(2)}
                        </td>
                        <td className="py-3 px-4 text-center">
                          {isOut ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-500/10 text-red-400 border border-red-500/30">
                              Out of Stock
                            </span>
                          ) : isLow ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30">
                              Low Stock
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-success/10 text-success border border-success/30">
                              In Stock
                            </span>
                          )}
                        </td>
                      </tr>

                      {/* Expanded Batches Breakdown */}
                      {isExpanded && (
                        <tr className="bg-bg-card/30">
                          <td colSpan={11} className="py-3 px-8 border-y border-border/50">
                            <div className="text-[11px] font-bold uppercase tracking-wider text-muted mb-2">
                              Batches Breakdown (FEFO Order):
                            </div>
                            {(!med.medicine_batches || med.medicine_batches.length === 0) ? (
                              <p className="text-xs text-muted italic">No active batches on record for this medicine.</p>
                            ) : (
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                                {med.medicine_batches.map((b: any) => (
                                  <div key={b.id || b._local_id} className="p-2.5 rounded-lg border border-border bg-bg-surface text-xs space-y-1">
                                    <div className="flex justify-between font-bold">
                                      <span className="text-foreground">Batch #{b.batch_number}</span>
                                      <span className="font-mono text-accent-primary">{b.quantity_remaining} units</span>
                                    </div>
                                    <div className="flex justify-between text-[10px] text-muted">
                                      <span>Expiry: {b.expiry_date || 'N/A'}</span>
                                      <span>Cost: ₹{b.purchase_price} | MRP: ₹{b.mrp}</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
