import React, { useState, useEffect, useMemo } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { Biohazard, Trash2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Badge } from '../ui/Badge';
import { Table } from '../ui/Table';
import {
    useInventoryRadar,
    type InventoryAttentionFilter,
    type InventoryViewMode,
    type RadarItem,
} from '../../hooks/useInventoryRadar';
import { canDisposeBatch } from '../../services/inventoryRadarCore';
import { AddBatchModal } from './AddBatchModal';
import { DisposeBatchModal } from './DisposeBatchModal';
import { DeleteMedicineModal } from './DeleteMedicineModal';
import { useAuth } from '../../lib/auth';
import { INVENTORY_PAGE_COPY } from '../../config/appContent';

/**
 * PHASE 12: INVENTORY ATTENTION MODEL
 * Prioritizes: Priority sorting, Visual de-emphasis, Actionable intelligence
 */
const FOCUS_PARAM = 'focus';

function parseInventoryFocus(raw: string | null): InventoryAttentionFilter | null {
    if (raw === 'low_stock' || raw === 'expiring') return raw;
    return null;
}

export const InventoryScreen: React.FC = () => {
    const isOwner = useAuth(state => state.isOwner);
    const queryClient = useQueryClient();
    const location = useLocation();
    const [searchParams, setSearchParams] = useSearchParams();
    const attentionFilter = useMemo(
        () => parseInventoryFocus(searchParams.get(FOCUS_PARAM)),
        [searchParams],
    );

    const [searchTerm, setSearchTerm] = useState('');
    const [viewMode, setViewMode] = useState<InventoryViewMode>('active');
    const { items: processedInventory, disposedItems, stats, isLoading, error, refresh } = useInventoryRadar(
        searchTerm,
        attentionFilter,
        viewMode,
    );
    const [isAddBatchModalOpen, setIsAddBatchModalOpen] = useState(false);
    const [disposeTarget, setDisposeTarget] = useState<RadarItem | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<RadarItem | null>(null);

    // Notifications must reveal their results even from a searched/disposed view.
    useEffect(() => {
        setSearchTerm('');
        setViewMode('active');
        if (attentionFilter) refresh();
    }, [location.key, attentionFilter, refresh]);

    const selectFilter = (filter: InventoryAttentionFilter) => {
        const next = new URLSearchParams(searchParams);
        if (filter === 'all') next.delete(FOCUS_PARAM);
        else next.set(FOCUS_PARAM, filter);
        setSearchParams(next);
    };

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'F6') {
                e.preventDefault();
                e.stopPropagation();
                setIsAddBatchModalOpen(true);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    const formatCurrency = (val: number) =>
        val.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

    const tableData = viewMode === 'active' ? processedInventory : disposedItems;
    const tableHeaders =
        viewMode === 'active' ? [...INVENTORY_PAGE_COPY.headers.slice(0, -1), 'Actions'] : [...INVENTORY_PAGE_COPY.disposedHeaders];
    const lowStockMedicineCount = new Set(processedInventory.map(item => item.productId)).size;

    const subtitle =
        viewMode === 'active'
            ? isLoading
                ? INVENTORY_PAGE_COPY.subtitleScanning
                : attentionFilter === 'low_stock'
                  ? `${lowStockMedicineCount} low-stock medicine${lowStockMedicineCount === 1 ? '' : 's'}`
                  : INVENTORY_PAGE_COPY.subtitleActive(processedInventory.length)
            : isLoading
              ? INVENTORY_PAGE_COPY.subtitleScanning
              : INVENTORY_PAGE_COPY.subtitleDisposed(disposedItems.length);

    return (
        <div className="flex flex-col gap-4 animate-slideIn select-none" data-pos-local-fkeys="true">
            <div className="flex justify-between items-end">
                <div className="space-y-1">
                    <h1 className="text-billing-total font-black text-foreground-strong tracking-tighter uppercase italic leading-none">
                        {INVENTORY_PAGE_COPY.title}
                    </h1>
                    <p className="text-muted text-sm font-black uppercase tracking-widest">{subtitle}</p>
                    {viewMode === 'active' && attentionFilter === 'low_stock' && (
                        <p className="text-xs text-danger font-bold mt-2 flex flex-wrap items-center gap-2">
                            Showing medicines at or below their stock threshold, including out-of-stock medicines.
                            <Link to="/inventory" className="underline hover:text-foreground">
                                Clear filter
                            </Link>
                        </p>
                    )}
                    {viewMode === 'active' && attentionFilter === 'expiring' && (
                        <p className="text-xs text-warning font-bold mt-2 flex flex-wrap items-center gap-2">
                            Showing expiry-related batches (near due or already expired with stock).
                            <Link to="/inventory" className="underline hover:text-foreground">
                                Clear filter
                            </Link>
                        </p>
                    )}
                </div>

                <div className="flex gap-4 items-center">
                    <Input
                        placeholder={INVENTORY_PAGE_COPY.searchPlaceholder}
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        containerClassName="w-full sm:w-72"
                        icon="🔍"
                        className="py-2.5 font-medium"
                    />
                    {viewMode === 'active' && (
                        <Button
                            variant="primary"
                            className="min-h-10 whitespace-nowrap px-4 font-semibold"
                            onClick={() => setIsAddBatchModalOpen(true)}
                        >
                            {INVENTORY_PAGE_COPY.newBatch}
                        </Button>
                    )}
                </div>
            </div>

            {error && <div role="alert" className="rounded-xl border border-danger p-4 text-danger">Inventory could not load. {error} <Button onClick={refresh}>Retry</Button></div>}
            <div className="flex gap-2">
                <button
                    type="button"
                    onClick={() => setViewMode('active')}
                    className={`px-5 py-2.5 rounded-lg font-black uppercase text-xs tracking-widest border-2 transition-all ${
                        viewMode === 'active'
                            ? 'bg-primary text-on-primary border-primary'
                            : 'bg-surface border-border text-muted hover:text-foreground'
                    }`}
                >
                    {INVENTORY_PAGE_COPY.tabActive}
                </button>
                <button
                    type="button"
                    onClick={() => setViewMode('disposed')}
                    className={`px-5 py-2.5 rounded-lg font-black uppercase text-xs tracking-widest border-2 transition-all ${
                        viewMode === 'disposed'
                            ? 'bg-surface-elevated border-danger/40 text-danger'
                            : 'bg-surface border-border text-muted hover:text-foreground'
                    }`}
                >
                    {INVENTORY_PAGE_COPY.tabDisposed}
                </button>
            </div>

            {viewMode === 'active' && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    <MiniStat label={INVENTORY_PAGE_COPY.miniStats.totalAssets} value={stats.totalAssets.toLocaleString()} variant="neutral" onClick={() => selectFilter('all')} selected={!attentionFilter} />
                    <MiniStat
                        label={INVENTORY_PAGE_COPY.miniStats.criticalStock}
                        value={stats.criticalStock.toString()}
                        variant={stats.criticalStock > 0 ? 'danger' : 'neutral'}
                        onClick={() => selectFilter('low_stock')}
                        selected={attentionFilter === 'low_stock'}
                    />
                    <MiniStat
                        label={INVENTORY_PAGE_COPY.miniStats.nearExpiry}
                        value={stats.nearExpiry.toString()}
                        variant={stats.nearExpiry > 0 ? 'warning' : 'neutral'}
                        onClick={() => selectFilter('expiring')}
                        selected={attentionFilter === 'expiring'}
                    />
                    <MiniStat label={INVENTORY_PAGE_COPY.miniStats.netValuation} value={formatCurrency(stats.netValuation)} variant="success" />
                </div>
            )}

            <div className="bg-surface border border-border rounded-xl overflow-hidden">
                <Table
                    headers={tableHeaders}
                    data={isLoading || error ? [] : tableData}
                    isEmpty={isLoading || !!error || tableData.length === 0}
                    emptyMessage={
                        isLoading ? INVENTORY_PAGE_COPY.subtitleScanning
                            : error ? 'Inventory is unavailable. Use Retry to load it again.'
                            : searchTerm.trim()
                            ? INVENTORY_PAGE_COPY.emptySearch
                            : viewMode === 'active'
                              ? attentionFilter === 'low_stock' ? 'No medicines are low on stock.'
                                : attentionFilter === 'expiring' ? 'No batches are expired or nearing expiry.'
                                : INVENTORY_PAGE_COPY.emptyDefault
                              : INVENTORY_PAGE_COPY.emptyDisposed
                    }
                    renderRow={(item) => {
                        if (viewMode === 'disposed') {
                            const row = item as (typeof disposedItems)[0];
                            return (
                                <tr key={row.id} className="border-b-2 border-border opacity-80">
                                    <td className="px-6 py-4 font-black uppercase tracking-tight text-foreground-strong">{row.name}</td>
                                    <td className="px-6 py-4 text-center">
                                        <span className="tabular-nums text-muted font-mono text-xs bg-surface-alt border border-border px-2 py-1 rounded">
                                            {row.batch}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-center font-black tabular-nums text-muted">{row.expiry}</td>
                                    <td className="px-6 py-4 text-center text-sm text-muted">{row.disposedAt}</td>
                                    <td className="px-6 py-4 text-center text-sm text-muted">{row.disposedBy}</td>
                                    <td className="px-6 py-4 text-center">
                                        <Badge variant="neutral">{row.reason}</Badge>
                                    </td>
                                </tr>
                            );
                        }

                        const radar = item as RadarItem;
                        const isHighPriority = radar.priority > 0;
                        const isCritical = radar.status === 'CRITICAL';
                        const disposeEnabled = canDisposeBatch(radar);

                        return (
                            <tr
                                key={radar.id}
                                className={`border-b-2 border-border transition-all duration-300 group
                                    ${isHighPriority ? 'bg-surface-elevated' : 'opacity-60 hover:opacity-100'}
                                    ${isCritical ? 'ring-inset ring-2 ring-danger/20' : ''}
                                `}
                            >
                                <td className="px-6 py-4">
                                    <div className="flex flex-col">
                                        <span
                                            className={`text-item-name font-black uppercase tracking-tight ${isHighPriority ? 'text-foreground-strong' : 'text-muted'}`}
                                        >
                                            {radar.name}
                                        </span>
                                        <span className="text-[10px] font-bold text-muted uppercase tracking-widest">
                                            Master SKU: {radar.productId}
                                        </span>
                                    </div>
                                </td>
                                <td className="px-6 py-4 text-center">
                                    <span className="tabular-nums text-muted font-mono text-xs bg-surface-alt border border-border px-2 py-1 rounded">
                                        {radar.batch}
                                    </span>
                                </td>
                                <td className="px-6 py-4 text-center">
                                    <span className={`text-base font-black tabular-nums ${isCritical ? 'text-danger' : 'text-foreground'}`}>
                                        {radar.expiry}
                                    </span>
                                </td>
                                <td className="px-6 py-4 text-right">
                                    <span className={`text-xl font-black tabular-nums ${isCritical ? 'text-danger' : 'text-foreground-strong'}`}>
                                        {radar.qty}
                                    </span>
                                </td>
                                <td className="px-6 py-4 text-center">
                                    <Badge variant={radar.status === 'NORMAL' ? 'neutral' : radar.status === 'LOW_STOCK' ? 'warning' : 'danger'}>
                                        {!radar.hasBatch ? 'OUT OF STOCK' : radar.expired ? 'EXPIRED' : radar.lowStock ? 'LOW STOCK' : radar.expiring ? 'EXPIRING SOON' : 'NORMAL'}
                                    </Badge>
                                    {radar.lowStock && radar.expiring && <span className="block text-xs text-warning mt-1">{radar.expired ? 'Expired stock' : 'Also nearing expiry'}</span>}
                                </td>
                                <td className="px-4 py-4 text-center">
                                    <div className="flex items-center justify-center gap-2">
                                        <button
                                            type="button"
                                            title={disposeEnabled ? 'Dispose batch' : INVENTORY_PAGE_COPY.disposeDisabledTooltip}
                                            disabled={!disposeEnabled}
                                            onClick={() => setDisposeTarget(radar)}
                                            className={`inline-flex items-center justify-center w-10 h-10 rounded-lg border-2 transition-all ${
                                                disposeEnabled
                                                    ? 'border-danger/40 text-danger hover:bg-danger/10 hover:border-danger'
                                                    : 'border-border text-muted/40 cursor-not-allowed'
                                            }`}
                                            aria-label="Dispose batch"
                                        >
                                            <Biohazard className="w-5 h-5" />
                                        </button>
                                        {isOwner && (
                                            <button
                                                type="button"
                                                title="Delete medicine (3-step confirmation)"
                                                aria-label={`Delete medicine ${radar.name}`}
                                                onClick={() => setDeleteTarget(radar)}
                                                className="inline-flex items-center justify-center gap-1.5 min-h-10 px-3 rounded-lg border-2 border-danger/40 text-danger hover:bg-danger/10 hover:border-danger transition-colors"
                                            >
                                                <Trash2 className="w-4 h-4" aria-hidden />
                                                <span className="text-xs font-semibold">Delete</span>
                                            </button>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        );
                    }}
                />
            </div>

            <AddBatchModal
                isOpen={isAddBatchModalOpen}
                onClose={() => setIsAddBatchModalOpen(false)}
                onSuccess={() => {
                    refresh();
                }}
            />

            <DisposeBatchModal
                batch={disposeTarget}
                isOpen={disposeTarget !== null}
                onClose={() => setDisposeTarget(null)}
                onSuccess={() => {
                    toast.success(INVENTORY_PAGE_COPY.disposeSuccessToast);
                    refresh();
                }}
            />
            {deleteTarget && isOwner && (
                <DeleteMedicineModal
                    key={deleteTarget.productId}
                    medicine={{ id: deleteTarget.productId, name: deleteTarget.name }}
                    onClose={() => setDeleteTarget(null)}
                    onSuccess={() => {
                        toast.success(`${deleteTarget.name} deleted from inventory`);
                        refresh();
                        void queryClient.invalidateQueries({ queryKey: ['billing-product-search'] });
                    }}
                />
            )}
        </div>
    );
};

const MiniStat = ({ label, value, variant, onClick, selected }: { label: string; value: string; variant: 'neutral' | 'danger' | 'warning' | 'success' | 'primary'; onClick?: () => void; selected?: boolean }) => {
    const borders = {
        neutral: 'border-border',
        primary: 'border-primary/20',
        success: 'border-success/30',
        warning: 'border-warning/30',
        danger: 'border-danger/30',
    };

    const text = {
        neutral: 'text-foreground-strong',
        primary: 'text-primary',
        success: 'text-success',
        warning: 'text-warning',
        danger: 'text-danger',
    };

    const Content = onClick ? 'button' : 'div';
    return (
        <Content
            type={onClick ? 'button' : undefined}
            onClick={onClick}
            aria-pressed={onClick ? selected : undefined}
            className={`bg-surface-elevated border-2 ${borders[variant]} p-3 rounded-xl flex flex-col justify-center text-left transition-all hover:brightness-110 ${selected ? 'ring-2 ring-primary/30' : ''}`}
        >
            <span className="text-label font-black uppercase tracking-[0.2em] text-muted mb-1">{label}</span>
            <span className={`text-2xl font-black tabular-nums ${text[variant]}`}>{value}</span>
        </Content>
    );
};
