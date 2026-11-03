import React from 'react';
import {
  ArrowRight,
  Eye,
  Plus,
  RefreshCw,
  Search,
  Filter,
} from 'lucide-react';

export interface TransferListViewProps {
  transfers: any[];
  isLoading: boolean;
  onSelectTransfer: (transfer: any) => void;
  onCreateNew: () => void;
  onRefresh: () => void;
  searchTerm: string;
  onSearchChange: (val: string) => void;
  statusFilter: string;
  onStatusFilterChange: (val: string) => void;
  typeFilter: string;
  onTypeFilterChange: (val: string) => void;
}

export const TransferListView: React.FC<TransferListViewProps> = ({
  transfers,
  isLoading,
  onSelectTransfer,
  onCreateNew,
  onRefresh,
  searchTerm,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  typeFilter,
  onTypeFilterChange,
}) => {
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'DRAFT':
      case 'REQUESTED':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-warning/10 text-warning border border-warning/20">Requested</span>;
      case 'APPROVED':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-success/10 text-success border border-success/20">Approved</span>;
      case 'READY_TO_PICK':
      case 'PICKING':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-info/10 text-info border border-info/20">Picking</span>;
      case 'PICKED':
      case 'PACKED':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-primary/10 text-primary border border-primary/20">Packed</span>;
      case 'DISPATCHED':
      case 'IN_TRANSIT':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-primary/10 text-primary border border-primary/20 animate-pulse">In Transit</span>;
      case 'PARTIALLY_RECEIVED':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-violet/10 text-violet border border-violet/20">Partial</span>;
      case 'RECEIVED':
      case 'CLOSED':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-success/20 text-success border border-success/30">Completed</span>;
      case 'VARIANCE_REVIEW':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-danger/10 text-danger border border-danger/20">Variance</span>;
      case 'CANCELLED':
      case 'REJECTED':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-surface-alt/10 text-muted border border-border/20">Cancelled</span>;
      default:
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-surface-alt text-foreground">{status}</span>;
    }
  };

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case 'CRITICAL':
        return <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-danger/8 text-danger border border-danger/25">CRITICAL</span>;
      case 'URGENT':
        return <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded bg-warning/8 text-warning border border-warning/25">URGENT</span>;
      case 'HIGH':
        return <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded bg-info/8 text-info border border-info/25">HIGH</span>;
      default:
        return <span className="px-1.5 py-0.5 text-[10px] rounded bg-surface-elevated text-muted">NORMAL</span>;
    }
  };

  const formatType = (t: string) => {
    switch (t) {
      case 'STORE_TO_STORE': return 'Store → Store';
      case 'WAREHOUSE_TO_STORE': return 'Warehouse → Store';
      case 'STORE_TO_WAREHOUSE': return 'Store → Warehouse';
      case 'WAREHOUSE_TO_WAREHOUSE': return 'WH → WH';
      case 'RETURN_TO_SOURCE': return 'Return to Source';
      case 'RECALL_TRANSFER': return 'Recall Transfer';
      case 'EMERGENCY_TRANSFER': return 'Emergency';
      case 'REBALANCING': return 'Rebalancing';
      default: return t;
    }
  };

  return (
    <div className="space-y-4">
      {/* Search & Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-surface/60 p-3 rounded-lg border border-border">
        <div className="flex items-center gap-3 flex-1 min-w-[280px]">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-muted absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search transfer #, source, destination..."
              value={searchTerm}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-surface-elevated border border-border rounded text-sm text-foreground-strong placeholder-gray-500 focus:outline-none focus:border-primary/25"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Filter className="w-4 h-4 text-muted" />
            <select
              value={statusFilter}
              onChange={(e) => onStatusFilterChange(e.target.value)}
              className="bg-surface-elevated border border-border text-xs text-foreground rounded px-2.5 py-1.5 focus:outline-none focus:border-primary/25"
            >
              <option value="">All Statuses</option>
              <option value="REQUESTED">Requested</option>
              <option value="APPROVED">Approved</option>
              <option value="READY_TO_PICK">Ready to Pick</option>
              <option value="PICKING">Picking</option>
              <option value="PACKED">Packed</option>
              <option value="DISPATCHED">Dispatched / In Transit</option>
              <option value="PARTIALLY_RECEIVED">Partially Received</option>
              <option value="RECEIVED">Received</option>
              <option value="VARIANCE_REVIEW">Variance Review</option>
              <option value="CLOSED">Closed</option>
            </select>

            <select
              value={typeFilter}
              onChange={(e) => onTypeFilterChange(e.target.value)}
              className="bg-surface-elevated border border-border text-xs text-foreground rounded px-2.5 py-1.5 focus:outline-none focus:border-primary/25"
            >
              <option value="">All Types</option>
              <option value="STORE_TO_STORE">Store to Store</option>
              <option value="WAREHOUSE_TO_STORE">Warehouse to Store</option>
              <option value="STORE_TO_WAREHOUSE">Store to Warehouse</option>
              <option value="RETURN_TO_SOURCE">Return to Source</option>
              <option value="RECALL_TRANSFER">Recall Consolidation</option>
              <option value="EMERGENCY_TRANSFER">Emergency</option>
              <option value="REBALANCING">Rebalancing</option>
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={onRefresh}
            className="p-1.5 bg-surface-elevated hover:bg-surface-alt text-foreground rounded border border-border transition"
            title="Refresh List"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={onCreateNew}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-primary hover:bg-primary text-foreground-strong font-medium text-xs rounded transition shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            New Transfer
          </button>
        </div>
      </div>

      {/* High-Density Transfers Table */}
      <div className="bg-surface border border-border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-foreground">
            <thead className="bg-surface-elevated/80 text-muted uppercase tracking-wider font-semibold border-b border-border">
              <tr>
                <th className="px-3.5 py-2.5">Transfer #</th>
                <th className="px-3.5 py-2.5">Type & Priority</th>
                <th className="px-3.5 py-2.5">Source</th>
                <th className="px-3.5 py-2.5">Destination</th>
                <th className="px-3.5 py-2.5 text-center">Items / Units</th>
                <th className="px-3.5 py-2.5 text-right">Est. Value</th>
                <th className="px-3.5 py-2.5">Status</th>
                <th className="px-3.5 py-2.5">Date</th>
                <th className="px-3.5 py-2.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr>
                  <td colSpan={9} className="text-center py-8 text-muted">
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-primary" />
                    Loading stock transfers...
                  </td>
                </tr>
              ) : transfers.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-8 text-muted">
                    No stock transfers match the selected filters.
                  </td>
                </tr>
              ) : (
                transfers.map((trf) => (
                  <tr
                    key={trf.id}
                    className="hover:bg-surface-elevated/50 cursor-pointer transition"
                    onClick={() => onSelectTransfer(trf)}
                  >
                    <td className="px-3.5 py-2.5 font-mono text-primary font-medium">
                      {trf.transfer_number}
                    </td>
                    <td className="px-3.5 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <span className="text-foreground font-medium">{formatType(trf.transfer_type)}</span>
                        {getPriorityBadge(trf.priority)}
                      </div>
                    </td>
                    <td className="px-3.5 py-2.5 text-foreground-strong">
                      {trf.source_name || trf.source_location_id}
                    </td>
                    <td className="px-3.5 py-2.5 text-foreground-strong">
                      <div className="flex items-center gap-1">
                        <ArrowRight className="w-3 h-3 text-muted" />
                        <span>{trf.destination_name || trf.destination_location_id}</span>
                      </div>
                    </td>
                    <td className="px-3.5 py-2.5 text-center">
                      <span className="font-semibold text-foreground-strong">{trf.total_items}</span> SKUs{' '}
                      <span className="text-muted font-mono">({trf.total_quantity_requested} units)</span>
                    </td>
                    <td className="px-3.5 py-2.5 text-right font-mono text-foreground">
                      ₹{((trf.total_value_paise || 0) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-3.5 py-2.5">{getStatusBadge(trf.status)}</td>
                    <td className="px-3.5 py-2.5 text-muted">
                      {new Date(trf.created_at || trf.requested_at).toLocaleDateString('en-IN', {
                        day: '2-digit',
                        month: 'short',
                      })}
                    </td>
                    <td className="px-3.5 py-2.5 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectTransfer(trf);
                        }}
                        className="p-1 text-muted hover:text-primary transition"
                        title="View Transfer Details"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
