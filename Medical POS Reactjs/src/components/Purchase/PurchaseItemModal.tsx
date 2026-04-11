import React, { useState, useEffect, useRef } from 'react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { useProductSearch } from '../../hooks/useProductSearch';
import { BillingSearchDropdown } from '../Billing/BillingSearchDropdown';
import type { Product } from '../../core/types';

interface PurchaseItemModalProps {
    isOpen: boolean;
    onClose: () => void;
    onAdd: (item: {
        product: Product;
        batchNumber: string;
        expiryDate: string;
        quantity: number;
        costPrice: number;
        mrp: number;
    }) => void;
}

export const PurchaseItemModal: React.FC<PurchaseItemModalProps> = ({ isOpen, onClose, onAdd }) => {
    const [productSearch, setProductSearch] = useState('');
    const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

    // Search Hook
    const { results, isSearching } = useProductSearch(productSearch);
    const [searchIndex, setSearchIndex] = useState(0);

    // Fields
    const [batchNumber, setBatchNumber] = useState('');
    const [expiryDate, setExpiryDate] = useState('');
    const [qty, setQty] = useState('');
    const [cost, setCost] = useState('');
    const [mrp, setMrp] = useState('');

    const [error, setError] = useState('');
    const firstInputRef = useRef<HTMLInputElement>(null);

    // Reset on Open
    useEffect(() => {
        if (isOpen) {
            setProductSearch('');
            setSelectedProduct(null);
            setBatchNumber('');
            setExpiryDate('');
            setQty('');
            setCost('');
            setMrp('');
            setError('');
            // Focus hack
            setTimeout(() => firstInputRef.current?.focus(), 100);
        }
    }, [isOpen]);

    // Keyboard Nav for Search
    const handleSearchKeyDown = (e: React.KeyboardEvent) => {
        if (selectedProduct) return; // Search done

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

    const handleConfirm = () => {
        if (!selectedProduct) {
            setError("Select a valid product.");
            return;
        }
        if (!batchNumber) {
            setError("Batch number is required.");
            return;
        }
        if (!expiryDate) {
            setError("Expiry date is required.");
            return;
        }

        // Expiry Validation (Simple check: Not in past?)
        const today = new Date().toISOString().split('T')[0];
        if (expiryDate < today) {
            setError("Cannot inward expired goods.");
            return;
        }

        const quantityNum = Number(qty);
        const costNum = Number(cost);
        const mrpNum = Number(mrp);

        if (!quantityNum || quantityNum <= 0) {
            setError("Quantity must be > 0.");
            return;
        }
        if (!costNum || costNum <= 0) {
            setError("Cost must be > 0.");
            return;
        }
        if (!mrpNum || mrpNum < costNum) {
            setError("MRP must be >= Cost Price.");
            return; // Strict rule: MRP >= Cost
        }

        onAdd({
            product: selectedProduct,
            batchNumber,
            expiryDate,
            quantity: quantityNum,
            costPrice: costNum,
            mrp: mrpNum
        });
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-surface w-full max-w-2xl border-2 border-border rounded-xl shadow-2xl flex flex-col max-h-[90vh]">
                <div className="p-6 border-b border-border flex justify-between items-center">
                    <h3 className="text-xl font-black uppercase tracking-tight text-foreground-strong">Add Invoice Item</h3>
                    <button onClick={onClose} className="text-muted hover:text-foreground text-2xl leading-none">&times;</button>
                </div>

                <div className="p-6 space-y-6 overflow-y-auto">
                    {/* PRODUCT SELECTOR */}
                    <div className="relative">
                        <Input
                            ref={firstInputRef}
                            label="Product (Search)"
                            placeholder="Type to search..."
                            value={productSearch}
                            onChange={e => {
                                setProductSearch(e.target.value);
                                if (selectedProduct) setSelectedProduct(null); // Reset if typing again
                            }}
                            onKeyDown={handleSearchKeyDown}
                            disabled={!!selectedProduct}
                            icon={selectedProduct ? "🔒" : "🔍"}
                        />
                        {/* Reuse Search Dropdown */}
                        {!selectedProduct && productSearch.length > 0 && (
                            <BillingSearchDropdown
                                results={results}
                                selectedIndex={searchIndex}
                                onSelect={(res) => {
                                    setSelectedProduct(res.product);
                                    setProductSearch(res.product.name);
                                }}
                                isSearching={isSearching}
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
                    </div>

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

                    <div className="grid grid-cols-3 gap-4">
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
                        <Input
                            label="MRP (₹)"
                            type="number"
                            placeholder="0.00"
                            value={mrp}
                            onChange={e => setMrp(e.target.value)}
                        />
                    </div>

                    {error && (
                        <div className="bg-danger/10 border border-danger text-danger p-3 rounded text-sm font-bold text-center uppercase">
                            {error}
                        </div>
                    )}
                </div>

                <div className="p-6 border-t border-border flex justify-end gap-4 bg-surface-elevated rounded-b-xl">
                    <Button variant="ghost" onClick={onClose}>CANCEL (ESC)</Button>
                    <Button variant="primary" onClick={handleConfirm}>CONFIRM ADD (ENTER)</Button>
                </div>
            </div>
        </div>
    );
};
