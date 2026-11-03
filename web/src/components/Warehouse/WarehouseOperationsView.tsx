import React, { useState, useEffect } from 'react';
import {
  Layers,
  ShieldAlert,
  Plus,
  RefreshCw,
} from 'lucide-react';
import api from '../../lib/api';

export const WarehouseOperationsView: React.FC = () => {
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState('');
  const [dashboard, setDashboard] = useState<any>(null);
  const [bins, setBins] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'queues' | 'bins' | 'quarantine'>('queues');
  const [isLoading, setIsLoading] = useState(false);
  const [isBinModalOpen, setIsBinModalOpen] = useState(false);

  // New bin form state
  const [binCode, setBinCode] = useState('');
  const [binName, setBinName] = useState('');
  const [zone, setZone] = useState('ZONE-A');
  const [rack, setRack] = useState('R01');
  const [shelf, setShelf] = useState('S01');
  const [binType, setBinType] = useState<'STORAGE' | 'STAGING' | 'PICKING' | 'PACKING' | 'COLD_ROOM' | 'QUARANTINE' | 'RECALL'>('STORAGE');
  const [pickSequence, setPickSequence] = useState(100);

  useEffect(() => {
    loadWarehouses();
  }, []);

  const loadWarehouses = async () => {
    try {
      const res = await api.get('/transfers/locations');
      const whs = (res.data || []).filter((l: any) => l.type === 'WAREHOUSE');
      setWarehouses(whs);
      if (whs.length > 0) {
        setSelectedWarehouseId(whs[0].id);
      }
    } catch (err: any) {
      console.error('Failed to load warehouses:', err);
    }
  };

  useEffect(() => {
    if (selectedWarehouseId) {
      loadDashboard();
      loadBins();
    }
  }, [selectedWarehouseId]);

  const loadDashboard = async () => {
    if (!selectedWarehouseId) return;
    try {
      setIsLoading(true);
      const res = await api.get(`/warehouse/operations/dashboard?warehouseId=${selectedWarehouseId}`);
      setDashboard(res.data);
    } catch (err: any) {
      console.error('Warehouse dashboard load failed:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const loadBins = async () => {
    if (!selectedWarehouseId) return;
    try {
      const res = await api.get(`/warehouse/bins?warehouseId=${selectedWarehouseId}`);
      setBins(res.data || []);
    } catch (err: any) {
      console.error('Bins load failed:', err);
    }
  };

  const handleCreateBin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/warehouse/bins', {
        warehouseId: selectedWarehouseId,
        binCode,
        binName,
        zone,
        rack,
        shelf,
        binType,
        pickSequence: Number(pickSequence),
      });
      alert('Bin created successfully!');
      setIsBinModalOpen(false);
      loadBins();
    } catch (err: any) {
      alert(`Failed to create bin: ${err.message}`);
    }
  };

  return (
    <div className="space-y-4">
      {/* Top Selector Bar */}
      <div className="flex items-center justify-between bg-surface border border-border p-3 rounded-lg">
        <div className="flex items-center gap-3">
          <Layers className="w-5 h-5 text-primary" />
          <div>
            <h2 className="text-sm font-semibold text-foreground-strong">Warehouse Operations & Storage Grid</h2>
            <p className="text-[11px] text-muted">Manage bin routing, pick queues, and quarantine vaults</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-muted font-medium">Active Warehouse:</span>
          <select
            value={selectedWarehouseId}
            onChange={(e) => setSelectedWarehouseId(e.target.value)}
            className="bg-surface-elevated border border-border text-xs text-foreground-strong rounded px-2.5 py-1 focus:outline-none focus:border-primary/25"
          >
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name} ({w.code})
              </option>
            ))}
          </select>
          <button
            onClick={() => {
              loadDashboard();
              loadBins();
            }}
            className="p-1.5 bg-surface-elevated hover:bg-surface-alt text-foreground rounded border border-border transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-5 gap-3">
        <div className="bg-surface border border-border p-3 rounded-lg">
          <span className="text-[11px] text-muted font-medium">Inbound Queue</span>
          <p className="text-xl font-bold text-foreground-strong font-mono mt-1">{dashboard?.inboundQueueCount || 0}</p>
        </div>
        <div className="bg-surface border border-border p-3 rounded-lg">
          <span className="text-[11px] text-info font-medium">Pick Queue</span>
          <p className="text-xl font-bold text-info font-mono mt-1">{dashboard?.pickQueueCount || 0}</p>
        </div>
        <div className="bg-surface border border-border p-3 rounded-lg">
          <span className="text-[11px] text-primary font-medium">Pack Queue</span>
          <p className="text-xl font-bold text-primary font-mono mt-1">{dashboard?.packQueueCount || 0}</p>
        </div>
        <div className="bg-surface border border-border p-3 rounded-lg">
          <span className="text-[11px] text-primary font-medium">Dispatch Queue</span>
          <p className="text-xl font-bold text-primary font-mono mt-1">{dashboard?.dispatchQueueCount || 0}</p>
        </div>
        <div className="bg-surface border border-border p-3 rounded-lg">
          <span className="text-[11px] text-danger font-medium">Quarantine Units</span>
          <p className="text-xl font-bold text-danger font-mono mt-1">
            {(dashboard?.quarantineUnits || 0) + (dashboard?.recalledUnits || 0)}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap border-b border-border bg-surface/40 rounded-t-lg px-2">
        <button
          onClick={() => setActiveTab('queues')}
          className={`px-4 py-2 text-xs font-semibold border-b-2 transition ${
            activeTab === 'queues' ? 'border-primary/25 text-primary' : 'border-transparent text-muted'
          }`}
        >
          Operational Queues
        </button>
        <button
          onClick={() => setActiveTab('bins')}
          className={`px-4 py-2 text-xs font-semibold border-b-2 transition ${
            activeTab === 'bins' ? 'border-primary/25 text-primary' : 'border-transparent text-muted'
          }`}
        >
          Storage Bins & Sequences ({bins.length})
        </button>
        <button
          onClick={() => setActiveTab('quarantine')}
          className={`px-4 py-2 text-xs font-semibold border-b-2 transition ${
            activeTab === 'quarantine' ? 'border-primary/25 text-primary' : 'border-transparent text-muted'
          }`}
        >
          Recall & Quarantine Vault
        </button>
      </div>

      {/* Tab 1: Operational Queues */}
      {activeTab === 'queues' && (
        <div className="grid grid-cols-3 gap-4">
          {/* Pick Queue */}
          <div className="bg-surface border border-border rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold text-info uppercase tracking-wider">Pick Queue</h4>
              <span className="text-[10px] font-mono text-muted">{dashboard?.pickQueue?.length || 0} active</span>
            </div>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {dashboard?.pickQueue?.length === 0 ? (
                <p className="text-xs text-muted py-4 text-center">No transfers awaiting pick</p>
              ) : (
                dashboard?.pickQueue?.map((t: any) => (
                  <div key={t.id} className="p-2.5 bg-background rounded border border-border text-xs space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-primary font-semibold">{t.transfer_number}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-info/10 text-info font-semibold">
                        {t.priority}
                      </span>
                    </div>
                    <p className="text-foreground">To: {t.destination_name}</p>
                    <span className="text-[10px] text-muted font-mono">{t.total_items} items ({t.total_quantity_requested} units)</span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Pack Queue */}
          <div className="bg-surface border border-border rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold text-primary uppercase tracking-wider">Pack Queue</h4>
              <span className="text-[10px] font-mono text-muted">{dashboard?.packQueue?.length || 0} active</span>
            </div>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {dashboard?.packQueue?.length === 0 ? (
                <p className="text-xs text-muted py-4 text-center">No transfers awaiting packing</p>
              ) : (
                dashboard?.packQueue?.map((t: any) => (
                  <div key={t.id} className="p-2.5 bg-background rounded border border-border text-xs space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-primary font-semibold">{t.transfer_number}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-semibold">
                        PICKED
                      </span>
                    </div>
                    <p className="text-foreground">To: {t.destination_name}</p>
                    <span className="text-[10px] text-muted font-mono">{t.total_items} items</span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Dispatch Queue */}
          <div className="bg-surface border border-border rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold text-primary uppercase tracking-wider">Dispatch Queue</h4>
              <span className="text-[10px] font-mono text-muted">{dashboard?.dispatchQueue?.length || 0} active</span>
            </div>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {dashboard?.dispatchQueue?.length === 0 ? (
                <p className="text-xs text-muted py-4 text-center">No packed shipments ready for dispatch</p>
              ) : (
                dashboard?.dispatchQueue?.map((t: any) => (
                  <div key={t.id} className="p-2.5 bg-background rounded border border-border text-xs space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-primary font-semibold">{t.transfer_number}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-semibold">
                        PACKED
                      </span>
                    </div>
                    <p className="text-foreground">To: {t.destination_name}</p>
                    <span className="text-[10px] text-muted font-mono">{t.package_count || 1} packages ready</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Storage Bins */}
      {activeTab === 'bins' && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <button
              onClick={() => setIsBinModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-primary hover:bg-primary text-foreground-strong text-xs font-semibold rounded transition"
            >
              <Plus className="w-3.5 h-3.5" /> Create New Bin
            </button>
          </div>

          <div className="bg-surface border border-border rounded-lg overflow-hidden">
            <table className="w-full text-left text-xs text-foreground">
              <thead className="bg-surface-elevated/80 text-muted uppercase tracking-wider font-semibold border-b border-border">
                <tr>
                  <th className="px-3.5 py-2.5">Bin Code</th>
                  <th className="px-3.5 py-2.5">Bin Name</th>
                  <th className="px-3.5 py-2.5">Zone</th>
                  <th className="px-3.5 py-2.5">Rack & Shelf</th>
                  <th className="px-3.5 py-2.5">Bin Type</th>
                  <th className="px-3.5 py-2.5 text-center">Pick Sequence</th>
                  <th className="px-3.5 py-2.5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {bins.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-8 text-muted">
                      No storage bins configured for this warehouse yet.
                    </td>
                  </tr>
                ) : (
                  bins.map((b) => (
                    <tr key={b.id}>
                      <td className="px-3.5 py-2.5 font-mono text-primary font-bold">{b.bin_code}</td>
                      <td className="px-3.5 py-2.5 text-foreground-strong font-medium">{b.bin_name}</td>
                      <td className="px-3.5 py-2.5 text-muted font-mono">{b.zone || '-'}</td>
                      <td className="px-3.5 py-2.5 text-muted font-mono">{b.rack || '-'} / {b.shelf || '-'}</td>
                      <td className="px-3.5 py-2.5">
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-surface-elevated text-foreground font-mono">
                          {b.bin_type}
                        </span>
                      </td>
                      <td className="px-3.5 py-2.5 text-center font-mono text-foreground-strong">{b.pick_sequence}</td>
                      <td className="px-3.5 py-2.5">
                        <span className="text-success font-medium text-[11px]">Active</span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 3: Quarantine Vault */}
      {activeTab === 'quarantine' && (
        <div className="bg-surface border border-border rounded-lg p-4 space-y-3">
          <div className="flex items-center gap-2 text-danger">
            <ShieldAlert className="w-5 h-5" />
            <h3 className="text-xs font-semibold uppercase tracking-wider">Statutory Recall & Quarantine Vault</h3>
          </div>
          <p className="text-xs text-muted">
            Inventory segregated in the quarantine vault is 100% locked and blocked from POS counter billing, FEFO
            allocation, and standard branch transfers.
          </p>

          <div className="grid grid-cols-3 gap-3 pt-2">
            <div className="bg-background p-3 rounded border border-border">
              <span className="text-xs text-muted">Total Recalled Units:</span>
              <p className="text-lg font-bold text-danger font-mono mt-1">{dashboard?.recalledUnits || 0}</p>
            </div>
            <div className="bg-background p-3 rounded border border-border">
              <span className="text-xs text-muted">Quarantined Inspection Units:</span>
              <p className="text-lg font-bold text-warning font-mono mt-1">{dashboard?.quarantineUnits || 0}</p>
            </div>
            <div className="bg-background p-3 rounded border border-border">
              <span className="text-xs text-muted">Damaged Goods Units:</span>
              <p className="text-lg font-bold text-foreground font-mono mt-1">{dashboard?.damagedUnits || 0}</p>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Create Bin */}
      {isBinModalOpen && (
        <div className="fixed inset-0 z-50 overflow-hidden bg-black/60  flex items-center justify-center p-4">
          <div className="bg-surface border border-border rounded-lg max-w-md w-full p-4 space-y-4 shadow-2xl">
            <h3 className="text-sm font-semibold text-foreground-strong">Create Warehouse Storage Bin</h3>
            <form onSubmit={handleCreateBin} className="space-y-3 text-xs">
              <div>
                <label className="block text-muted mb-1">Bin Code</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. A-01-S02-B10"
                  value={binCode}
                  onChange={(e) => setBinCode(e.target.value)}
                  className="w-full bg-surface-elevated border border-border rounded px-2.5 py-1.5 text-foreground-strong uppercase font-mono"
                />
              </div>
              <div>
                <label className="block text-muted mb-1">Bin Name / Description</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Zone A High Velocity Shelf 2"
                  value={binName}
                  onChange={(e) => setBinName(e.target.value)}
                  className="w-full bg-surface-elevated border border-border rounded px-2.5 py-1.5 text-foreground-strong"
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-muted mb-1">Zone</label>
                  <input
                    type="text"
                    value={zone}
                    onChange={(e) => setZone(e.target.value)}
                    className="w-full bg-surface-elevated border border-border rounded px-2 py-1 text-foreground-strong"
                  />
                </div>
                <div>
                  <label className="block text-muted mb-1">Rack</label>
                  <input
                    type="text"
                    value={rack}
                    onChange={(e) => setRack(e.target.value)}
                    className="w-full bg-surface-elevated border border-border rounded px-2 py-1 text-foreground-strong"
                  />
                </div>
                <div>
                  <label className="block text-muted mb-1">Shelf</label>
                  <input
                    type="text"
                    value={shelf}
                    onChange={(e) => setShelf(e.target.value)}
                    className="w-full bg-surface-elevated border border-border rounded px-2 py-1 text-foreground-strong"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-muted mb-1">Bin Type</label>
                  <select
                    value={binType}
                    onChange={(e) => setBinType(e.target.value as any)}
                    className="w-full bg-surface-elevated border border-border rounded px-2 py-1 text-foreground-strong"
                  >
                    <option value="STORAGE">Storage</option>
                    <option value="PICKING">Fast Picking</option>
                    <option value="STAGING">Inbound Staging</option>
                    <option value="COLD_ROOM">Cold Room</option>
                    <option value="QUARANTINE">Quarantine</option>
                  </select>
                </div>
                <div>
                  <label className="block text-muted mb-1">Pick Sequence (Order)</label>
                  <input
                    type="number"
                    value={pickSequence}
                    onChange={(e) => setPickSequence(Number(e.target.value))}
                    className="w-full bg-surface-elevated border border-border rounded px-2 py-1 text-foreground-strong font-mono"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-border">
                <button
                  type="button"
                  onClick={() => setIsBinModalOpen(false)}
                  className="px-3 py-1.5 bg-surface-elevated text-foreground rounded text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3 py-1.5 bg-primary hover:bg-primary text-foreground-strong font-semibold rounded text-xs"
                >
                  Save Bin
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
