
import React, { useState, useEffect, useRef } from 'react';
import { Calculator } from 'lucide-react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { useProductSearch } from '../../hooks/useProductSearch';
import { BillingSearchDropdown } from '../Billing/BillingSearchDropdown';
import type { Product } from '../../core/types';
import api from '../../lib/api';
import { FloatingCalculator } from './FloatingCalculator';

interface AddBatchModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

export const AddBatchModal: React.FC<AddBatchModalProps> = ({ isOpen, onClose, onSuccess }) => {
    const [productSearch, setProductSearch] = useState('');
    const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
    const [isCreatingNewProduct, setIsCreatingNewProduct] = useState(false);

    // Search Hook
    const { results, isSearching } = useProductSearch(productSearch);
    const [searchIndex, setSearchIndex] = useState(0);

    // New Product Fields
    const [newProductName, setNewProductName] = useState('');
    const [newProductComposition, setNewProductComposition] = useState('');
    const [newProductManufacturer, setNewProductManufacturer] = useState('');
    const [newProductType, setNewProductType] = useState('TABLET');

    // Batch Fields
    const [batchNumber, setBatchNumber] = useState('');
    const [expiryDate, setExpiryDate] = useState('');
    const [qty, setQty] = useState('');
    const [cost, setCost] = useState('');
    const [mrp, setMrp] = useState('');
    const [salesRate, setSalesRate] = useState('');

    const [error, setError] = useState('');
    const [isCalculatorOpen, setIsCalculatorOpen] = useState(false);
    const calculatorToggleRef = useRef<HTMLButtonElement>(null);
    const firstInputRef = useRef<HTMLInputElement>(null);

    // Reset on Open
    useEffect(() => {
        if (isOpen) {
            setProductSearch('');
            setSelectedProduct(null);
            setIsCreatingNewProduct(false);
            setNewProductName('');
            setNewProductComposition('');
            setNewProductManufacturer('');
            setNewProductType('TABLET');
            setBatchNumber('');
            setExpiryDate('');
            setQty('');
            setCost('');
            setMrp('');
            setSalesRate('');
            setError('');
            setIsCalculatorOpen(false);
            // Focus hack
            setTimeout(() => firstInputRef.current?.focus(), 100);
        }
    }, [isOpen]);

    // Keyboard Nav for Search
    const handleSearchKeyDown = (e: React.KeyboardEvent) => {
        if (selectedProduct || isCreatingNewProduct) return;

        if (results.length > 0) {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSearchIndex(prev => Math.min(prev + 1, results.length - 1));
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSearchIndex(prev => Math.max(prev - 1, 0));
            } else if (e.key === 'Enter') {
                e.preventDefault();
                const selected = results[searchIndex];
                if (selected) {
                    setSelectedProduct(selected.product);
                    setProductSearch(selected.product.name);
                }
            }
        }
    };

    const handleCreateNewProduct = () => {
        setIsCreatingNewProduct(true);
        setNewProductName(productSearch); // Pre-fill with search term
        setSelectedProduct(null);
    };

    const handleConfirm = async () => {
        setError('');

        // 1. Validate Product
        let productId = selectedProduct?.id;

        if (isCreatingNewProduct) {
            if (!newProductName) { setError("Product Name is required."); return; }
            if (!newProductManufacturer) { setError("Manufacturer is required."); return; }
            
            let categoryVal = newProductType.toLowerCase();
            if (categoryVal !== 'tablet' && categoryVal !== 'syrup' && categoryVal !== 'injection' && categoryVal !== 'capsule' && categoryVal !== 'cream' && categoryVal !== 'other') {
                categoryVal = 'tablet';
            }

            try {
                const productRes = await api.post('/inventory/medicines', {
                    name: newProductName,
                    generic_name: newProductComposition || null,
                    manufacturer: newProductManufacturer,
                    category: categoryVal,
                    hsn_code: '3004',
                    gst_rate: 12,
                    low_stock_threshold: 10,
                    unit: 'strip',
                    is_schedule_h1: false,
                });
                productId = productRes.data?.data?._local_id || productRes.data?.data?.id;
            } catch (err: any) {
                console.error("Failed to create product", err);
                setError(err.response?.data?.error?.message || "Failed to create product. Name might be duplicate.");
                return;
            }
        } else if (!selectedProduct) {
            setError("Select a product or create a new one.");
            return;
        }

        if (!productId) {
            setError("Product ID missing.");
            return;
        }

        // 2. Validate Batch
        if (!batchNumber) { setError("Batch number is required."); return; }
        if (!expiryDate) { setError("Expiry date is required."); return; }

        const today = new Date().toISOString().split('T')[0];
        if (expiryDate < today) {
            setError("Cannot add expired stock.");
            return;
        }

        const quantityNum = Number(qty);
        const costNum = Number(cost);
        const mrpNum = Number(mrp);
        const salesRateNum = Number(salesRate);

        if (!quantityNum || quantityNum <= 0) { setError("Quantity must be > 0."); return; }
        if (!costNum || costNum <= 0) { setError("Cost must be > 0."); return; }
        if (!mrpNum || mrpNum < costNum) { setError("MRP must be >= Cost Price."); return; }
        if (!salesRateNum || salesRateNum < costNum) { setError("Selling Price must be >= Cost Price."); return; }
        if (salesRateNum > mrpNum) { setError("Selling Price cannot exceed MRP."); return; }

        // 3. Create Batch & Inventory via backend /purchases API
        try {
            const payload = {
                supplier_id: null,
                invoice_number: `ADD-STOCK-${Date.now()}`,
                invoice_date: new Date().toISOString().split('T')[0],
                bill_image_url: null,
                notes: 'Stock added manually via Add Stock modal',
                items: [{
                    medicine_id: productId,
                    batch_number: batchNumber,
                    expiry_date: expiryDate,
                    quantity: quantityNum,
                    purchase_price: costNum,
                    mrp: mrpNum,
                    gst_rate: selectedProduct?.gst_rate || 12,
                    discount: 0
                }]
            };

            await api.post('/purchases', payload);
            onSuccess();
            onClose();

        } catch (err: any) {
            console.error("Failed to save batch", err);
            setError(err.response?.data?.error || err.message || "Database Error");
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50  p-4">
            <div className="bg-surface w-full max-w-2xl border-2 border-border rounded-xl shadow-2xl flex flex-col max-h-[90vh]">
                <div className="p-6 border-b border-border flex justify-between items-center bg-surface-elevated rounded-t-xl">
                    <h3 className="text-xl font-black uppercase tracking-tight text-foreground-strong">
                        {isCreatingNewProduct ? 'Create New Medicine' : 'Add Stock / Batch'}
                    </h3>
                    <div className="flex items-center gap-2">
                        <button
                            ref={calculatorToggleRef}
                            type="button"
                            aria-label="Toggle calculator"
                            aria-expanded={isCalculatorOpen}
                            aria-controls={isCalculatorOpen ? 'stock-calculator' : undefined}
                            onClick={() => setIsCalculatorOpen(open => !open)}
                            className={`inline-flex items-center gap-2 rounded-lg border border-border p-2 text-sm font-semibold hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-primary ${isCalculatorOpen ? 'bg-primary/10 text-primary' : 'text-muted'}`}
                        >
                            <Calculator size={18} aria-hidden="true" />
                            <span className="hidden sm:inline">Calculator</span>
                        </button>
                        <button type="button" aria-label="Close add stock" onClick={onClose} className="text-muted hover:text-foreground text-2xl leading-none">&times;</button>
                    </div>
                </div>

                <div className="p-6 space-y-6 overflow-y-auto bg-surface">
                    {/* PRODUCT SELECTOR OR CREATOR */}
                    {isCreatingNewProduct ? (
                        <div className="p-4 border-l-4 border-primary bg-primary/5 space-y-4 rounded-r-lg">
                            <div className="flex justify-between items-start">
                                <h4 className="font-bold text-primary uppercase text-sm tracking-wider">New Product Details</h4>
                                <Button size="sm" variant="ghost" className="text-xs" onClick={() => setIsCreatingNewProduct(false)}>
                                    CANCEL CREATION
                                </Button>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <Input label="Medicine Name" value={newProductName} onChange={e => setNewProductName(e.target.value)} autoFocus />
                                <Input label="Manufacturer" value={newProductManufacturer} onChange={e => setNewProductManufacturer(e.target.value)} placeholder="e.g. Cipla" />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <Input label="Composition / Salt" value={newProductComposition} onChange={e => setNewProductComposition(e.target.value)} />
                                <div className="space-y-1">
                                    <label className="text-xs font-bold text-muted uppercase tracking-wider block">Type</label>
                                    <select
                                        className="w-full bg-surface border-2 border-border rounded-lg h-10 px-3 font-bold text-sm focus:border-primary outline-none"
                                        value={newProductType}
                                        onChange={e => setNewProductType(e.target.value)}
                                    >
                                        <option value="TABLET">TABLET</option>
                                        <option value="SYRUP">SYRUP</option>
                                        <option value="INJECTION">INJECTION</option>
                                        <option value="CAPSULE">CAPSULE</option>
                                        <option value="CREAM">CREAM</option>
                                        <option value="OTHER">OTHER</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="relative">
                            <Input
                                ref={firstInputRef}
                                label="Search Product"
                                placeholder="Type to search..."
                                value={productSearch}
                                onChange={e => {
                                    setProductSearch(e.target.value);
                                    if (selectedProduct) setSelectedProduct(null);
                                }}
                                onKeyDown={handleSearchKeyDown}
                                disabled={!!selectedProduct}
                                icon={selectedProduct ? "🔒" : "🔍"}
                            />

                            {!selectedProduct && productSearch.length > 0 && (
                                <BillingSearchDropdown
                                    results={results}
                                    selectedIndex={searchIndex}
                                    onSelect={(res) => {
                                        setSelectedProduct(res.product);
                                        setProductSearch(res.product.name);
                                    }}
                                    isSearching={isSearching}
                                    allowOutOfStockSelection={true}
                                />
                            )}

                            {selectedProduct && (
                                <div className="absolute right-2 top-9">
                                    <Button size="sm" variant="ghost" onClick={() => {
                                        setSelectedProduct(null);
                                        setProductSearch('');
                                        setTimeout(() => firstInputRef.current?.focus(), 50);
                                    }}>CHANGE</Button>
                                </div>
                            )}

                            {!selectedProduct && !isSearching && productSearch.length > 1 && results.length === 0 && (
                                <div className="mt-2 p-4 bg-surface-elevated rounded border border-dashed border-border text-center">
                                    <p className="text-muted text-sm font-bold mb-2">No matching product found.</p>
                                    <Button size="sm" variant="primary" onClick={handleCreateNewProduct}>
                                        + CREATE NEW: "{productSearch}"
                                    </Button>
                                </div>
                            )}
                        </div>
                    )}

                    <div className="border-t border-border pt-6">
                        <h4 className="font-bold text-muted uppercase text-xs tracking-widest mb-4">Batch Details</h4>
                        <div className="grid grid-cols-2 gap-4">
                            <Input
                                label="Batch Number"
                                placeholder="e.g. BATCH-001"
                                value={batchNumber}
                                onChange={e => setBatchNumber(e.target.value)}
                            />
                            <Input
                                label="Expiry Date"
                                type="date"
                                value={expiryDate}
                                onChange={e => setExpiryDate(e.target.value)}
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4 mt-4">
                            <Input
                                label="Quantity"
                                type="number"
                                placeholder="0"
                                value={qty}
                                onChange={e => setQty(e.target.value)}
                            />
                            <Input
                                label="Cost Price (₹)"
                                type="number"
                                placeholder="0.00"
                                value={cost}
                                onChange={e => setCost(e.target.value)}
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4 mt-4">
                            <Input
                                label="MRP (₹)"
                                type="number"
                                placeholder="0.00"
                                value={mrp}
                                onChange={e => {
                                    setMrp(e.target.value);
                                    // Auto-fill SP with MRP if empty
                                    if (!salesRate) setSalesRate(e.target.value);
                                }}
                            />
                            <Input
                                label="Selling Price (₹)"
                                type="number"
                                placeholder="0.00"
                                value={salesRate}
                                onChange={e => setSalesRate(e.target.value)}
                            />
                        </div>
                    </div>

                    {error && (
                        <div className="bg-danger/10 border border-danger text-danger p-3 rounded text-sm font-bold text-center uppercase">
                            {error}
                        </div>
                    )}
                </div>

                <div className="p-6 border-t border-border flex justify-end gap-4 bg-surface-elevated rounded-b-xl">
                    <Button variant="ghost" onClick={onClose}>CANCEL (ESC)</Button>
                    <Button variant="primary" onClick={handleConfirm} className="h-12 px-8 font-black">
                        SAVE & ADD STOCK (ENTER)
                    </Button>
                </div>
            </div>
            {isCalculatorOpen && <FloatingCalculator onClose={() => {
                setIsCalculatorOpen(false);
                calculatorToggleRef.current?.focus();
            }} />}
        </div>
    );
};
