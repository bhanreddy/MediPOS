import React, { useState, useEffect, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Badge } from '../ui/Badge';
import { Table } from '../ui/Table';
import { useInventoryRadar, type InventoryAttentionFilter } from '../../hooks/useInventoryRadar';
import { AddBatchModal } from './AddBatchModal';
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
    const [searchParams] = useSearchParams();
    const attentionFilter = useMemo(
        () => parseInventoryFocus(searchParams.get(FOCUS_PARAM)),
        [searchParams],
    );

    const [searchTerm, setSearchTerm] = useState('');
    const { items: processedInventory, stats, isLoading, refresh } = useInventoryRadar(searchTerm, attentionFilter);
    const [isAddBatchModalOpen, setIsAddBatchModalOpen] = useState(false);

    // Local Shortcuts
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

    return (
        <div className="h-full flex flex-col gap-8 animate-slideIn select-none" data-pos-local-fkeys="true">
            {/* COCKPIT HEADER */}
            <div className="flex justify-between items-end">
                <div className="space-y-1">
                    <h2 className="text-billing-total font-black text-foreground-strong tracking-tighter uppercase italic leading-none">
                        {INVENTORY_PAGE_COPY.title}
                    </h2>
                    <p className="text-muted text-sm font-black uppercase tracking-widest">
                        {isLoading ? INVENTORY_PAGE_COPY.subtitleScanning : INVENTORY_PAGE_COPY.subtitleActive(processedInventory.length)}
                    </p>
                    {attentionFilter === 'low_stock' && (
                        <p className="text-xs text-danger font-bold mt-2 flex flex-wrap items-center gap-2">
                            Showing low-stock batches only.
                            <Link to="/inventory" className="underline hover:text-foreground">
                                Clear filter
                            </Link>
                        </p>
                    )}
                    {attentionFilter === 'expiring' && (
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
                        containerClassName="w-96"
                        icon="🔍"
                        className="py-4 font-bold"
                    />
                    <Button
                        variant="primary"
                        className="h-[60px] whitespace-nowrap px-8 font-black"
                        onClick={() => setIsAddBatchModalOpen(true)}
                    >
                        {INVENTORY_PAGE_COPY.newBatch}
                    </Button>
                </div>
            </div>

            {/* RADAR STATS */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <MiniStat label={INVENTORY_PAGE_COPY.miniStats.totalAssets} value={stats.totalAssets.toLocaleString()} variant="neutral" />
                <MiniStat
                    label={INVENTORY_PAGE_COPY.miniStats.criticalStock}
                    value={stats.criticalStock.toString()}
                    variant={stats.criticalStock > 0 ? 'danger' : 'neutral'}
                />
                <MiniStat
                    label={INVENTORY_PAGE_COPY.miniStats.nearExpiry}
                    value={stats.nearExpiry.toString()}
                    variant={stats.nearExpiry > 0 ? 'warning' : 'neutral'}
                />
                <MiniStat label={INVENTORY_PAGE_COPY.miniStats.netValuation} value={formatCurrency(stats.netValuation)} variant="success" />
            </div>

            {/* THE RADAR FEED: Sorted by Attention Priority */}
            <div className="flex-1 min-h-0 bg-surface border-2 border-border rounded-xl overflow-hidden flex flex-col shadow-2xl">
                <Table
                    headers={[...INVENTORY_PAGE_COPY.headers]}
                    data={processedInventory}
                    isEmpty={processedInventory.length === 0}
                    emptyMessage={searchTerm ? INVENTORY_PAGE_COPY.emptySearch : INVENTORY_PAGE_COPY.emptyDefault}
                    renderRow={(item) => {
                        const isHighPriority = item.priority > 0;
                        const isCritical = item.status === 'CRITICAL';

                        return (
                            <tr
                                key={item.id}
                                className={`border-b-2 border-border transition-all duration-300 group
                                    ${isHighPriority ? 'bg-surface-elevated' : 'opacity-60 hover:opacity-100'}
                                    ${isCritical ? 'ring-inset ring-2 ring-danger/20' : ''}
                                `}
                            >
                                <td className="px-6 py-4">
                                    <div className="flex flex-col">
                                        <span className={`text-item-name font-black uppercase tracking-tight ${isHighPriority ? 'text-foreground-strong' : 'text-muted'}`}>
                                            {item.name}
                                        </span>
                                        <span className="text-[10px] font-bold text-muted uppercase tracking-widest">Master SKU: {item.productId}</span>
                                    </div>
                                </td>
                                <td className="px-6 py-4 text-center">
                                    <span className="tabular-nums text-muted font-mono text-xs bg-surface-alt border border-border px-2 py-1 rounded">{item.batch}</span>
                                </td>
                                <td className="px-6 py-4 text-center">
                                    <span className={`text-base font-black tabular-nums ${isCritical ? 'text-danger' : 'text-foreground'}`}>
                                        {item.expiry}
                                    </span>
                                </td>
                                <td className="px-6 py-4 text-right">
                                    <span className={`text-xl font-black tabular-nums ${isCritical ? 'text-danger' : 'text-foreground-strong'}`}>
                                        {item.qty}
                                    </span>
                                </td>
                                <td className="px-6 py-4 text-center">
                                    <Badge variant={item.status === 'NORMAL' ? 'neutral' : item.status === 'LOW_STOCK' ? 'warning' : 'danger'}>
                                        {item.status.replace('_', ' ')}
                                    </Badge>
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
        </div>
    );
};

const MiniStat = ({ label, value, variant }: { label: string, value: string, variant: 'neutral' | 'danger' | 'warning' | 'success' | 'primary' }) => {
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

    return (
        <div className={`bg-surface-elevated border-2 ${borders[variant]} p-5 rounded-xl flex flex-col justify-center items-center text-center transition-all hover:brightness-110`}>
            <span className="text-label font-black uppercase tracking-[0.2em] text-muted mb-2">{label}</span>
            <span className={`text-3xl font-black tabular-nums ${text[variant]}`}>{value}</span>
        </div>
    );
};
