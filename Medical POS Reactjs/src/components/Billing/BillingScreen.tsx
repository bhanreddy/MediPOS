import React, { useState, useEffect, useRef, useMemo } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { Table } from '../ui/Table';
import { Badge } from '../ui/Badge';
import { Modal } from '../ui/Modal';
import { useOperatorFlow } from '../../hooks/useOperatorFlow';
import { useProductSearch, type SearchResult } from '../../hooks/useProductSearch';
import { useUpiId } from '../../hooks/useUpiId';
import { BillingSearchDropdown } from './BillingSearchDropdown';
import { db } from '../../db/index';
import { BillingService, type FinalizeSaleOptions } from '../../services/billingService';
import { PrinterService } from '../../services/printerService';
import { ProductLookupService } from '../../services/productLookupService';
import { ShopProfileService } from '../../services/shopProfileService';
import { InsufficientStockError } from '../../services/inventoryService';
import { navigatePath } from '../../utils/navigatePath';
import { BRANDING, BILLING_SCREEN_COPY } from '../../config/appContent';
import { useSelector } from 'react-redux';
import type { RootState } from '../../state/store';
import type { Product, PaymentMode, SalePaymentSplit, Customer } from '../../core/types';

type CartLine = {
    id: string;
    product: Product;
    batchId: string;
    name: string;
    qty: number;
    price: number;
    expiry: string;
    total: number;
};

/**
 * PHASE 12: INTELLIGENT BILLING FLOW
 * Prioritizes: Flow States, Mistake Prevention, Visual Priority
 */
type UpiModal = 'closed' | 'missing_config' | 'qr';

