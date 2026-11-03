import { useState, useCallback, useRef } from "react";
import api from "../lib/api";
import { v4 as uuidv4 } from "uuid";
import type { Product } from "../core/types";

function localDateInput() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
}

export interface PurchaseItemDraft {
  id: string; // Temp ID for draft manipulation
  product: Product;
  batchNumber: string;
  expiryDate: string; // YYYY-MM-DD
  quantity: number;
  costPrice: number;
  mrp: number;
  total: number;
}

export const usePurchaseFlow = () => {
  const [vendorId, setVendorId] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [inwardDate, setInwardDate] = useState(localDateInput());
  const [items, setItems] = useState<PurchaseItemDraft[]>([]);

  const committing = useRef(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDraft, setIsDraft] = useState(true);

  const addItem = useCallback(
    (item: Omit<PurchaseItemDraft, "id" | "total">) => {
      const newItem: PurchaseItemDraft = {
        ...item,
        id: uuidv4(),
        total:
          Math.round(
            item.quantity *
              item.costPrice *
              (1 + Number(item.product.gst_rate || 0) / 100) *
              100,
          ) / 100,
      };
      setItems((prev) => [...prev, newItem]);
    },
    [],
  );

  const removeItem = useCallback((id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
  }, []);

  const resetDraft = useCallback(() => {
    setVendorId("");
    setInvoiceNumber("");
    setInwardDate(localDateInput());
    setItems([]);
    setIsDraft(true);
    setError(null);
  }, []);

  const commitToLedger = async () => {
    if (committing.current || !isDraft) return;
    if (!vendorId) {
      setError("Vendor is required.");
      return;
    }
    if (!invoiceNumber) {
      setError("Invoice Number is required.");
      return;
    }
    if (items.length === 0) {
      setError("No items to commit.");
      return;
    }

    committing.current = true;
    setIsCommitting(true);
    setError(null);

    try {
      const payload = {
        supplier_id: vendorId,
        invoice_number: invoiceNumber,
        invoice_date: inwardDate,
        bill_image_url: null,
        notes: "Created via Web Client POS",
        items: items.map((item) => ({
          medicine_id: item.product.id,
          batch_number: item.batchNumber,
          expiry_date: item.expiryDate,
          quantity: item.quantity,
          purchase_price: item.costPrice,
          mrp: item.mrp,
          gst_rate: item.product.gst_rate || 0,
          discount: 0,
        })),
      };

      await api.post("/purchases", payload);
      setIsDraft(false);
    } catch (err: any) {
      console.error("Commit failed", err);
      const error = err.response?.data?.error;
      setError(
        typeof error === "string"
          ? error
          : error?.message || err.message || "Commit failed",
      );
    } finally {
      committing.current = false;
      setIsCommitting(false);
    }
  };

  return {
    vendorId,
    setVendorId,
    invoiceNumber,
    setInvoiceNumber,
    inwardDate,
    setInwardDate,
    items,
    addItem,
    removeItem,
    commitToLedger,
    isCommitting,
    error,
    isDraft,
    resetDraft,
  };
};
