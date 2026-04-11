import React, { useState } from 'react';

import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Table } from '../ui/Table';
import { useExpiryAlerts, type ExpiryFilter, type ExpiryRow } from '../../hooks/useExpiryAlerts';
import { EXPIRY_ALERTS_SCREEN_COPY } from '../../config/appContent';

export const ExpiryAlertsScreen: React.FC = () => {
    const [filterDays, setFilterDays] = useState<ExpiryFilter>(7);
    const { rows: visibleRows, isLoading, error } = useExpiryAlerts(filterDays);

    return (
        <div className="h-full flex flex-col gap-8 select-none">
            <div className="flex justify-between items-end gap-6 flex-wrap">
                <div className="space-y-1">
                    <h2 className="text-billing-total font-black text-foreground-strong tracking-tighter uppercase italic leading-none">
                        {EXPIRY_ALERTS_SCREEN_COPY.title}
                    </h2>
                    <p className="text-muted text-sm font-black uppercase tracking-widest">{EXPIRY_ALERTS_SCREEN_COPY.subtitle}</p>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                    {EXPIRY_ALERTS_SCREEN_COPY.filterPresets.map(d => (
                        <Button key={d} variant={filterDays === d ? 'primary' : 'secondary'} onClick={() => setFilterDays(d as ExpiryFilter)}>
                            {EXPIRY_ALERTS_SCREEN_COPY.withinDays(d)}
                        </Button>
                    ))}
                </div>
            </div>

            <div className="text-xs font-black uppercase tracking-widest text-muted">{EXPIRY_ALERTS_SCREEN_COPY.hint}</div>

            {error && (
                <div className="bg-danger/10 border-2 border-danger text-danger px-4 py-3 rounded-md font-black uppercase tracking-widest text-xs">
                    {error}
                </div>
            )}

            <div className="flex-1 min-h-0 bg-surface border-2 border-border rounded-xl overflow-hidden flex flex-col">
                <Table
                    headers={['PRODUCT NAME', 'BATCH', 'EXPIRY DATE', 'DAYS LEFT', 'CURRENT STOCK', 'STATUS']}
                    data={visibleRows}
                    isEmpty={!isLoading && visibleRows.length === 0}
                    emptyMessage={isLoading ? "Scanning batches..." : "No expiring batches found in this window."}
                    renderRow={(row: ExpiryRow, index) => {
                        const rowStyle =
                            row.status === 'CRITICAL'
                                ? 'bg-surface-elevated border-l-4 border-danger/40'
                                : 'bg-surface border-l-4 border-warning/30';

                        const textStyle = row.status === 'CRITICAL' ? 'text-foreground-strong' : 'text-foreground';

                        return (
                            <tr key={`${row.batchNumber}-${index}`} className={`border-b-2 border-border ${rowStyle}`}>
                                <td className={`px-6 py-4 font-black uppercase tracking-tight ${textStyle}`}>{row.productName}</td>
                                <td className="px-6 py-4 text-center">
                                    <span className="tabular-nums text-muted font-mono text-xs bg-surface-alt border border-border px-2 py-1 rounded">
                                        {row.batchNumber}
                                    </span>
                                </td>
                                <td className="px-6 py-4 text-center tabular-nums text-foreground font-black">
                                    {row.expiryDate}
                                </td>
                                <td className="px-6 py-4 text-center tabular-nums font-black">
                                    <Badge variant={row.status === 'CRITICAL' ? 'danger' : 'warning'}>{row.daysLeft}</Badge>
                                </td>
                                <td className={`px-6 py-4 text-right font-black tabular-nums ${textStyle}`}>{row.currentStock}</td>
                                <td className="px-6 py-4 text-center">
                                    <Badge variant={row.status === 'CRITICAL' ? 'danger' : 'warning'}>{row.status}</Badge>
                                </td>
                            </tr>
                        );
                    }}
                />
            </div>
        </div>
    );
};