export const BillingScreen: React.FC = () => {
    const [barcode, setBarcode] = useState('');
    const [cart, setCart] = useState<CartLine[]>([]);
    const barcodeRef = useRef<HTMLInputElement>(null);
    const { state, setFlowState } = useOperatorFlow();
    const { upiId } = useUpiId();

    const [pharmacyName, setPharmacyName] = useState<string>(BRANDING.defaultMerchantDisplayName);
    const [upiModal, setUpiModal] = useState<UpiModal>('closed');
    const [pendingUpiAmount, setPendingUpiAmount] = useState(0);
    const [upiQrValue, setUpiQrValue] = useState('');
    const [isCommittingSale, setIsCommittingSale] = useState(false);

    const { user } = useSelector((s: RootState) => s.auth);

    const [stockError, setStockError] = useState<{
        productName: string;
        available: number;
        requested: number;
        missing: number;
    } | null>(null);

    const { results, isSearching } = useProductSearch(barcode);
    const [selectedIndex, setSelectedIndex] = useState(0);

    const [customers, setCustomers] = useState<{ value: string; label: string }[]>([]);
    const [customerId, setCustomerId] = useState('');
    const [supplyInterState, setSupplyInterState] = useState(false);
    const [paymentMode, setPaymentMode] = useState<PaymentMode>('CASH');
    const [splitCash, setSplitCash] = useState('');
    const [splitUpi, setSplitUpi] = useState('');
    const [splitCard, setSplitCard] = useState('');
    const [splitDue, setSplitDue] = useState('');
    const [prescriptionRx, setPrescriptionRx] = useState('');
    const [prescriptionImage, setPrescriptionImage] = useState('');
    const prescInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        db.customers.orderBy('name')
            .toArray()
            .then((rows: Customer[]) => {
                setCustomers([
                    { value: '', label: 'Walk-in' },
                    ...rows.map(c => ({ value: c.id, label: `${c.name} (${c.phone})` })),
                ]);
            })
            .catch(() => setCustomers([{ value: '', label: 'Walk-in' }]));
    }, []);

    useEffect(() => {
        void ShopProfileService.getShopProfileLocal()
            .then(p => {
                if (p?.medical_name?.trim()) setPharmacyName(p.medical_name.trim());
            })
            .catch(() => {
                /* keep fallback */
            });
    }, []);

    useEffect(() => {
        if (upiModal === 'qr' && upiId && pendingUpiAmount > 0) {
            const upiString = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(pharmacyName)}&am=${pendingUpiAmount.toFixed(2)}&cu=INR&tn=Bill%20Payment`;
            setUpiQrValue(upiString);
        } else {
            setUpiQrValue('');
        }
    }, [upiModal, upiId, pendingUpiAmount, pharmacyName]);

    const needsPrescription = useMemo(() => cart.some(l => l.product.schedule_h), [cart]);

    const buildPaymentSplits = (finalTotal: number): SalePaymentSplit[] => {
        const rows: SalePaymentSplit[] = [];
        const c = parseFloat(splitCash) || 0;
        const u = parseFloat(splitUpi) || 0;
        const r = parseFloat(splitCard) || 0;
        const d = parseFloat(splitDue) || 0;
        if (c > 0) rows.push({ mode: 'CASH', amount: c });
        if (u > 0) rows.push({ mode: 'UPI', amount: u });
        if (r > 0) rows.push({ mode: 'CARD', amount: r });
        if (d > 0) rows.push({ mode: 'DUE', amount: d });
        const sum = Math.round(rows.reduce((a, s) => a + s.amount, 0) * 100) / 100;
        if (Math.abs(sum - finalTotal) > 0.05) {
            throw new Error(`Split total ₹${sum.toFixed(2)} must equal ₹${finalTotal.toFixed(2)}`);
        }
        return rows;
    };

    const commitSale = async () => {
        if (!user) {
            // eslint-disable-next-line no-alert
            alert('No cashier logged in!');
            return;
        }

        setIsCommittingSale(true);
        try {
            const serviceCart = cart.map(item => ({
                product: item.product,
                quantity: item.qty,
                discountPercent: 0,
                batchId: item.batchId,
                sellingPrice: item.price,
            }));

            const opts: FinalizeSaleOptions = {
                supplyType: supplyInterState ? 'INTER' : 'INTRA',
                prescriptionRxNumber: prescriptionRx.trim() || undefined,
                prescriptionImageData: prescriptionImage.trim() || undefined,
            };

            let mode: PaymentMode = paymentMode;
            if (mode === 'MIXED') {
                opts.paymentSplits = buildPaymentSplits(total);
            }

            const sale = await BillingService.finalizeSale(
                serviceCart,
                customerId || undefined,
                user.id,
                mode,
                opts
            );

            const items = await db.sale_items.where('sale_id').equals(sale.id).toArray();

            // Close UPI modal *before* print so the browser dialog is not blocked by overlay/focus trap
            setUpiModal('closed');
            setPendingUpiAmount(0);
            await new Promise<void>(resolve => {
                requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
            });

            await PrinterService.printBill(sale, items);

            setCart([]);
            setPrescriptionRx('');
            setPrescriptionImage('');
            setSplitCash('');
            setSplitUpi('');
            setSplitCard('');
            setSplitDue('');
            setFlowState('IDLE');
        } catch (err: unknown) {
            console.error('Payment Failed', err);

            if (err instanceof InsufficientStockError) {
                setStockError({
                    productName: err.productName || 'Unknown Product',
                    available: err.available,
                    requested: err.requested,
                    missing: err.missing,
                });
            } else {
                // eslint-disable-next-line no-alert
                alert('Payment Failed: ' + (err instanceof Error ? err.message : String(err)));
            }
        } finally {
            setIsCommittingSale(false);
        }
    };

    const handlePayment = async () => {
        const upiPortion =
            paymentMode === 'UPI' ? total : paymentMode === 'MIXED' ? Math.round((parseFloat(splitUpi) || 0) * 100) / 100 : 0;
        const wantsUpiQr = (paymentMode === 'UPI' || paymentMode === 'MIXED') && upiPortion > 0;

        if (!isPaymentArmed) {
            setFlowState('PAYMENT_READY');
            // UPI / split-UPI: one click opens the QR modal (customer can pay immediately)
            if (!wantsUpiQr) return;
        }

        if (!user) {
            // eslint-disable-next-line no-alert
            alert('No cashier logged in!');
            return;
        }

        if (needsPrescription) {
            const rx = prescriptionRx.trim();
            const img = prescriptionImage.trim();
            if (!rx || !img) {
                // eslint-disable-next-line no-alert
                alert('Schedule H: enter prescription reference and attach a prescription photo before payment.');
                return;
            }
        }

        if (paymentMode === 'MIXED') {
            try {
                buildPaymentSplits(total);
            } catch (e: unknown) {
                // eslint-disable-next-line no-alert
                alert(e instanceof Error ? e.message : String(e));
                return;
            }
        }

        if (wantsUpiQr) {
            if (!upiId.trim()) {
                setPendingUpiAmount(upiPortion);
                setUpiModal('missing_config');
                return;
            }
            setPendingUpiAmount(upiPortion);
            setUpiModal('qr');
            return;
        }

        await commitSale();
    };

    const closeUpiModal = () => {
        setUpiModal('closed');
        setPendingUpiAmount(0);
    };

    useEffect(() => {
        setSelectedIndex(0);
    }, [results]);

    useEffect(() => {
        if (state !== 'PAYMENT_READY' && !barcode) {
            barcodeRef.current?.focus();
        }
    }, [state, barcode]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
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
                if (selected) void confirmSelection(selected);
            } else if (e.key === 'Escape') {
                e.preventDefault();
                setBarcode('');
            }
        }
    };

    const confirmSelection = async (result: SearchResult) => {
        if (result.totalStock <= 0) return;

        try {
            let batchToAdd = null;
            if (result.bestBatchId) {
                batchToAdd = await db.batches.get(result.bestBatchId);
            }

            if (!batchToAdd) {
                console.error('Batch not found for ID:', result.bestBatchId);
                return;
            }

            const unitPrice = batchToAdd.sales_rate || batchToAdd.mrp;
            const product = await db.products.get(result.product.id);
            if (!product) return;

            const newItem: CartLine = {
                id: crypto.randomUUID(),
                product,
                batchId: batchToAdd.id,
                name: product.name,
                qty: 1,
                price: unitPrice,
                expiry: batchToAdd.expiry_date,
                total: unitPrice,
            };

            setCart(prev => [newItem, ...prev]);
            setBarcode('');
            if (state === 'IDLE') setFlowState('ACTIVE_BILLING');
        } catch (err) {
            console.error('Failed to add item from search', err);
        }
    };

    const handleBarcodeSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const trimmed = barcode.trim();
        if (!trimmed) return;

        const hit = await ProductLookupService.findByBarcode(trimmed);
        if (hit && hit.bestBatchId && hit.totalStock > 0) {
            await confirmSelection(hit);
            return;
        }

        // eslint-disable-next-line no-alert
        alert('Barcode not found. Use product search or add barcode on Medicine Master.');
        setBarcode('');
    };

    const updateQuantity = (itemId: string, newQtyStr: string) => {
        const newQty = parseInt(newQtyStr) || 0;
        if (newQty < 1) return;

        setCart(prev =>
            prev.map(item => {
                if (item.id === itemId) {
                    return {
                        ...item,
                        qty: newQty,
                        total: item.price * newQty,
                    };
                }
                return item;
            })
        );
    };

    const onPrescriptionFile = (file: File | null) => {
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            const r = reader.result;
            if (typeof r === 'string') setPrescriptionImage(r);
        };
        reader.readAsDataURL(file);
    };

    const total = useMemo(() => cart.reduce((sum, item) => sum + item.total, 0), [cart]);
    const canPay = cart.length > 0;
    const isPaymentArmed = state === 'PAYMENT_READY';

    return (
        <div className="h-full flex flex-col gap-6 animate-slideIn select-none">
            <div
                className={`p-4 rounded-xl border-2 transition-all duration-300 flex items-center gap-8 shadow-2xl
                ${state === 'IDLE' ? 'bg-surface-elevated border-border' : 'bg-surface border-primary/20'}
            `}
            >
                <form onSubmit={e => void handleBarcodeSubmit(e)} className="flex-1 relative">
                    <Input
                        ref={barcodeRef}
                        label={state === 'IDLE' ? 'SCAN / SEARCH TO BEGIN' : 'CONTINUE SCANNING / SEARCHING'}
                        placeholder="Scan Barcode or Type Product Name..."
                        value={barcode}
                        onChange={e => setBarcode(e.target.value)}
                        onKeyDown={handleKeyDown}
                        className="text-2xl py-6 font-black tracking-tight"
                        autoFocus
                        autoComplete="off"
                    />
                    <BillingSearchDropdown
                        results={results}
                        selectedIndex={selectedIndex}
                        onSelect={res => void confirmSelection(res)}
                        isSearching={isSearching}
                    />
                </form>

                <div className="text-right px-6 border-l-2 border-border">
                    <p className="text-label font-black uppercase tracking-widest text-muted mb-1">Sub-Total</p>
                    <p
                        className={`text-6xl font-black tabular-nums tracking-tighter transition-colors
                        ${canPay ? 'text-foreground-strong' : 'text-muted'}
                    `}
                    >
                        <span className="text-primary text-4xl mr-2">₹</span>
                        {total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </p>
                </div>
            </div>

            {(state === 'PAYMENT_READY' || cart.length > 0) && (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                    <div className="bg-surface border-2 border-border rounded-xl p-4 space-y-3">
                        <div className="text-label font-black uppercase tracking-widest text-muted">Customer & GST</div>
                        <Select
                            label="Customer"
                            options={customers}
                            value={customerId}
                            onChange={e => setCustomerId(e.target.value)}
                        />
                        <label className="flex items-center gap-2 text-sm font-bold cursor-pointer">
                            <input
                                type="checkbox"
                                checked={supplyInterState}
                                onChange={e => setSupplyInterState(e.target.checked)}
                                className="h-4 w-4"
                            />
                            Inter-state supply (IGST)
                        </label>
                    </div>

                    <div className="bg-surface border-2 border-border rounded-xl p-4 space-y-3">
                        <div className="text-label font-black uppercase tracking-widest text-muted">Payment</div>
                        <Select
                            label="Mode"
                            options={[
                                { value: 'CASH', label: 'Cash' },
                                { value: 'UPI', label: 'UPI' },
                                { value: 'CARD', label: 'Card' },
                                { value: 'DUE', label: 'Due / Credit' },
                                { value: 'MIXED', label: 'Split payment' },
                            ]}
                            value={paymentMode}
                            onChange={e => setPaymentMode(e.target.value as PaymentMode)}
                        />
                        {paymentMode === 'MIXED' && (
                            <div className="grid grid-cols-2 gap-2">
                                <Input label="Cash ₹" value={splitCash} onChange={e => setSplitCash(e.target.value)} />
                                <Input label="UPI ₹" value={splitUpi} onChange={e => setSplitUpi(e.target.value)} />
                                <Input label="Card ₹" value={splitCard} onChange={e => setSplitCard(e.target.value)} />
                                <Input label="Due ₹" value={splitDue} onChange={e => setSplitDue(e.target.value)} />
                            </div>
                        )}
                    </div>

                    {needsPrescription && (
                        <div className="xl:col-span-2 bg-warning/10 border-2 border-warning rounded-xl p-4 space-y-3">
                            <div className="flex items-center justify-between flex-wrap gap-2">
                                <span className="text-heading font-black uppercase text-foreground-strong">
                                    Schedule H — Prescription required
                                </span>
                                <Badge variant="danger">Mandatory</Badge>
                            </div>
                            <Input
                                label="Rx reference / Doctor reg. no."
                                value={prescriptionRx}
                                onChange={e => setPrescriptionRx(e.target.value)}
                            />
                            <div className="flex flex-wrap gap-2 items-end">
                                <input
                                    ref={prescInputRef}
                                    type="file"
                                    accept="image/*"
                                    capture="environment"
                                    className="text-sm"
                                    onChange={e => onPrescriptionFile(e.target.files?.[0] ?? null)}
                                />
                                {prescriptionImage && (
                                    <Badge variant="success">Prescription image attached</Badge>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            )}

            <div className="flex-1 min-h-0 bg-surface border-2 border-border rounded-xl overflow-hidden flex flex-col shadow-inner">
                {cart.length > 0 ? (
                    <Table
                        headers={['ITEM_NAME', 'QTY', 'UNIT_PRICE', 'TOTAL_INR']}
                        data={cart}
                        renderRow={item => (
                            <tr key={item.id} className="border-b-2 border-border hover:bg-surface-elevated group cursor-default">
                                <td className="px-6 py-4">
                                    <div className="flex flex-col">
                                        <span className="text-item-name font-black text-foreground-strong uppercase">
                                            {item.name}
                                        </span>
                                        <div className="text-[10px] font-bold text-muted uppercase tracking-widest flex gap-2 flex-wrap">
                                            <span>Exp: {item.expiry}</span>
                                            {item.product.schedule_h && (
                                                <Badge variant="danger">H</Badge>
                                            )}
                                        </div>
                                    </div>
                                </td>
                                <td className="px-6 py-4 text-center w-32">
                                    <input
                                        type="number"
                                        min={1}
                                        value={item.qty}
                                        onChange={e => updateQuantity(item.id, e.target.value)}
                                        onClick={e => e.stopPropagation()}
                                        className="w-16 h-10 text-center font-black text-lg bg-surface border-2 border-border rounded-md focus:border-primary outline-none tabular-nums"
                                    />
                                </td>
                                <td className="px-6 py-4 text-right text-muted tabular-nums">
                                    <div className="flex flex-col items-end">
                                        <span>₹{item.price.toFixed(2)}</span>
                                    </div>
                                </td>
                                <td className="px-6 py-4 text-right font-black text-foreground-strong tabular-nums">
                                    ₹{item.total.toFixed(2)}
                                </td>
                            </tr>
                        )}
                    />
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-muted gap-4 opacity-40">
                        <span className="text-8xl">📦</span>
                        <div className="text-center">
                            <p className="text-heading font-black uppercase tracking-tighter text-foreground-strong">
                                {BILLING_SCREEN_COPY.terminalReady}
                            </p>
                            <p className="text-label font-bold text-muted uppercase tracking-widest mt-1">
                                {BILLING_SCREEN_COPY.terminalReadySub}
                            </p>
                        </div>
                    </div>
                )}
            </div>

            <div className="bg-surface-elevated border-2 border-border p-4 rounded-xl flex items-center justify-between shadow-xl">
                <div className="flex gap-2">
                    <ShortcutHint kbd="F2" label="SCAN" active={state !== 'PAYMENT_READY'} />
                    <ShortcutHint kbd="F6" label="DISC" />
                    <ShortcutHint kbd="F9" label="HOLD" />
                    <ShortcutHint kbd="DEL" label="VOID" />
                </div>

                <div className="flex gap-6 items-center">
                    <button
                        type="button"
                        onClick={() => setCart([])}
                        className="text-muted hover:text-danger text-label font-black uppercase tracking-widest transition-colors"
                    >
                        [ESC] Cancel Bill
                    </button>

                    <Button
                        variant={isPaymentArmed ? 'success' : 'secondary'}
                        size="lg"
                        className={`h-16 px-12 transition-all duration-300 font-black
                            ${isPaymentArmed ? 'scale-105 shadow-xl' : 'opacity-80'}
                            ${!canPay ? 'pointer-events-none grayscale' : ''}
                        `}
                        onClick={() => void handlePayment()}
                    >
                        {isPaymentArmed ? 'PRINT & CLOSE (ENTER)' : 'SETTLE & GO (CTRL+ENTER)'}
                    </Button>
                </div>
            </div>

            <Modal
                isOpen={upiModal === 'missing_config'}
                onClose={closeUpiModal}
                title="UPI not configured"
                footer={
                    <>
                        <Button variant="ghost" onClick={closeUpiModal}>
                            Close
                        </Button>
                        <Button
                            variant="primary"
                            className="font-black"
                            onClick={() => {
                                closeUpiModal();
                                navigatePath('/settings');
                            }}
                        >
                            Open settings
                        </Button>
                    </>
                }
            >
                <p className="text-sm font-bold text-muted">
                    UPI ID not configured. Go to Settings → Payment Settings and save your VPA, then try again.
                </p>
            </Modal>

            <Modal
                isOpen={upiModal === 'qr'}
                onClose={closeUpiModal}
                title="Scan to pay (UPI)"
                footer={
                    <>
                        <Button variant="ghost" onClick={closeUpiModal}>
                            Cancel / Close
                        </Button>
                        <Button
                            variant="success"
                            className="font-black"
                            onClick={() => void commitSale()}
                            disabled={isCommittingSale}
                            isLoading={isCommittingSale}
                        >
                            Payment Received ✓
                        </Button>
                    </>
                }
            >
                    <div className="flex flex-col items-center gap-4 text-center">
                    <p className="text-sm font-black uppercase tracking-widest text-muted">Pay to: {upiId}</p>
                    <p className="text-4xl font-black tabular-nums text-foreground-strong">
                        ₹ {pendingUpiAmount.toFixed(2)}
                    </p>
                    {upiQrValue ? (
                        <div className="bg-white p-3 rounded-xl border-2 border-border">
                            <QRCodeSVG value={upiQrValue} size={200} />
                        </div>
                    ) : (
                        <span className="text-muted text-sm font-bold">Preparing QR…</span>
                    )}
                    <p className="text-xs font-bold text-muted">Scan with GPay, PhonePe, Paytm, or BHIM</p>
                    <p className="text-[10px] font-bold text-muted max-w-sm">
                        After the customer pays, tap “Payment Received” — the bill is saved and the print dialog opens automatically.
                    </p>
                </div>
            </Modal>

            {stockError && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fadeIn">
                    <div className="bg-surface w-full max-w-md p-6 rounded-2xl shadow-2xl border-2 border-danger animate-scaleIn">
                        <div className="flex flex-col items-center text-center gap-4">
                            <div className="bg-danger/10 p-4 rounded-full">
                                <span className="text-4xl">⚠️</span>
                            </div>

                            <div>
                                <h3 className="text-xl font-black text-danger uppercase tracking-tight">Insufficient Stock</h3>
                                <p className="text-muted font-bold mt-1">We cannot fulfill the request for:</p>
                                <p className="text-lg font-black text-foreground-strong mt-1 uppercase border-b-2 border-danger/20 inline-block pb-1">
                                    {stockError.productName}
                                </p>
                            </div>

                            <div className="bg-surface-elevated w-full rounded-xl p-4 grid grid-cols-2 gap-4 border border-border">
                                <div className="text-center">
                                    <p className="text-xs font-bold text-muted uppercase tracking-widest">Available</p>
                                    <p className="text-2xl font-black text-success">{stockError.available}</p>
                                </div>
                                <div className="text-center border-l-2 border-border">
                                    <p className="text-xs font-bold text-muted uppercase tracking-widest">Required</p>
                                    <p className="text-2xl font-black text-foreground">{stockError.requested}</p>
                                </div>
                                <div className="col-span-2 border-t-2 border-border pt-3 mt-1">
                                    <p className="text-xs font-bold text-danger uppercase tracking-widest">Shortage</p>
                                    <p className="text-3xl font-black text-danger">-{stockError.missing}</p>
                                </div>
                            </div>

                            <Button
                                variant="danger"
                                className="w-full font-black uppercase tracking-widest mt-2"
                                onClick={() => setStockError(null)}
                            >
                                Acknowledge & Fix
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

const ShortcutHint = ({ kbd, label, active = false }: { kbd: string; label: string; active?: boolean }) => (
    <div
        className={`px-4 py-2 border-2 rounded-lg flex items-center gap-3 transition-colors
        ${active ? 'bg-primary/20 border-primary shadow-lg' : 'bg-surface border-border'}
    `}
    >
        <span className={`text-label font-black uppercase ${active ? 'text-primary' : 'text-muted'}`}>{kbd}</span>
        <div className="h-4 w-px bg-border" />
        <span
            className={`text-[10px] font-black uppercase tracking-widest ${active ? 'text-foreground-strong' : 'text-muted'}`}
        >
            {label}
        </span>
    </div>
);
