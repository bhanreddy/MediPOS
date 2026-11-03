import React, { useState, useRef, useId } from "react";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Modal";
import { Input } from "../ui/Input";
import { useProductSearch } from "../../hooks/useProductSearch";
import { BillingSearchDropdown } from "../Billing/BillingSearchDropdown";
import type { Product } from "../../core/types";

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

const PurchaseItemForm: React.FC<PurchaseItemModalProps> = ({
  isOpen,
  onClose,
  onAdd,
}) => {
  const formId = useId();
  const [productSearch, setProductSearch] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  // Search Hook
  const { results, isSearching } = useProductSearch(productSearch);
  const [searchIndex, setSearchIndex] = useState(0);

  // Fields
  const [batchNumber, setBatchNumber] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [qty, setQty] = useState("");
  const [cost, setCost] = useState("");
  const [mrp, setMrp] = useState("");

  const [error, setError] = useState("");
  const firstInputRef = useRef<HTMLInputElement>(null);

  // Keyboard Nav for Search
  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (selectedProduct) return; // Search done

    if (results.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSearchIndex((prev) => Math.min(prev + 1, results.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSearchIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === "Enter") {
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
    if (!batchNumber.trim()) {
      setError("Batch number is required.");
      return;
    }
    if (!expiryDate) {
      setError("Expiry date is required.");
      return;
    }

    // Expiry Validation (Simple check: Not in past?)
    const today = new Date().toISOString().split("T")[0];
    if (expiryDate < today) {
      setError("Cannot inward expired goods.");
      return;
    }

    const quantityNum = Number(qty);
    const costNum = Number(cost);
    const mrpNum = Number(mrp);

    if (!Number.isFinite(quantityNum) || quantityNum <= 0) {
      setError("Quantity must be > 0.");
      return;
    }
    if (!Number.isFinite(costNum) || costNum <= 0) {
      setError("Cost must be > 0.");
      return;
    }
    if (!Number.isFinite(mrpNum) || mrpNum < costNum) {
      setError("MRP must be >= Cost Price.");
      return; // Strict rule: MRP >= Cost
    }

    onAdd({
      product: selectedProduct,
      batchNumber: batchNumber.trim(),
      expiryDate,
      quantity: quantityNum,
      costPrice: costNum,
      mrp: mrpNum,
    });
    onClose();
  };

  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add purchase item" footer={<>
      <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
      <Button type="submit" form={formId}>Add item</Button>
    </>}>
      <form id={formId} onSubmit={event => { event.preventDefault(); handleConfirm(); }} className="space-y-5">
          {/* PRODUCT SELECTOR */}
          <div className="relative">
            <Input
              ref={firstInputRef}
              label="Product (Search)"
              placeholder="Type to search..."
              value={productSearch}
              onChange={(e) => {
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
                <Button
                  size="sm"
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setSelectedProduct(null);
                    setProductSearch("");
                    setTimeout(() => firstInputRef.current?.focus(), 50);
                  }}
                >
                  Change
                </Button>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Batch Number"
              required maxLength={100}
              placeholder="e.g. BATCH-001"
              value={batchNumber}
              onChange={(e) => setBatchNumber(e.target.value)}
            />
            <Input
              label="Expiry Date"
              required
              type="date"
              value={expiryDate}
              onChange={(e) => setExpiryDate(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <Input
              label="Quantity"
              required min="0.001" step="any"
              type="number"
              placeholder="0"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
            />
            <Input
              label="Cost Price (₹)"
              required min="0.01" step="0.01"
              type="number"
              placeholder="0.00"
              value={cost}
              onChange={(e) => setCost(e.target.value)}
            />
            <Input
              label="MRP (₹)"
              required min="0.01" step="0.01"
              type="number"
              placeholder="0.00"
              value={mrp}
              onChange={(e) => setMrp(e.target.value)}
            />
          </div>

          {error && (
            <div role="alert" className="bg-danger/10 border border-danger text-danger p-3 rounded text-sm font-bold text-center uppercase">
              {error}
            </div>
          )}
      </form>
    </Modal>
  );
};

export const PurchaseItemModal: React.FC<PurchaseItemModalProps> = props =>
  props.isOpen ? <PurchaseItemForm {...props} /> : null;
