import React, { useEffect, useMemo, useState } from 'react';
import { db } from '../../db/index';
import type { Supplier, PurchaseOrder, PurchaseOrderLine, Product } from '../../core/types';
import { SupplierService } from '../../services/supplierService';
import { SupplierLedgerService } from '../../services/supplierLedgerService';
import { PurchaseOrderService } from '../../services/purchaseOrderService';
import { PurchaseReturnService } from '../../services/purchaseReturnService';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { Table } from '../ui/Table';
import { Badge } from '../ui/Badge';
import { HydrationService } from '../../state/hydration';
import { SUPPLIERS_SCREEN_COPY } from '../../config/appContent';

type Tab = 'suppliers' | 'po' | 'ledger' | 'returns';

export const SuppliersHubScreen: React.FC = () => {
    const [tab, setTab] = useState<Tab>('suppliers');
    const [suppliers, setSuppliers] = useState<Supplier[]>([]);
    const [pos, setPos] = useState<PurchaseOrder[]>([]);

    const [sName, setSName] = useState('');
    const [sGst, setSGst] = useState('');
    const [sPhone, setSPhone] = useState('');
    const [sAddr, setSAddr] = useState('');
    const [editingSupplierId, setEditingSupplierId] = useState<string | null>(null);

    const [poSupplier, setPoSupplier] = useState('');
    const [poLines, setPoLines] = useState<{ product_id: string; name: string; qty: string }[]>([{ product_id: '', name: '', qty: '1' }]);
    const [products, setProducts] = useState<Product[]>([]);

    const [ledgerSupplier, setLedgerSupplier] = useState('');
    const [ledgerRows, setLedgerRows] = useState<Awaited<ReturnType<typeof SupplierLedgerService.listBySupplier>>>([]);
    const [outstanding, setOutstanding] = useState(0);
    const [payAmount, setPayAmount] = useState('');

    const [retSupplier, setRetSupplier] = useState('');
    const [retBatches, setRetBatches] = useState<{ batchId: string; label: string; max: number; qty: string }[]>([]);
    const [retNote, setRetNote] = useState('');

    const refreshSuppliers = async () => {
        setSuppliers(await SupplierService.getAll());
    };

    useEffect(() => {
        void refreshSuppliers();
        void db.products
            .filter(p => p.is_active)
            .toArray()
            .then(setProducts);
    }, []);

    const supplierOptions = useMemo(
        () => [{ value: '', label: 'Select...' }, ...suppliers.filter(s => s.is_active).map(s => ({ value: s.id, label: s.name }))],
        [suppliers]
    );

    const resetSupplierForm = () => {
        setSName('');
        setSGst('');
        setSPhone('');
        setSAddr('');
        setEditingSupplierId(null);
    };

    const beginEditSupplier = (s: Supplier) => {
        setEditingSupplierId(s.id);
        setSName(s.name);
        setSGst(s.gstin);
        setSPhone(s.phone);
        setSAddr(s.address);
    };

    const saveSupplier = async () => {
        try {
            if (editingSupplierId) {
                await SupplierService.updateSupplier(editingSupplierId, {
                    name: sName.trim(),
                    gstin: sGst.trim(),
                    phone: sPhone.trim(),
                    address: sAddr.trim(),
                });
            } else {
                await SupplierService.addSupplier({
                    name: sName.trim(),
                    gstin: sGst.trim(),
                    phone: sPhone.trim(),
                    address: sAddr.trim(),
                });
            }
            resetSupplierForm();
            await refreshSuppliers();
            await HydrationService.hydrateSuppliers();
        } catch (e: unknown) {
            // eslint-disable-next-line no-alert
            alert(e instanceof Error ? e.message : String(e));
        }
    };

    const loadLedger = async (sid: string) => {
        setLedgerSupplier(sid);
        if (!sid) {
            setLedgerRows([]);
            setOutstanding(0);
            return;
        }
        const rows = await SupplierLedgerService.listBySupplier(sid);
        setLedgerRows(rows);
        setOutstanding(await SupplierLedgerService.outstandingPayable(sid));
    };

    const recordPayment = async () => {
        const amt = parseFloat(payAmount);
        if (!ledgerSupplier || !amt || amt <= 0) return;
        if (amt > outstanding + 0.05) {
            // eslint-disable-next-line no-alert
            alert('Amount exceeds outstanding payable');
            return;
        }
        await SupplierLedgerService.recordPayment(ledgerSupplier, amt, 'Payment to supplier');
        setPayAmount('');
        await loadLedger(ledgerSupplier);
    };

    const createPO = async () => {
        if (!poSupplier) return;
        const lines: PurchaseOrderLine[] = [];
        for (const ln of poLines) {
            const q = parseInt(ln.qty, 10) || 0;
            if (!ln.product_id || q <= 0) continue;
            const p = products.find(x => x.id === ln.product_id);
            lines.push({
                product_id: ln.product_id,
                product_name: p?.name ?? 'Unknown',
                qty_ordered: q,
                qty_received: 0,
            });
        }
        try {
            await PurchaseOrderService.create(poSupplier, lines);
            setPoLines([{ product_id: '', name: '', qty: '1' }]);
            setPos(await PurchaseOrderService.list());
        } catch (e: unknown) {
            // eslint-disable-next-line no-alert
            alert(e instanceof Error ? e.message : String(e));
        }
    };

    useEffect(() => {
        if (tab === 'po') void PurchaseOrderService.list().then(setPos);
    }, [tab]);

    const loadReturnBatches = async (sid: string) => {
        setRetSupplier(sid);
        if (!sid) {
            setRetBatches([]);
            return;
        }
        const purchases = await db.purchases.filter(p => p.supplier_id === sid && p.status === 'COMPLETED').toArray();
        const pids = purchases.map(p => p.id);
        const batches = await db.batches.filter(b => pids.includes(b.purchase_id)).toArray();
        const rows: { batchId: string; label: string; max: number; qty: string }[] = [];
        for (const b of batches) {
            const inv = await db.inventory.where('batch_id').equals(b.id).toArray();
            const onHand = inv.reduce((s, i) => s + i.quantity, 0);
            if (onHand <= 0) continue;
            const prod = await db.products.get(b.product_id);
            rows.push({
                batchId: b.id,
                label: `${prod?.name ?? '?'} • ${b.batch_number} • exp ${b.expiry_date}`,
                max: onHand,
                qty: '0',
            });
        }
        setRetBatches(rows);
    };

    const submitReturn = async () => {
        if (!retSupplier) return;
        const lines = retBatches
            .map(r => ({ batchId: r.batchId, quantity: parseInt(r.qty, 10) || 0 }))
            .filter(r => r.quantity > 0);
        try {
            await PurchaseReturnService.postReturn(retSupplier, lines, retNote);
            setRetNote('');
            await loadReturnBatches(retSupplier);
            await loadLedger(retSupplier);
            // eslint-disable-next-line no-alert
            alert('Return posted');
        } catch (e: unknown) {
            // eslint-disable-next-line no-alert
            alert(e instanceof Error ? e.message : String(e));
        }
    };

    return (
        <div className="h-full flex flex-col gap-6 animate-slideIn select-none">
            <div className="flex justify-between items-end flex-wrap gap-4">
                <div>
                    <h2 className="text-billing-total font-black text-foreground-strong tracking-tighter uppercase italic leading-none">
                        {SUPPLIERS_SCREEN_COPY.title}
                    </h2>
                    <p className="text-muted text-sm font-black uppercase tracking-widest mt-1">{SUPPLIERS_SCREEN_COPY.subtitle}</p>
                </div>
                <div className="flex gap-2 flex-wrap">
                    {(['suppliers', 'po', 'ledger', 'returns'] as Tab[]).map(t => (
                        <Button key={t} variant={tab === t ? 'primary' : 'secondary'} className="font-black uppercase text-xs" onClick={() => setTab(t)}>
                            {t === 'po' ? 'Orders' : t}
                        </Button>
                    ))}
                </div>
            </div>

            {tab === 'suppliers' && (
                <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                    <div className="bg-surface border-2 border-border rounded-xl p-4 space-y-3 xl:col-span-1">
                        <div className="text-heading font-black uppercase">
                            {editingSupplierId ? 'Edit supplier' : 'Add supplier'}
                        </div>
                        <Input label="Name" value={sName} onChange={e => setSName(e.target.value)} />
                        <Input label="GSTIN" value={sGst} onChange={e => setSGst(e.target.value)} />
                        <Input label="Phone" value={sPhone} onChange={e => setSPhone(e.target.value)} />
                        <Input label="Address" value={sAddr} onChange={e => setSAddr(e.target.value)} />
                        <div className="flex gap-2">
                            <Button variant="primary" className="flex-1 font-black" onClick={() => void saveSupplier()}>
                                {editingSupplierId ? 'Update supplier' : 'Save supplier'}
                            </Button>
                            {editingSupplierId && (
                                <Button variant="ghost" className="font-black" onClick={resetSupplierForm}>
                                    Cancel
                                </Button>
                            )}
                        </div>
                    </div>
                    <div className="xl:col-span-2 bg-surface border-2 border-border rounded-xl overflow-hidden">
                        <Table
                            headers={['NAME', 'GSTIN', 'PHONE', 'ACTIVE', 'ACTION']}
                            data={suppliers}
                            renderRow={s => (
                                <tr key={s.id} className="border-b-2 border-border">
                                    <td className="px-4 py-2 font-bold">{s.name}</td>
                                    <td className="px-4 py-2 font-mono text-xs">{s.gstin}</td>
                                    <td className="px-4 py-2">{s.phone}</td>
                                    <td className="px-4 py-2">
                                        <Badge variant={s.is_active ? 'success' : 'neutral'}>{s.is_active ? 'Yes' : 'No'}</Badge>
                                    </td>
                                    <td className="px-4 py-2 flex flex-wrap gap-1">
                                        <Button size="sm" variant="secondary" onClick={() => beginEditSupplier(s)}>
                                            Edit
                                        </Button>
                                        <Button size="sm" variant="ghost" onClick={() => void SupplierService.toggleActive(s.id, !s.is_active).then(refreshSuppliers)}>
                                            Toggle
                                        </Button>
                                    </td>
                                </tr>
                            )}
                        />
                    </div>
                </div>
            )}

            {tab === 'po' && (
                <div className="space-y-6">
                    <div className="bg-surface border-2 border-border rounded-xl p-4 space-y-3">
                        <div className="text-heading font-black uppercase">New purchase order</div>
                        <Select label="Supplier" options={supplierOptions} value={poSupplier} onChange={e => setPoSupplier(e.target.value)} />
                        {poLines.map((ln, i) => (
                            <div key={i} className="grid grid-cols-1 md:grid-cols-3 gap-2 items-end">
                                <Select
                                    label="Product"
                                    options={[
                                        { value: '', label: 'Select...' },
                                        ...products.map(p => ({ value: p.id, label: p.name })),
                                    ]}
                                    value={ln.product_id}
                                    onChange={e => {
                                        const next = [...poLines];
                                        next[i] = { ...next[i], product_id: e.target.value };
                                        setPoLines(next);
                                    }}
                                />
                                <Input
                                    label="Qty"
                                    value={ln.qty}
                                    onChange={e => {
                                        const next = [...poLines];
                                        next[i] = { ...next[i], qty: e.target.value };
                                        setPoLines(next);
                                    }}
                                />
                                <Button
                                    variant="danger"
                                    onClick={() => setPoLines(poLines.filter((_, j) => j !== i))}
                                    disabled={poLines.length < 2}
                                >
                                    Remove
                                </Button>
                            </div>
                        ))}
                        <div className="flex gap-2">
                            <Button variant="secondary" onClick={() => setPoLines([...poLines, { product_id: '', name: '', qty: '1' }])}>
                                + Line
                            </Button>
                            <Button variant="primary" className="font-black" onClick={() => void createPO()}>
                                Create PO
                            </Button>
                        </div>
                    </div>
                    <div className="bg-surface border-2 border-border rounded-xl overflow-hidden">
                        <Table
                            headers={['PO#', 'SUPPLIER', 'DATE', 'STATUS', 'ACTION']}
                            data={pos}
                            renderRow={p => {
                                const sup = suppliers.find(s => s.id === p.supplier_id);
                                return (
                                    <tr key={p.id} className="border-b-2 border-border">
                                        <td className="px-4 py-2 font-mono">{p.po_number}</td>
                                        <td className="px-4 py-2">{sup?.name}</td>
                                        <td className="px-4 py-2">{p.order_date}</td>
                                        <td className="px-4 py-2">
                                            <Badge variant="warning">{p.status}</Badge>
                                        </td>
                                        <td className="px-4 py-2 flex gap-1 flex-wrap">
                                            {(['SENT', 'PARTIAL', 'CLOSED', 'CANCELLED'] as const).map(st => (
                                                <Button key={st} size="sm" variant="ghost" onClick={() => void PurchaseOrderService.updateStatus(p.id, st).then(() => PurchaseOrderService.list().then(setPos))}>
                                                    {st}
                                                </Button>
                                            ))}
                                        </td>
                                    </tr>
                                );
                            }}
                        />
                    </div>
                </div>
            )}

            {tab === 'ledger' && (
                <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                    <div className="space-y-3 bg-surface border-2 border-border rounded-xl p-4">
                        <Select
                            label="Supplier"
                            options={supplierOptions}
                            value={ledgerSupplier}
                            onChange={e => void loadLedger(e.target.value)}
                        />
                        <div className="text-2xl font-black tabular-nums">
                            Outstanding: ₹{outstanding.toFixed(2)}
                        </div>
                        <Input label="Record payment ₹" value={payAmount} onChange={e => setPayAmount(e.target.value)} />
                        <Button variant="primary" className="w-full font-black" onClick={() => void recordPayment()}>
                            Post payment
                        </Button>
                    </div>
                    <div className="xl:col-span-2 bg-surface border-2 border-border rounded-xl overflow-hidden">
                        <Table
                            headers={['DATE', 'TYPE', 'DESCRIPTION', 'DEBIT', 'CREDIT']}
                            data={ledgerRows}
                            isEmpty={ledgerRows.length === 0}
                            emptyMessage="Select a supplier"
                            renderRow={r => (
                                <tr key={r.id} className="border-b-2 border-border">
                                    <td className="px-4 py-2">{r.entry_date}</td>
                                    <td className="px-4 py-2">{r.entry_type}</td>
                                    <td className="px-4 py-2 text-sm">{r.description}</td>
                                    <td className="px-4 py-2 tabular-nums">{r.debit.toFixed(2)}</td>
                                    <td className="px-4 py-2 tabular-nums">{r.credit.toFixed(2)}</td>
                                </tr>
                            )}
                        />
                    </div>
                </div>
            )}

            {tab === 'returns' && (
                <div className="space-y-4">
                    <div className="bg-surface border-2 border-border rounded-xl p-4 space-y-3">
                        <Select
                            label="Supplier"
                            options={supplierOptions}
                            value={retSupplier}
                            onChange={e => void loadReturnBatches(e.target.value)}
                        />
                        <Input label="Reference / note" value={retNote} onChange={e => setRetNote(e.target.value)} />
                        {retBatches.map((r, i) => (
                            <div key={r.batchId} className="flex flex-wrap gap-2 items-center border border-border rounded-lg p-2">
                                <span className="flex-1 text-sm font-bold min-w-[200px]">{r.label}</span>
                                <span className="text-xs text-muted">Max {r.max}</span>
                                <Input
                                    label="Qty to return"
                                    containerClassName="w-32"
                                    value={r.qty}
                                    onChange={e => {
                                        const next = [...retBatches];
                                        next[i] = { ...next[i], qty: e.target.value };
                                        setRetBatches(next);
                                    }}
                                />
                            </div>
                        ))}
                        <Button variant="danger" className="font-black" onClick={() => void submitReturn()}>
                            Post purchase return
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
};
