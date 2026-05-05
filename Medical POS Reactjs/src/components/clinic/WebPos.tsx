import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useSelector } from 'react-redux';
import { useAuth } from '../../lib/auth';
import { Card } from '../ui/Card.tsx';
import { Button } from '../ui/Button';
import { Search, X, UserPlus, ShoppingCart } from 'lucide-react';
import { usePosStore } from '../../store/posStore';
import toast from 'react-hot-toast';
import { useProductSearch, type SearchResult } from '../../hooks/useProductSearch';
import { BillingSearchDropdown } from '../Billing/BillingSearchDropdown';
import { db } from '../../db/index';
import { BillingService } from '../../services/billingService';
import { PrinterService } from '../../services/printerService';
import { InsufficientStockError } from '../../services/inventoryService';
import type { RootState } from '../../state/store';
import type { PaymentMode } from '../../core/types';
import { triggerWebSync } from '../../db/webSyncEngine';

function mapPosPaymentToService(mode: string): PaymentMode {
    switch (mode) {
        case 'cash':
            return 'CASH';
        case 'upi':
            return 'UPI';
        case 'card':
            return 'CARD';
        case 'credit':
            return 'DUE';
        default:
            return 'CASH';
    }
}

export const WebPos = () => {
    const store = usePosStore();
    const searchInputRef = useRef<HTMLInputElement>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [isCommitting, setIsCommitting] = useState(false);

    /** Redux user = offline/local login; Zustand useAuth = Supabase clinic login (often only one is set). */
    const reduxUser = useSelector((s: RootState) => s.auth.user);
    const clinicUser = useAuth(s => s.user);
    const cashierId = reduxUser?.id ?? clinicUser?.id ?? null;

    /** Same IndexedDB catalogue + stock as Inventory / legacy billing — not the API SQLite DB. */
    const { results, isSearching } = useProductSearch(searchTerm);

    useEffect(() => {
        setSelectedIndex(0);
    }, [results]);

    const handleConfirmRef = useRef<() => void>(() => {});

    const calculation = useMemo(() => {
        let subtotal = 0;
        let cgst = 0;
        let sgst = 0;

        store.cart.forEach(item => {
            const itemTotal = item.quantity * item.mrp;
            const itemCgst = itemTotal * (item.gst_rate / 2 / 100);
            const itemSgst = itemTotal * (item.gst_rate / 2 / 100);
            subtotal += itemTotal;
            cgst += itemCgst;
            sgst += itemSgst;
        });

        let billDiscountAmt = 0;
        if (store.is_percentage_discount) {
            billDiscountAmt = subtotal * ((parseFloat(store.bill_discount) || 0) / 100);
        } else {
            billDiscountAmt = parseFloat(store.bill_discount) || 0;
        }

        const net_amount = subtotal - billDiscountAmt;
        const paidAmountVal = store.paid_amount === '' ? net_amount : parseFloat(store.paid_amount) || 0;
        const balance_due = Math.max(0, net_amount - paidAmountVal);

        return { subtotal, cgst, sgst, billDiscountAmt, net_amount, paidAmountVal, balance_due };
    }, [store.cart, store.bill_discount, store.is_percentage_discount, store.paid_amount]);

    const handleConfirm = useCallback(async () => {
        if (!cashierId) {
            toast.error('Sign in to complete a sale');
            return;
        }
        if (store.cart.length === 0) {
            toast.error('Cart is empty');
            return;
        }
        if (calculation.balance_due > 0 && store.payment_mode !== 'credit') {
            toast.error('Balance due > 0 but payment mode is not "credit"');
            return;
        }

        setIsCommitting(true);
        try {
            const sub = calculation.subtotal;
            let lineDiscountPct = 0;
            if (sub > 0) {
                if (store.is_percentage_discount) {
                    lineDiscountPct = parseFloat(store.bill_discount) || 0;
                } else {
                    const flat = parseFloat(store.bill_discount) || 0;
                    lineDiscountPct = (flat / sub) * 100;
                }
            }

            const serviceCart = await Promise.all(
                store.cart.map(async c => {
                    const product = await db.products.get(c.medicine_id);
                    if (!product) throw new Error(`Product missing: ${c.medicine_name}`);
                    return {
                        product,
                        quantity: c.quantity,
                        discountPercent: lineDiscountPct,
                        batchId: c.batch_id,
                        sellingPrice: c.mrp,
                    };
                }),
            );

            const sale = await BillingService.finalizeSale(
                serviceCart,
                store.customer_id || undefined,
                cashierId,
                mapPosPaymentToService(store.payment_mode),
                { supplyType: 'INTRA' },
            );

            const items = await db.sale_items.where('sale_id').equals(sale.id).toArray();
            await PrinterService.printBill(sale, items);

            toast.success('Sale confirmed!');
            store.reset();
            searchInputRef.current?.focus();

            // Trigger sync immediately to hit the backend FIFO and pull updated inventory
            triggerWebSync().catch(e => console.error('[WebPos] Auto-sync failed:', e));
        } catch (e: unknown) {
            if (e instanceof InsufficientStockError) {
                toast.error(
                    `Insufficient stock for ${e.productName ?? 'item'}: need ${e.requested}, have ${e.available}`,
                );
            } else {
                toast.error(e instanceof Error ? e.message : 'Sale failed');
            }
        } finally {
            setIsCommitting(false);
        }
    }, [cashierId, store, calculation.balance_due, calculation.subtotal]);

    handleConfirmRef.current = () => {
        void handleConfirm();
    };

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.ctrlKey && e.key === 'Enter') {
                e.preventDefault();
                handleConfirmRef.current();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    const addSearchResultToCart = async (result: SearchResult) => {
        if (result.totalStock <= 0) {
            toast.error('No stock available');
            return;
        }
        if (!result.bestBatchId) {
            toast.error('No sellable batch');
            return;
        }

        const batch = await db.batches.get(result.bestBatchId);
        if (!batch) {
            toast.error('Batch not found');
            return;
        }

        const product = await db.products.get(result.product.id);
        if (!product) {
            toast.error('Product not found');
            return;
        }

        const invRows = await db.inventory.where('batch_id').equals(batch.id).toArray();
        const maxStock = invRows.reduce((s, r) => s + r.quantity, 0);
        const price = batch.sales_rate || batch.mrp;

        store.addItem({
            medicine_id: product.id,
            medicine_name: product.name,
            batch_id: batch.id,
            batch_number: batch.batch_number,
            expiry_date: batch.expiry_date,
            quantity: 1,
            mrp: price,
            purchase_price: batch.purchase_rate,
            max_stock: maxStock,
            gst_rate: product.gst_rate,
            discount_pct: 0,
        });
        setSearchTerm('');
        searchInputRef.current?.focus();
    };

    const handleSearchKeyDown = (e: React.KeyboardEvent) => {
        if (results.length > 0) {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSelectedIndex(idx => Math.min(idx + 1, results.length - 1));
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSelectedIndex(idx => Math.max(idx - 1, 0));
            } else if (e.key === 'Enter') {
                e.preventDefault();
                const selected = results[selectedIndex];
                if (selected) void addSearchResultToCart(selected);
            } else if (e.key === 'Escape') {
                e.preventDefault();
                setSearchTerm('');
            }
        }
    };

    const showSearchPanel = searchTerm.trim().length >= 2;

    return (
        <div className="flex h-full p-6 gap-6 max-w-[1600px] mx-auto overflow-hidden">
            <div className="flex flex-col flex-[3] gap-4 h-full">
                <div className="relative z-50 isolate">
                    <Search className="absolute left-4 top-3.5 h-5 w-5 text-muted pointer-events-none z-10" />
                    <input
                        ref={searchInputRef}
                        type="text"
                        autoFocus
                        placeholder="Search medicines... (Press Enter to add first)"
                        className="w-full bg-surface border-2 border-border focus:border-primary rounded-xl pl-12 pr-4 py-3 text-lg outline-none font-medium text-foreground shadow-sm transition-all relative z-0"
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        onKeyDown={handleSearchKeyDown}
                        autoComplete="off"
                    />

                    {showSearchPanel && (
                        <>
                            <BillingSearchDropdown
                                results={results}
                                selectedIndex={selectedIndex}
                                onSelect={res => void addSearchResultToCart(res)}
                                isSearching={isSearching}
                            />
                            {!isSearching && results.length === 0 && (
                                <div
                                    className="absolute top-full left-0 right-0 mt-2 z-[100] max-h-80 overflow-y-auto rounded-xl border border-border bg-surface text-foreground shadow-2xl ring-1 ring-border/60"
                                    role="status"
                                >
                                    <div className="p-4 text-center text-sm text-muted">
                                        No medicines match &ldquo;{searchTerm.trim()}&rdquo;. Add inventory or try
                                        another name.
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>

                <Card className="relative z-0 flex-1 flex flex-col overflow-hidden border-2 border-border bg-surface">
                    <div className="flex-1 overflow-y-auto">
                        <table className="w-full text-left border-collapse">
                            <thead className="bg-surface-elevated sticky top-0 z-[1] shadow-sm">
                                <tr>
                                    <th className="p-3 text-sm font-bold text-muted border-b border-border">Medicine</th>
                                    <th className="p-3 text-sm font-bold text-muted border-b border-border w-24">Batch</th>
                                    <th className="p-3 text-sm font-bold text-muted border-b border-border w-24">Expiry</th>
                                    <th className="p-3 text-sm font-bold text-muted border-b border-border w-28">Qty</th>
                                    <th className="p-3 text-sm font-bold text-muted border-b border-border w-24">MRP</th>
                                    <th className="p-3 text-sm font-bold text-muted border-b border-border w-32 border-r">
                                        Total
                                    </th>
                                    <th className="p-3 text-sm font-bold text-muted border-b border-border w-12 text-center"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {store.cart.map(item => (
                                    <tr
                                        key={item.batch_id}
                                        className="border-b border-border/50 hover:bg-surface-elevated/80 transition-colors"
                                    >
                                        <td className="p-3">
                                            <p className="font-bold">{item.medicine_name}</p>
                                        </td>
                                        <td className="p-3 text-sm font-mono text-muted">{item.batch_number}</td>
                                        <td className="p-3 text-sm font-mono text-muted">
                                            {item.expiry_date.substring(0, 7)}
                                        </td>
                                        <td className="p-3">
                                            <input
                                                type="number"
                                                min={1}
                                                max={item.max_stock}
                                                value={item.quantity}
                                                onChange={e => {
                                                    const val = parseInt(e.target.value, 10) || 1;
                                                    store.updateQuantity(item.batch_id, Math.min(val, item.max_stock));
                                                }}
                                                className={`w-16 bg-surface-elevated border ${
                                                    item.quantity >= item.max_stock
                                                        ? 'border-warning/50 focus:border-warning'
                                                        : 'border-border focus:border-primary'
                                                } rounded p-1 text-center font-bold outline-none`}
                                            />
                                            {item.quantity >= item.max_stock && (
                                                <p className="text-[10px] text-warning mt-1 absolute">
                                                    Max: {item.max_stock}
                                                </p>
                                            )}
                                        </td>
                                        <td className="p-3 font-semibold text-muted">₹{item.mrp.toFixed(2)}</td>
                                        <td className="p-3 font-black text-lg border-r border-border">
                                            ₹{(item.quantity * item.mrp).toFixed(2)}
                                        </td>
                                        <td className="p-3 text-center">
                                            <button
                                                type="button"
                                                onClick={() => store.removeItem(item.batch_id)}
                                                className="text-muted hover:text-danger p-1 rounded hover:bg-danger/10 transition-colors"
                                            >
                                                <X className="w-5 h-5" />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                                {store.cart.length === 0 && (
                                    <tr>
                                        <td colSpan={7} className="h-48 text-center text-muted">
                                            <div className="flex flex-col items-center justify-center space-y-2 opacity-50">
                                                <ShoppingCart className="w-8 h-8" />
                                                <p>Scan barcode or search to add medicines</p>
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </Card>
            </div>

            <div className="flex flex-col flex-[2] max-w-sm gap-4 h-full">
                <Card className="p-5 flex flex-col gap-4 border-2 border-border bg-surface">
                    <div className="flex justify-between items-center bg-surface-elevated p-2 border border-border rounded-lg">
                        <div className="flex items-center gap-3 ml-2">
                            <div className="bg-primary/15 p-2 rounded-full">
                                <Search className="w-4 h-4 text-primary" />
                            </div>
                            <input
                                placeholder="Customer Mobile (Opt)"
                                value={store.customer_phone}
                                onChange={e => store.setCustomer(null, '', e.target.value)}
                                className="bg-transparent border-none outline-none font-medium w-full"
                            />
                        </div>
                        <Button variant="ghost" size="sm" className="text-primary">
                            <UserPlus className="w-4 h-4" />
                        </Button>
                    </div>

                    <div className="space-y-3 pt-2">
                        <div className="flex items-center justify-between text-muted font-medium">
                            <span>Subtotal</span>
                            <span>₹{calculation.subtotal.toFixed(2)}</span>
                        </div>
                        <div className="flex items-center justify-between text-muted font-medium">
                            <span className="flex items-center gap-2">
                                Discount
                                <button
                                    type="button"
                                    className="text-xs bg-surface-elevated px-1 border border-border rounded"
                                    onClick={() => store.setDiscount(store.bill_discount, !store.is_percentage_discount)}
                                >
                                    {store.is_percentage_discount ? '%' : '₹'}
                                </button>
                            </span>
                            <input
                                type="text"
                                className="w-20 bg-surface-elevated border border-border rounded p-1 text-right outline-none focus:border-primary"
                                value={store.bill_discount}
                                onChange={e => store.setDiscount(e.target.value, store.is_percentage_discount)}
                            />
                        </div>
                        <div className="flex items-center justify-between text-muted text-sm border-b border-border/50 pb-4">
                            <span>CGST + SGST</span>
                            <span>₹{(calculation.cgst + calculation.sgst).toFixed(2)}</span>
                        </div>

                        <div className="flex justify-between items-end pt-2 pb-6 border-b border-border/50">
                            <span className="text-xl font-bold text-muted">NET AMOUNT</span>
                            <span className="text-4xl font-black text-primary">₹{Math.round(calculation.net_amount)}</span>
                        </div>
                    </div>

                    <div className="space-y-4 pt-2">
                        <div className="grid grid-cols-4 gap-2 bg-surface-elevated p-1 rounded-lg border border-border">
                            {(['cash', 'upi', 'card', 'credit'] as const).map(mode => (
                                <button
                                    type="button"
                                    key={mode}
                                    onClick={() => store.setPaymentMode(mode)}
                                    className={`py-2 text-xs font-bold uppercase rounded flex items-center justify-center transition-all ${
                                        store.payment_mode === mode
                                            ? 'bg-primary text-on-primary shadow-sm'
                                            : 'text-muted hover:text-foreground'
                                    }`}
                                >
                                    {mode}
                                </button>
                            ))}
                        </div>

                        <div className="space-y-3">
                            <div className="flex justify-between items-center bg-surface-elevated border border-border rounded-lg p-2 px-3">
                                <span className="text-sm font-bold text-muted">Paid Amount</span>
                                <div className="flex items-center">
                                    <span className="text-muted mr-1 font-bold">₹</span>
                                    <input
                                        type="text"
                                        className="w-24 bg-transparent text-right font-black text-xl outline-none"
                                        placeholder={Math.round(calculation.net_amount).toString()}
                                        value={store.paid_amount}
                                        onChange={e => store.setPaidAmount(e.target.value)}
                                    />
                                </div>
                            </div>

                            {calculation.balance_due > 0 && (
                                <div className="flex justify-between text-danger font-bold px-1">
                                    <span>Balance Due:</span>
                                    <span>₹{calculation.balance_due.toFixed(2)}</span>
                                </div>
                            )}
                        </div>

                        <Button
                            className="w-full text-lg py-6 mt-4 font-black tracking-widest shadow-lg shadow-primary/20 hover:shadow-primary/40 transition-shadow disabled:opacity-50"
                            variant="primary"
                            onClick={() => void handleConfirm()}
                            disabled={isCommitting || store.cart.length === 0}
                        >
                            {isCommitting ? 'PROCESSING...' : 'CONFIRM (CTRL+ENTER)'}
                        </Button>
                    </div>
                </Card>
            </div>
        </div>
    );
};
