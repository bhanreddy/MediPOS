import React, { useState, useEffect } from 'react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Table } from '../ui/Table';
import { Badge } from '../ui/Badge';
import { Select } from '../ui/Select';
import { usePurchaseFlow } from '../../hooks/usePurchaseFlow';
import { PurchaseItemModal } from './PurchaseItemModal';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';
import { db } from '../../db/index';
import { PURCHASE_SCREEN_COPY } from '../../config/appContent';

/**
 * PHASE 12: PURCHASE WORKFLOW SAFETY
 * Prioritizes: Transactional safety, Deliberate commit, Data identity
 */
export const PurchaseScreen: React.FC = () => {
    const {
        vendorId, setVendorId,
        invoiceNumber, setInvoiceNumber,
        inwardDate, setInwardDate,
        items,
        addItem, removeItem,
        commitToLedger,
        isCommitting,
        error,
        isDraft,
        resetDraft
    } = usePurchaseFlow();

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [vendors, setVendors] = useState<{ value: string, label: string }[]>([]);

    // Fetch Vendors
    useEffect(() => {
        db.suppliers.where('is_active').equals(true as any).toArray().then(suppliers => {
            setVendors(suppliers.map(s => ({ value: s.id, label: s.name })));
        });
    }, []);

    // Keyboard Shortcuts
    useKeyboardShortcuts({
        'F4': () => document.getElementById('vendor-select')?.focus(),
        'F6': () => (!isDraft ? null : setIsModalOpen(true)),
        'F12': () => isDraft ? commitToLedger() : null,
    });

    return (
        <div className="h-full flex flex-col gap-6 animate-slideIn select-none" data-pos-local-fkeys="true">
            {/* HEADER: TRANSACTION IDENTITY */}
            <div className="flex justify-between items-end">
                <div className="space-y-1">
                    <h2 className="text-billing-total font-black text-foreground-strong tracking-tighter uppercase italic leading-none">
                        {PURCHASE_SCREEN_COPY.title}
                    </h2>
                    <p className="text-muted text-sm font-black uppercase tracking-widest">{PURCHASE_SCREEN_COPY.subtitle}</p>
                </div>
                <div className="flex gap-4">
                    <Badge variant={!isDraft ? 'success' : 'warning'}>
                        {!isDraft ? PURCHASE_SCREEN_COPY.committedBadge : PURCHASE_SCREEN_COPY.draftBadge}
                    </Badge>
                </div>
            </div>

            {/* IDENTITY ZONE: HEADER METADATA */}
            <div className={`p-8 rounded-xl border-2 transition-all duration-500
                ${!isDraft ? 'bg-surface opacity-50 border-border' : 'bg-surface-elevated border-primary/20 shadow-2xl'}
            `}>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    <Select
                        id="vendor-select"
                        label="Supplier / Master Vendor (F4)"
                        options={[{ value: '', label: 'Select Vendor...' }, ...vendors]}
                        value={vendorId}
                        onChange={e => setVendorId(e.target.value)}
                        disabled={!isDraft}
                    />
                    <Input
                        label="Invoice Reference #"
                        placeholder="#INV-0000"
                        icon="📄"
                        value={invoiceNumber}
                        onChange={e => setInvoiceNumber(e.target.value)}
                        disabled={!isDraft}
                    />
                    <Input
                        label="Inward Date"
                        type="date"
                        icon="📅"
                        value={inwardDate}
                        onChange={e => setInwardDate(e.target.value)}
                        disabled={!isDraft}
                    />
                </div>
            </div>

            {/* CONTENT ZONE: LINE ITEMS */}
            <div className={`flex-1 min-h-0 border-2 rounded-xl overflow-hidden flex flex-col transition-all duration-500
                ${!isDraft ? 'bg-surface border-border' : 'bg-surface border-border shadow-inner'}
            `}>
                <Table
                    headers={['ITEM_NAME', 'BATCH', 'EXPIRY', 'QTY', 'COST', 'MRP', 'TOTAL', 'ACTION']}
                    data={items}
                    renderRow={(item) => (
                        <tr key={item.id} className="border-b border-border hover:bg-surface-elevated">
                            <td className="px-6 py-4 font-bold">{item.product.name}</td>
                            <td className="px-6 py-4 font-mono text-sm">{item.batchNumber}</td>
                            <td className="px-6 py-4 font-mono text-sm">{item.expiryDate}</td>
                            <td className="px-6 py-4 font-bold text-primary">{item.quantity}</td>
                            <td className="px-6 py-4 tabular-nums">₹{item.costPrice.toFixed(2)}</td>
                            <td className="px-6 py-4 tabular-nums">₹{item.mrp.toFixed(2)}</td>
                            <td className="px-6 py-4 font-black tabular-nums">₹{item.total.toFixed(2)}</td>
                            <td className="px-6 py-4 text-center">
                                {isDraft && (
                                    <button
                                        onClick={() => removeItem(item.id)}
                                        className="text-danger hover:bg-danger/10 p-1 rounded transition-colors"
                                        title="Remove Item"
                                    >
                                        🗑️
                                    </button>
                                )}
                            </td>
                        </tr>
                    )}
                />
                {isDraft && items.length === 0 && (
                    <div className="flex-1 flex flex-col items-center justify-center text-muted gap-4 opacity-40">
                        <span className="text-8xl">📥</span>
                        <div className="text-center">
                            <p className="text-heading font-black uppercase tracking-tighter text-foreground-strong">Entry Matrix Ready</p>
                            <p className="text-label font-bold text-muted uppercase tracking-widest mt-1">Press F6 to mount item to invoice buffer</p>
                        </div>
                    </div>
                )}
            </div>

            {/* COMMIT ZONE: THE SAFETY GUARD */}
            <div className="bg-surface-elevated border-2 border-border p-6 rounded-xl flex items-center justify-between shadow-xl">
                <div className="flex flex-col">
                    <span className="text-label font-black text-muted uppercase tracking-widest">Total Invoice Value</span>
                    <span className="text-3xl font-black text-foreground-strong tabular-nums">
                        ₹{items.reduce((sum, i) => sum + i.total, 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </span>
                    {error && <span className="text-danger text-xs font-bold uppercase mt-1 animate-pulse">{error}</span>}
                </div>

                <div className="flex gap-4">
                    <Button variant="ghost" className="font-black" onClick={resetDraft}>RESET ENTRY</Button>
                    <Button
                        variant={!isDraft ? "secondary" : "primary"}
                        className={`h-16 px-12 font-black transition-all
                            ${isDraft ? 'shadow-lg hover:scale-105' : 'opacity-50'}
                        `}
                        onClick={commitToLedger}
                        disabled={!isDraft || isCommitting}
                        isLoading={isCommitting}
                    >
                        {!isDraft ? "TRANSACTION FINALIZED" : "COMMIT TO LEDGER (F12)"}
                    </Button>
                </div>
            </div>

            <PurchaseItemModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onAdd={addItem}
            />
        </div>
    );
};
