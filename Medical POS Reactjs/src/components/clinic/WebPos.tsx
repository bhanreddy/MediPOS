import { useState, useRef, useEffect, useMemo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import api from '../../lib/api';
import { Card } from '../ui/Card.tsx';
import { Button } from '../ui/Button';
import { Search, X, UserPlus, ShoppingCart } from 'lucide-react';
import { usePosStore } from '../../store/posStore';
import toast from 'react-hot-toast';

export const WebPos = () => {
    const store = usePosStore();
    const searchInputRef = useRef<HTMLInputElement>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');

    useEffect(() => {
        const timer = setTimeout(() => setDebouncedSearch(searchTerm), 400);
        return () => clearTimeout(timer);
    }, [searchTerm]);

    // Inventory Search
    const { data: searchResults } = useQuery({
        queryKey: ['pos-search', debouncedSearch],
        queryFn: async () => {
            if (!debouncedSearch) return [];
            const { data } = await api.get(`/inventory/search?q=${debouncedSearch}`);
            return data.data;
        },
        enabled: debouncedSearch.length > 1
    });

    // Keyboard Shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.ctrlKey && e.key === 'Enter') {
                e.preventDefault();
                handleConfirm();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [store.cart]);

    const addToCart = (medicine: any) => {
        if (!medicine.batches || medicine.batches.length === 0) {
            toast.error('No stock available');
            return;
        }
        // Auto select FIFO batch
        const batch = [...medicine.batches].sort((a: any, b: any) => new Date(a.expiry_date).getTime() - new Date(b.expiry_date).getTime())[0];
        
        store.addItem({
            medicine_id: medicine.id,
            medicine_name: medicine.name,
            batch_id: batch.id,
            batch_number: batch.batch_number,
            expiry_date: batch.expiry_date,
            quantity: 1,
            mrp: batch.mrp,
            purchase_price: batch.purchase_price,
            max_stock: batch.quantity_remaining,
            gst_rate: medicine.gst_rate,
            discount_pct: 0
        });
        setSearchTerm('');
        searchInputRef.current?.focus();
    };

    const calculation = useMemo(() => {
        let subtotal = 0;
        let cgst = 0;
        let sgst = 0;
        
        store.cart.forEach((item: any) => {
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

    const submitSale = useMutation({
        mutationFn: async () => {
            const payload = {
                customer_id: store.customer_id,
                customer_name: store.customer_name,
                customer_phone: store.customer_phone,
                items: store.cart.map((c: any) => ({
                    medicine_id: c.medicine_id,
                    batch_id: c.batch_id,
                    quantity: c.quantity,
                    mrp: c.mrp,
                    discount_pct: c.discount_pct,
                    total: c.quantity * c.mrp
                })),
                subtotal: calculation.subtotal,
                discount: calculation.billDiscountAmt,
                gst_amount: calculation.cgst + calculation.sgst,
                net_amount: calculation.net_amount,
                payment_mode: store.payment_mode,
                paid_amount: calculation.paidAmountVal,
                balance_due: calculation.balance_due
            };
            const { data } = await api.post('/sales', payload);
            return data;
        },
        onSuccess: () => {
            toast.success('Sale Confirmed!');
            // Print Modal Logic could be triggered here via state to show an iframe pdf
            store.reset();
            searchInputRef.current?.focus();
        },
        onError: (err: any) => toast.error(err.response?.data?.error || 'Sale failed')
    });

    const handleConfirm = () => {
        if (store.cart.length === 0) return toast.error('Cart is empty');
        if (calculation.balance_due > 0 && store.payment_mode !== 'credit') {
            return toast.error('Balance due > 0 but payment mode is not "credit"');
        }
        submitSale.mutate();
    };

    return (
        <div className="flex h-full p-6 gap-6 max-w-[1600px] mx-auto overflow-hidden">
            {/* Left Column - Cart area */}
            <div className="flex flex-col flex-[3] gap-4 h-full">
                {/* Search */}
                <div className="relative z-10">
                    <Search className="absolute left-4 top-3.5 h-5 w-5 text-muted" />
                    <input 
                        ref={searchInputRef}
                        type="text" 
                        autoFocus
                        placeholder="Search medicines... (Press Enter to add first)" 
                        className="w-full bg-bg-surface border-2 border-border focus:border-accent-primary rounded-xl pl-12 pr-4 py-3 text-lg outline-none font-medium shadow-sm transition-all"
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        onKeyDown={e => {
                            if (e.key === 'Enter' && searchResults?.length > 0) {
                                addToCart(searchResults[0]);
                            }
                        }}
                    />
                    
                    {searchTerm && searchResults && (
                        <div className="absolute top-full left-0 right-0 mt-2 bg-bg-surface border border-border rounded-xl shadow-2xl max-h-80 overflow-y-auto">
                            {searchResults.length === 0 ? (
                                <div className="p-4 text-center text-muted">No medicines found</div>
                            ) : searchResults.map((med: any) => {
                                const stock = med.batches?.reduce((acc: number, b: any) => acc + b.quantity_remaining, 0) || 0;
                                return (
                                    <div 
                                        key={med.id} 
                                        className={`p-3 border-b border-border last:border-0 hover:bg-bg-primary cursor-pointer flex justify-between items-center ${stock === 0 ? 'opacity-50' : ''}`}
                                        onClick={() => stock > 0 && addToCart(med)}
                                    >
                                        <div>
                                            <p className="font-bold">{med.name} <span className="text-xs text-muted font-normal ml-2">{med.generic_name}</span></p>
                                            <p className="text-xs text-muted mt-1">{med.manufacturer}</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="font-bold text-accent-primary">₹{med.batches?.[0]?.mrp || '0.00'}</p>
                                            <p className={`text-xs ${stock > 0 ? 'text-success' : 'text-danger'}`}>{stock} in stock</p>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Cart Table */}
                <Card className="flex-1 flex flex-col overflow-hidden border-2 border-border bg-bg-surface">
                    <div className="flex-1 overflow-y-auto">
                        <table className="w-full text-left border-collapse">
                            <thead className="bg-bg-primary sticky top-0 z-0">
                                <tr>
                                    <th className="p-3 text-sm font-bold text-muted border-b border-border">Medicine</th>
                                    <th className="p-3 text-sm font-bold text-muted border-b border-border w-24">Batch</th>
                                    <th className="p-3 text-sm font-bold text-muted border-b border-border w-24">Expiry</th>
                                    <th className="p-3 text-sm font-bold text-muted border-b border-border w-28">Qty</th>
                                    <th className="p-3 text-sm font-bold text-muted border-b border-border w-24">MRP</th>
                                    <th className="p-3 text-sm font-bold text-muted border-b border-border w-32 border-r">Total</th>
                                    <th className="p-3 text-sm font-bold text-muted border-b border-border w-12 text-center"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {store.cart.map((item: any) => (
                                    <tr key={item.batch_id} className="border-b border-border/50 hover:bg-bg-primary/50 transition-colors">
                                        <td className="p-3">
                                            <p className="font-bold">{item.medicine_name}</p>
                                        </td>
                                        <td className="p-3 text-sm font-mono text-muted">{item.batch_number}</td>
                                        <td className="p-3 text-sm font-mono text-muted">{item.expiry_date.substring(0, 7)}</td>
                                        <td className="p-3">
                                            <input 
                                                type="number"
                                                min="1"
                                                max={item.max_stock}
                                                value={item.quantity}
                                                onChange={e => {
                                                    const val = parseInt(e.target.value) || 1;
                                                    store.updateQuantity(item.batch_id, Math.min(val, item.max_stock));
                                                }}
                                                className={`w-16 bg-bg-primary border ${item.quantity >= item.max_stock ? 'border-warning/50 focus:border-warning' : 'border-border focus:border-accent-primary'} rounded p-1 text-center font-bold outline-none`}
                                            />
                                            {item.quantity >= item.max_stock && <p className="text-[10px] text-warning mt-1 absolute">Max: {item.max_stock}</p>}
                                        </td>
                                        <td className="p-3 font-semibold text-muted">₹{item.mrp.toFixed(2)}</td>
                                        <td className="p-3 font-black text-lg border-r border-border">₹{(item.quantity * item.mrp).toFixed(2)}</td>
                                        <td className="p-3 text-center">
                                            <button onClick={() => store.removeItem(item.batch_id)} className="text-muted hover:text-danger p-1 rounded hover:bg-danger/10 transition-colors">
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

            {/* Right Column - Summary & Customer */}
            <div className="flex flex-col flex-[2] max-w-sm gap-4 h-full">
                <Card className="p-5 flex flex-col gap-4 border-2 border-border bg-bg-surface">
                    <div className="flex justify-between items-center bg-bg-primary p-2 border border-border rounded-lg">
                        <div className="flex items-center gap-3 ml-2">
                            <div className="bg-accent-secondary/20 p-2 rounded-full"><Search className="w-4 h-4 text-accent-secondary" /></div>
                            <input 
                                placeholder="Customer Mobile (Opt)"
                                value={store.customer_phone}
                                onChange={e => store.setCustomer(null, '', e.target.value)}
                                className="bg-transparent border-none outline-none font-medium w-full"
                            />
                        </div>
                        <Button variant="ghost" size="sm" className="text-accent-primary"><UserPlus className="w-4 h-4" /></Button>
                    </div>

                    <div className="space-y-3 pt-2">
                        <div className="flex items-center justify-between text-muted font-medium">
                            <span>Subtotal</span>
                            <span>₹{calculation.subtotal.toFixed(2)}</span>
                        </div>
                        <div className="flex items-center justify-between text-muted font-medium">
                            <span className="flex items-center gap-2">Discount 
                                <button className="text-xs bg-bg-primary px-1 border border-border rounded" onClick={() => store.setDiscount(store.bill_discount, !store.is_percentage_discount)}>
                                    {store.is_percentage_discount ? '%' : '₹'}
                                </button>
                            </span>
                            <input 
                                type="text"
                                className="w-20 bg-bg-primary border border-border rounded p-1 text-right outline-none focus:border-accent-primary"
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
                            <span className="text-4xl font-black text-accent-primary">₹{Math.round(calculation.net_amount)}</span>
                        </div>
                    </div>

                    <div className="space-y-4 pt-2">
                        <div className="grid grid-cols-4 gap-2 bg-bg-primary p-1 rounded-lg border border-border">
                            {['cash', 'upi', 'card', 'credit'].map(mode => (
                                <button 
                                    key={mode}
                                    onClick={() => store.setPaymentMode(mode as any)}
                                    className={`py-2 text-xs font-bold uppercase rounded flex items-center justify-center transition-all ${store.payment_mode === mode ? 'bg-accent-primary text-bg-primary shadow-sm' : 'text-muted hover:text-foreground'}`}
                                >
                                    {mode}
                                </button>
                            ))}
                        </div>

                        <div className="space-y-3">
                            <div className="flex justify-between items-center bg-bg-primary border border-border rounded-lg p-2 px-3">
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
                            className="w-full text-lg py-6 mt-4 font-black tracking-widest shadow-lg shadow-accent-primary/20 hover:shadow-accent-primary/40 transition-shadow disabled:opacity-50"
                            variant="primary"
                            onClick={handleConfirm}
                            disabled={submitSale.isPending || store.cart.length === 0}
                        >
                            {submitSale.isPending ? 'PROCESSING...' : 'CONFIRM (CTRL+ENTER)'}
                        </Button>
                    </div>
                </Card>
            </div>
        </div>
    );
};
