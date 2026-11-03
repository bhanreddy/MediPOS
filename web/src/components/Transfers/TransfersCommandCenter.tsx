import React, { useState, useEffect } from 'react';
import {
  Truck,
  ArrowRightLeft,
  Layers,
  Zap,
} from 'lucide-react';
import api from '../../lib/api';
import { TransferListView } from './TransferListView';
import { TransferRequestDrawer } from './TransferRequestDrawer';
import { TransferDetailWorkspace } from './TransferDetailWorkspace';
import { CentralReplenishmentView } from './CentralReplenishmentView';
import { WarehouseOperationsView } from '../Warehouse/WarehouseOperationsView';
import { handleWorkspaceTabKeyDown } from '../../utils/workspaceTabs';

export const TransfersCommandCenter: React.FC<{ initialTab?: 'transfers' | 'replenishment' | 'warehouse' }> = ({ initialTab = 'transfers' }) => {
  const [activeTab, setActiveTab] = useState<'transfers' | 'replenishment' | 'warehouse'>(initialTab);
  const [transfers, setTransfers] = useState<any[]>([]);
  const [selectedTransfer, setSelectedTransfer] = useState<any | null>(null);
  const [locations, setLocations] = useState<any[]>([]);
  const [medicines, setMedicines] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>({
    requestedCount: 0,
    approvedCount: 0,
    readyToPickCount: 0,
    inTransitCount: 0,
    varianceCount: 0,
  });

  const [isLoading, setIsLoading] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');

  useEffect(() => {
    loadTransfers();
    loadMetadata();
    loadSummary();
  }, [statusFilter, typeFilter, searchTerm]);

  const loadSummary = async () => {
    try {
      const res = await api.get('/transfers/dashboard/summary');
      setSummary(res.data);
    } catch (err: any) {
      console.error('Failed to load summary KPIs:', err);
    }
  };

  const loadMetadata = async () => {
    try {
      const [locRes, medRes] = await Promise.all([
        api.get('/transfers/locations'),
        api.get('/inventory/medicines', { params: { limit: 500 } }),
      ]);
      setLocations(locRes.data || []);
      setMedicines(medRes.data?.data || []);
    } catch (err: any) {
      console.error('Metadata fetch failed:', err);
    }
  };

  const loadTransfers = async () => {
    try {
      setIsLoading(true);
      const params = new URLSearchParams();
      if (statusFilter) params.append('status', statusFilter);
      if (typeFilter) params.append('transferType', typeFilter);
      if (searchTerm) params.append('search', searchTerm);

      const res = await api.get(`/transfers?${params.toString()}`);
      setTransfers(res.data?.data || []);
    } catch (err: any) {
      console.error('Failed to load transfers:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectTransfer = async (trf: any) => {
    try {
      const res = await api.get(`/transfers/${trf.id}`);
      setSelectedTransfer(res.data);
    } catch (err: any) {
      setSelectedTransfer(trf);
    }
  };

  const handleCreateTransfer = async (data: any) => {
    await api.post('/transfers', data);
    loadTransfers();
    loadSummary();
  };

  const handleApprove = async () => {
    if (!selectedTransfer) return;
    await api.post(`/transfers/${selectedTransfer.id}/approve`);
    const updated = await api.get(`/transfers/${selectedTransfer.id}`);
    setSelectedTransfer(updated.data);
    loadTransfers();
    loadSummary();
  };

  const handleReject = async (reason: string) => {
    if (!selectedTransfer) return;
    await api.post(`/transfers/${selectedTransfer.id}/reject`, { reason });
    const updated = await api.get(`/transfers/${selectedTransfer.id}`);
    setSelectedTransfer(updated.data);
    loadTransfers();
    loadSummary();
  };

  const handleCancel = async (reason: string) => {
    if (!selectedTransfer) return;
    await api.post(`/transfers/${selectedTransfer.id}/cancel`, { reason });
    const updated = await api.get(`/transfers/${selectedTransfer.id}`);
    setSelectedTransfer(updated.data);
    loadTransfers();
    loadSummary();
  };

  const handleDispatch = async (carrier: string, tracking: string) => {
    if (!selectedTransfer) return;
    await api.post(`/transfers/${selectedTransfer.id}/dispatch`, {
      carrierName: carrier,
      trackingReference: tracking,
    });
    const updated = await api.get(`/transfers/${selectedTransfer.id}`);
    setSelectedTransfer(updated.data);
    loadTransfers();
    loadSummary();
  };

  const handleReceive = async (items: any[], condition: string) => {
    if (!selectedTransfer) return;
    await api.post(`/transfers/${selectedTransfer.id}/receive`, {
      items,
      conditionStatus: condition,
    });
    const updated = await api.get(`/transfers/${selectedTransfer.id}`);
    setSelectedTransfer(updated.data);
    loadTransfers();
    loadSummary();
  };

  const handlePack = async (pkgType: string, isColdChain: boolean, items: any[]) => {
    if (!selectedTransfer) return;
    await api.post(`/transfers/${selectedTransfer.id}/pack`, {
      packageType: pkgType,
      isColdChain,
      items,
    });
    const updated = await api.get(`/transfers/${selectedTransfer.id}`);
    setSelectedTransfer(updated.data);
    loadTransfers();
    loadSummary();
  };

  const handleRecordPick = async (allocId: string, qty: number) => {
    if (!selectedTransfer) return;
    await api.post(`/transfers/${selectedTransfer.id}/pick`, {
      allocationId: allocId,
      quantityPicked: qty,
    });
    const updated = await api.get(`/transfers/${selectedTransfer.id}`);
    setSelectedTransfer(updated.data);
  };

  const handleCompletePick = async () => {
    if (!selectedTransfer) return;
    await api.post(`/transfers/${selectedTransfer.id}/complete-pick`);
    const updated = await api.get(`/transfers/${selectedTransfer.id}`);
    setSelectedTransfer(updated.data);
    loadTransfers();
    loadSummary();
  };

  const handleResolveVariance = async (varId: string, resolution: string, notes: string) => {
    await api.post(`/transfers/variances/${varId}/resolve`, { resolution, resolutionNotes: notes });
    if (selectedTransfer) {
      const updated = await api.get(`/transfers/${selectedTransfer.id}`);
      setSelectedTransfer(updated.data);
    }
    loadSummary();
  };

  return (
    <div className="p-4 space-y-4 max-w-7xl mx-auto">
      {/* Top Banner & KPI Stat Row */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-primary/10 text-primary border border-primary/20">
            <ArrowRightLeft className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground-strong">Transfers & replenishment</h1>
            <p className="text-xs text-muted">Track stock movements between stores and warehouses.</p>
          </div>
        </div>

        {/* Global KPI Chips */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-warning/10 border border-warning/20 rounded text-xs">
            <span className="text-warning font-semibold">{summary.requestedCount}</span>
            <span className="text-muted">Requested</span>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-info/10 border border-info/20 rounded text-xs">
            <span className="text-info font-semibold">{summary.readyToPickCount}</span>
            <span className="text-muted">Picking</span>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-primary/10 border border-primary/20 rounded text-xs">
            <span className="text-primary font-semibold">{summary.inTransitCount}</span>
            <span className="text-muted">In Transit</span>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-danger/10 border border-danger/20 rounded text-xs">
            <span className="text-danger font-semibold">{summary.varianceCount}</span>
            <span className="text-muted">Variances</span>
          </div>
        </div>
      </div>

      {/* Main Navigation Tabs */}
      <div className="workspace-tabs" role="tablist" aria-label="Stock movement views" onKeyDown={handleWorkspaceTabKeyDown}>
        <button
          role="tab"
          aria-selected={activeTab === 'transfers'}
          tabIndex={activeTab === 'transfers' ? 0 : -1}
          id="transfers-tab-transfers"
          aria-controls="transfers-panel"
          onClick={() => {
            setSelectedTransfer(null);
            setActiveTab('transfers');
          }}
          className={`flex shrink-0 items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition ${
            activeTab === 'transfers'
              ? 'border-primary/25 text-primary bg-surface-elevated/40'
              : 'border-transparent text-muted hover:text-foreground-strong'
          }`}
        >
          <Truck className="w-4 h-4" />
          Stock Transfers
        </button>

        <button
          role="tab"
          aria-selected={activeTab === 'replenishment'}
          tabIndex={activeTab === 'replenishment' ? 0 : -1}
          id="transfers-tab-replenishment"
          aria-controls="transfers-panel"
          onClick={() => {
            setSelectedTransfer(null);
            setActiveTab('replenishment');
          }}
          className={`flex shrink-0 items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition ${
            activeTab === 'replenishment'
              ? 'border-primary/25 text-primary bg-surface-elevated/40'
              : 'border-transparent text-muted hover:text-foreground-strong'
          }`}
        >
          <Zap className="w-4 h-4" />
          Replenishment
        </button>

        <button
          role="tab"
          aria-selected={activeTab === 'warehouse'}
          tabIndex={activeTab === 'warehouse' ? 0 : -1}
          id="transfers-tab-warehouse"
          aria-controls="transfers-panel"
          onClick={() => {
            setSelectedTransfer(null);
            setActiveTab('warehouse');
          }}
          className={`flex shrink-0 items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition ${
            activeTab === 'warehouse'
              ? 'border-primary/25 text-primary bg-surface-elevated/40'
              : 'border-transparent text-muted hover:text-foreground-strong'
          }`}
        >
          <Layers className="w-4 h-4" />
          Warehouse Operations
        </button>
      </div>

      {/* Body Views */}
      <div id="transfers-panel" role="tabpanel" aria-labelledby={`transfers-tab-${activeTab}`}>
      {activeTab === 'transfers' && (
        <>
          {selectedTransfer ? (
            <TransferDetailWorkspace
              transfer={selectedTransfer}
              onBack={() => setSelectedTransfer(null)}
              onApprove={handleApprove}
              onReject={handleReject}
              onCancel={handleCancel}
              onDispatch={handleDispatch}
              onReceive={handleReceive}
              onPack={handlePack}
              onRecordPick={handleRecordPick}
              onCompletePick={handleCompletePick}
              onResolveVariance={handleResolveVariance}
            />
          ) : (
            <TransferListView
              transfers={transfers}
              isLoading={isLoading}
              onSelectTransfer={handleSelectTransfer}
              onCreateNew={() => setIsCreateOpen(true)}
              onRefresh={loadTransfers}
              searchTerm={searchTerm}
              onSearchChange={setSearchTerm}
              statusFilter={statusFilter}
              onStatusFilterChange={setStatusFilter}
              typeFilter={typeFilter}
              onTypeFilterChange={setTypeFilter}
            />
          )}
        </>
      )}

      {activeTab === 'replenishment' && <CentralReplenishmentView />}
      {activeTab === 'warehouse' && <WarehouseOperationsView />}
      </div>

      {/* Create Transfer Drawer */}
      <TransferRequestDrawer
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onSubmit={handleCreateTransfer}
        locations={locations}
        medicines={medicines}
      />
    </div>
  );
};
