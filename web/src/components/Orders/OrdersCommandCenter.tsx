import React, { useState, useEffect } from 'react';
import api from '../../lib/api';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { OrderDetailWorkspace } from './OrderDetailWorkspace';
import { PickingWorkspace } from './PickingWorkspace';
import { ClickCollectPickupModal } from './ClickCollectPickupModal';
import { AssistedOrderDrawer } from './AssistedOrderDrawer';
import { ClipboardList, Package, Plus, RefreshCw } from 'lucide-react';

export const OrdersCommandCenter: React.FC<{ fulfilment?: string }> = ({ fulfilment = '' }) => {
  const [orders, setOrders] = useState<any[]>([]);
  const [metrics, setMetrics] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [channelFilter, setChannelFilter] = useState('');
  const [fulfilmentFilter, setFulfilmentFilter] = useState(fulfilment);
  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');

  // Active Modals / Drawers
  const [selectedOrderDetailId, setSelectedOrderDetailId] = useState<string | null>(null);
  const [pickingOrderId, setPickingOrderId] = useState<string | null>(null);
  const [isPickingWorkspaceOpen, setIsPickingWorkspaceOpen] = useState(false);
  const [pickupOrderId, setPickupOrderId] = useState<string | null>(null);
  const [isAssistedDrawerOpen, setIsAssistedDrawerOpen] = useState(false);

  const fetchMetrics = async () => {
    try {
      const res = await api.get('/orders/metrics');
      setMetrics(res.data.data);
    } catch (err) {
      console.error('Failed to fetch OMS metrics:', err);
    }
  };

  const fetchOrders = async () => {
    try {
      setLoading(true);
      const params: any = {};
      if (search) params.search = search;
      if (channelFilter) params.channel = channelFilter;
      if (fulfilmentFilter) params.fulfilment_type = fulfilmentFilter;
      if (statusFilter) params.status = statusFilter;
      if (priorityFilter) params.priority = priorityFilter;

      const res = await api.get('/orders', { params });
      setOrders(res.data.data || []);
    } catch (err) {
      console.error('Failed to fetch orders:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMetrics();
    fetchOrders();
  }, [channelFilter, fulfilmentFilter, statusFilter, priorityFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchOrders();
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'CONFIRMED':
      case 'INVENTORY_RESERVED':
        return <Badge variant="primary">{status.replace(/_/g, ' ')}</Badge>;
      case 'PICKING':
      case 'PACKED':
        return <Badge variant="warning">{status}</Badge>;
      case 'READY_FOR_PICKUP':
      case 'READY_FOR_DISPATCH':
        return <Badge variant="success">{status.replace(/_/g, ' ')}</Badge>;
      case 'COMPLETED':
        return <Badge variant="success">COMPLETED</Badge>;
      case 'CANCELLED':
        return <Badge variant="danger">CANCELLED</Badge>;
      case 'PRESCRIPTION_PENDING':
        return <Badge variant="warning">RX PENDING</Badge>;
      default:
        return <Badge variant="neutral">{status}</Badge>;
    }
  };

  return (
    <div className="flex flex-col gap-4 p-6 bg-background text-foreground-strong select-none animate-fadeIn">
      {/* Header & Quick Action Buttons */}
      <div className="flex justify-between items-center flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-3">
            <ClipboardList className="w-6 h-6 text-primary shrink-0" aria-hidden />
            <h1 className="text-xl font-black uppercase tracking-tight text-foreground-strong">
              {fulfilment === 'HOME_DELIVERY' ? 'Delivery orders' : 'Orders'}
            </h1>
          </div>
          <p className="text-xs text-muted mt-1">
            Manage incoming orders, picking, and fulfilment.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="secondary"
            className="text-xs font-bold"
            onClick={() => {
              setPickingOrderId(null);
              setIsPickingWorkspaceOpen(true);
            }}
          >
            <Package size={16} aria-hidden /> Pick queue
          </Button>

          <Button
            variant="primary"
            className="text-xs font-bold"
            onClick={() => setIsAssistedDrawerOpen(true)}
          >
            <Plus size={16} aria-hidden /> New order
          </Button>
        </div>
      </div>

      {/* KPI Metric Chips */}
      {metrics && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
          <div className="bg-surface border border-border p-3 rounded-xl">
            <span className="text-[10px] font-bold text-muted uppercase tracking-wider block">New Orders</span>
            <span className="text-lg font-black font-mono text-foreground-strong mt-0.5 block">{metrics.newOrders}</span>
          </div>
          <div className="bg-surface border border-warning/40 p-3 rounded-xl">
            <span className="text-[10px] font-bold text-warning uppercase tracking-wider block">Rx Pending</span>
            <span className="text-lg font-black font-mono text-warning mt-0.5 block">{metrics.rxPending}</span>
          </div>
          <div className="bg-surface border border-info/40 p-3 rounded-xl">
            <span className="text-[10px] font-bold text-info uppercase tracking-wider block">Awaiting Pick</span>
            <span className="text-lg font-black font-mono text-info mt-0.5 block">{metrics.awaitingPick}</span>
          </div>
          <div className="bg-surface border border-primary/40 p-3 rounded-xl">
            <span className="text-[10px] font-bold text-primary uppercase tracking-wider block">Picking Active</span>
            <span className="text-lg font-black font-mono text-primary mt-0.5 block">{metrics.picking}</span>
          </div>
          <div className="bg-surface border border-violet/40 p-3 rounded-xl">
            <span className="text-[10px] font-bold text-violet uppercase tracking-wider block">Packed & Labeled</span>
            <span className="text-lg font-black font-mono text-violet mt-0.5 block">{metrics.packed}</span>
          </div>
          <div className="bg-surface border border-success/40 p-3 rounded-xl">
            <span className="text-[10px] font-bold text-success uppercase tracking-wider block">Ready for Pickup</span>
            <span className="text-lg font-black font-mono text-success mt-0.5 block">{metrics.readyForPickup}</span>
          </div>
          <div className="bg-surface border border-primary/40 p-3 rounded-xl">
            <span className="text-[10px] font-bold text-success uppercase tracking-wider block">Ready Dispatch</span>
            <span className="text-lg font-black font-mono text-success mt-0.5 block">{metrics.readyForDispatch}</span>
          </div>
          <div className="bg-surface border border-border p-3 rounded-xl">
            <span className="text-[10px] font-bold text-success uppercase tracking-wider block">Completed</span>
            <span className="text-lg font-black font-mono text-success mt-0.5 block">
              ₹{metrics.completedValue?.toFixed(0)} ({metrics.completedToday})
            </span>
          </div>
        </div>
      )}

      {/* Filter Toolbar */}
      <div className="bg-surface border border-border p-4 rounded-xl flex flex-wrap gap-3 items-center justify-between">
        <form onSubmit={handleSearchSubmit} className="flex gap-2 flex-1 min-w-[280px]">
          <input
            type="text"
            placeholder="Search Order #, Customer Name, Phone..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs text-foreground-strong focus:outline-none focus:border-primary"
          />
          <Button variant="secondary" type="submit" className="text-xs">Search</Button>
        </form>

        <div className="flex flex-wrap gap-2 items-center text-xs">
          <select
            value={channelFilter}
            onChange={e => setChannelFilter(e.target.value)}
            className="bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none"
          >
            <option value="">All Channels</option>
            <option value="RETAIL">Retail</option>
            <option value="ECOMMERCE">Ecommerce</option>
            <option value="CALL_CENTER">Call Center</option>
            <option value="PARTNER_APP">Partner App</option>
            <option value="B2B">B2B</option>
          </select>

          <select
            value={fulfilmentFilter}
            onChange={e => setFulfilmentFilter(e.target.value)}
            className="bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none"
          >
            <option value="">All Fulfilment Modes</option>
            <option value="STORE_PICKUP">Store Pickup</option>
            <option value="CLICK_COLLECT">Click & Collect</option>
            <option value="HOME_DELIVERY">Home Delivery</option>
          </select>

          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none"
          >
            <option value="">All Statuses</option>
            <option value="CREATED">Created</option>
            <option value="PRESCRIPTION_PENDING">Rx Pending</option>
            <option value="CONFIRMED">Confirmed</option>
            <option value="INVENTORY_RESERVED">Reserved</option>
            <option value="PICKING">Picking</option>
            <option value="PACKED">Packed</option>
            <option value="READY_FOR_PICKUP">Ready for Pickup</option>
            <option value="READY_FOR_DISPATCH">Ready for Dispatch</option>
            <option value="PARTIALLY_FULFILLED">Partially Fulfilled</option>
            <option value="COMPLETED">Completed</option>
            <option value="CANCELLED">Cancelled</option>
          </select>

          <select
            value={priorityFilter}
            onChange={e => setPriorityFilter(e.target.value)}
            className="bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none"
          >
            <option value="">All Priorities</option>
            <option value="NORMAL">Normal</option>
            <option value="HIGH">High</option>
            <option value="URGENT">Urgent</option>
            <option value="CRITICAL">Critical</option>
          </select>

          <Button
            variant="secondary"
            className="text-xs"
            onClick={() => {
              fetchMetrics();
              fetchOrders();
            }}
          >
            <RefreshCw size={14} aria-hidden /> Refresh
          </Button>
        </div>
      </div>

      {/* Orders Data Table */}
      <div className="flex-1 min-h-0 bg-surface border border-border rounded-xl overflow-hidden shadow-xl flex flex-col">
        <div className="overflow-x-auto flex-1">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-surface-elevated/90 text-muted font-bold uppercase tracking-wider sticky top-0 border-b border-border z-10">
              <tr>
                <th className="p-3">Order #</th>
                <th className="p-3">Placed Time</th>
                <th className="p-3">Customer</th>
                <th className="p-3">Channel</th>
                <th className="p-3">Fulfilment</th>
                <th className="p-3">Assigned Store</th>
                <th className="p-3 text-right">Items / Units</th>
                <th className="p-3 text-right">Order Value</th>
                <th className="p-3 text-center">Rx Status</th>
                <th className="p-3 text-center">Payment</th>
                <th className="p-3 text-center">Status</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border font-medium">
              {loading ? (
                <tr>
                  <td colSpan={12} className="p-8 text-center text-muted">
                    <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                    Loading Orders...
                  </td>
                </tr>
              ) : orders.length === 0 ? (
                <tr>
                  <td colSpan={12} className="p-8 text-center text-muted">
                    No orders match the selected filters.
                  </td>
                </tr>
              ) : (
                orders.map(o => (
                  <tr key={o.id} className="hover:bg-surface-elevated/50 transition">
                    <td className="p-3 font-mono font-bold text-foreground-strong">
                      {o.order_number}
                      {o.priority === 'URGENT' || o.priority === 'CRITICAL' ? (
                        <span className="ml-2 text-[9px] bg-danger/8 text-danger border border-danger/25 px-1 py-0.5 rounded font-sans">
                          {o.priority}
                        </span>
                      ) : null}
                    </td>
                    <td className="p-3 text-muted whitespace-nowrap">
                      {new Date(o.placed_at || o.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="p-3">
                      <strong className="text-foreground-strong block">{o.customer_name || 'Customer'}</strong>
                      <span className="text-[11px] text-muted font-mono">{o.customer_phone || ''}</span>
                    </td>
                    <td className="p-3 text-foreground">
                      <span className="bg-surface-elevated px-2 py-0.5 rounded border border-border text-[10px]">
                        {o.channel}
                      </span>
                    </td>
                    <td className="p-3 text-foreground font-semibold">
                      {o.fulfilment_type.replace(/_/g, ' ')}
                    </td>
                    <td className="p-3 text-foreground">
                      {o.fulfilment_store_name || 'Main Dispensary'}
                    </td>
                    <td className="p-3 text-right font-mono text-foreground">
                      {o.item_count || 1} items ({o.total_units || 1})
                    </td>
                    <td className="p-3 text-right font-mono font-bold text-success">
                      ₹{Number(o.grand_total || 0).toFixed(2)}
                    </td>
                    <td className="p-3 text-center">
                      <Badge variant={o.prescription_status === 'VERIFIED' ? 'success' : (o.prescription_status === 'NOT_REQUIRED' ? 'neutral' : 'warning')}>
                        {o.prescription_status}
                      </Badge>
                    </td>
                    <td className="p-3 text-center">
                      <Badge variant={o.payment_status === 'PAID' ? 'success' : 'neutral'}>
                        {o.payment_status}
                      </Badge>
                    </td>
                    <td className="p-3 text-center">
                      {getStatusBadge(o.status)}
                    </td>
                    <td className="p-3 text-right whitespace-nowrap">
                      <div className="flex justify-end gap-1.5">
                        <button
                          onClick={() => setSelectedOrderDetailId(o.id)}
                          className="px-2.5 py-1 text-[11px] font-bold bg-surface-elevated text-foreground-strong border border-border rounded hover:bg-surface-alt transition"
                        >
                          View
                        </button>
                        {(o.status === 'CONFIRMED' || o.status === 'INVENTORY_RESERVED' || o.status === 'PICKING') && (
                          <button
                            onClick={() => {
                              setPickingOrderId(o.id);
                              setIsPickingWorkspaceOpen(true);
                            }}
                            className="px-2.5 py-1 text-[11px] font-bold bg-info/8 text-info border border-info/60 rounded hover:bg-info/8 transition"
                          >
                            Pick
                          </button>
                        )}
                        {(o.status === 'READY_FOR_PICKUP' || o.status === 'PACKED') && (
                          <button
                            onClick={() => setPickupOrderId(o.id)}
                            className="px-2.5 py-1 text-[11px] font-bold bg-success/8 text-success border border-success/60 rounded hover:bg-success/8 transition"
                          >
                            Pickup
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Order Detail Modal */}
      {selectedOrderDetailId && (
        <OrderDetailWorkspace
          orderId={selectedOrderDetailId}
          onClose={() => setSelectedOrderDetailId(null)}
          onRefresh={() => {
            fetchMetrics();
            fetchOrders();
          }}
          onOpenPicking={id => {
            setPickingOrderId(id);
            setIsPickingWorkspaceOpen(true);
          }}
          onOpenPickup={id => {
            setPickupOrderId(id);
          }}
        />
      )}

      {/* Picking Workspace Modal */}
      {isPickingWorkspaceOpen && (
        <PickingWorkspace
          orderId={pickingOrderId}
          onClose={() => {
            setIsPickingWorkspaceOpen(false);
            setPickingOrderId(null);
          }}
          onRefresh={() => {
            fetchMetrics();
            fetchOrders();
          }}
        />
      )}

      {/* Click & Collect Pickup Modal */}
      {pickupOrderId && (
        <ClickCollectPickupModal
          orderId={pickupOrderId}
          onClose={() => setPickupOrderId(null)}
          onSuccess={() => {
            fetchMetrics();
            fetchOrders();
          }}
        />
      )}

      {/* Assisted Order Drawer */}
      {isAssistedDrawerOpen && (
        <AssistedOrderDrawer
          onClose={() => setIsAssistedDrawerOpen(false)}
          onSuccess={newId => {
            fetchMetrics();
            fetchOrders();
            setSelectedOrderDetailId(newId);
          }}
        />
      )}
    </div>
  );
};
