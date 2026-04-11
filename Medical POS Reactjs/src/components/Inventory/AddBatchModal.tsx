
import React, { useState, useEffect, useRef } from 'react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { useProductSearch } from '../../hooks/useProductSearch';
import { BillingSearchDropdown } from '../Billing/BillingSearchDropdown';
import type { Product } from '../../core/types';
import { db } from '../../db/index';

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

        // Use crypto.randomUUID for IDs
        const generateId = () => crypto.randomUUID();

        // 1. Validate Product
        let productId = selectedProduct?.id;

        if (isCreatingNewProduct) {
            if (!newProductName) { setError("Product Name is required."); return; }
            if (!newProductManufacturer) { setError("Manufacturer is required."); return; }
            // Create Product Object
            const newProduct: Product = {
                id: generateId(),
                name: newProductName,
                composition: newProductComposition,
                manufacturer: newProductManufacturer,
                type: newProductType,
                hsn_code: '3004', // Default
                gst_rate: 12,     // Default
                min_stock_alert: 10,
                is_active: true,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                last_modified: Date.now()
            };

            try {
                await db.products.add(newProduct);
                productId = newProduct.id;
            } catch (err) {
                console.error("Failed to create product", err);
                setError("Failed to create product. Name might be duplicate.");
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

        // 3. Create Batch & Inventory
        try {
            const batchId = generateId();

            await db.batches.add({
                id: batchId,
                product_id: productId,
                purchase_id: generateId(), // Dummy Purchase ID to satisfy constraint
                batch_number: batchNumber,
                expiry_date: expiryDate,
                mrp: mrpNum,
                purchase_rate: costNum,
                sales_rate: salesRateNum,
                last_modified: Date.now(),
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            });

            await db.inventory.add({
                id: generateId(),
                batch_id: batchId,
                quantity: quantityNum, // Note: Inventory uses 'quantity', types check needed
                location: 'STORE',
                last_modified: Date.now(),
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            });

            onSuccess();
            onClose();

        } catch (err: any) {
            console.error("Failed to save batch", err);
            setError(err.message || "Database Error");
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-surface w-full max-w-2xl border-2 border-border rounded-xl shadow-2xl flex flex-col max-h-[90vh]">
                <div className="p-6 border-b border-border flex justify-between items-center bg-surface-elevated rounded-t-xl">
                    <h3 className="text-xl font-black uppercase tracking-tight text-foreground-strong">
                        {isCreatingNewProduct ? 'Create New Medicine' : 'Add Stock / Batch'}
                    </h3>
                    <button onClick={onClose} className="text-muted hover:text-foreground text-2xl leading-none">&times;</button>
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
        </div>
    );
};
