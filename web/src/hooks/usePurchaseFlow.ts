import { useState, useCallback, useEffect, useRef } from "react";
import api from "../lib/api";
import { v4 as uuidv4 } from "uuid";
import type { Product } from "../core/types";
import { queryClient } from "../lib/queryClient";
import { invoiceLineTotal, type InvoiceSource } from '../services/invoiceImportCore';

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
  freeQuantity?: number;
  gstRate?: number;
  discount?: number;
  total: number;
}

export const usePurchaseFlow = (reorderOrderId?: string) => {
  const [vendorId, setVendorId] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [inwardDate, setInwardDate] = useState(localDateInput());
  const [items, setItems] = useState<PurchaseItemDraft[]>([]);
  const [importSource, setImportSource] = useState<(InvoiceSource & { requestId: string }) | null>(null);

  const createDraftItem = (item: Omit<PurchaseItemDraft, 'id' | 'total'>): PurchaseItemDraft => {
    const gst = Number(item.gstRate ?? item.product.gst_rate ?? 0);
    return { ...item, id: uuidv4(), total: invoiceLineTotal(item.quantity, item.costPrice, item.discount || 0, gst) };
  };

  const committing = useRef(false);
  const receiptAttempt = useRef<{ signature: string; id: string } | null>(null);
  const [isCommitting, setIsCommitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDraft, setIsDraft] = useState(true);

  const addItem = useCallback(
    (item: Omit<PurchaseItemDraft, "id" | "total">) => {
      const newItem = createDraftItem(item);
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
    setImportSource(null);
    setIsDraft(true);
    setError(null);
  }, []);

  const loadInvoiceDraft = (source: InvoiceSource, lines: Omit<PurchaseItemDraft, 'id' | 'total'>[]) => {
    if (committing.current || !isDraft || items.length) return;
    setItems(lines.map(createDraftItem));
    setImportSource({ filename: source.filename, sha256: source.sha256, format: source.format, requestId: uuidv4() });
    setError(null);
  };

  useEffect(() => {
    resetDraft();
    receiptAttempt.current = null;
  }, [reorderOrderId, resetDraft]);

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
        ...(reorderOrderId ? { reorder_order_id: reorderOrderId } : {}),
        ...(importSource ? { invoice_import: {
          request_id: importSource.requestId, source_sha256: importSource.sha256,
          source_filename: importSource.filename, source_format: importSource.format,
        } } : {}),
        supplier_id: vendorId,
        invoice_number: invoiceNumber,
        invoice_date: inwardDate,
        bill_image_url: null,
        notes: importSource ? `Imported ${importSource.format.toUpperCase()} invoice: ${importSource.filename}` : "Created via Web Client POS",
        items: items.map((item) => ({
          medicine_id: item.product.id,
          batch_number: item.batchNumber,
          expiry_date: item.expiryDate,
          quantity: item.quantity,
          ...(importSource ? { free_quantity: item.freeQuantity || 0 } : {}),
          purchase_price: item.costPrice,
          mrp: item.mrp,
          gst_rate: Number(item.gstRate ?? item.product.gst_rate ?? 0),
          discount: item.discount || 0,
        })),
      };

      if (reorderOrderId) {
        const signature = JSON.stringify(payload);
        if (receiptAttempt.current?.signature !== signature)
          receiptAttempt.current = { signature, id: uuidv4() };
        await api.post("/purchases", {
          ...payload,
          reorder_receipt_id: receiptAttempt.current!.id,
        });
      } else await api.post("/purchases", payload, { timeout: 120000, 'axios-retry': { retries: 0 } });
      setIsDraft(false);
      void Promise.all(
        [
          "reorder-workspace",
          "reorder-drafts",
          "reorder-order",
          "shortbook",
          "supplier-summary",
          "clinic-header-alerts",
          "billing-product-search",
          "inventory",
          "purchases",
        ].map((key) => queryClient.invalidateQueries({ queryKey: [key] })),
      );
    } catch (err: unknown) {
      console.error("Commit failed", err);
      const error = (
        err as {
          response?: { data?: { error?: string | { message?: string } } };
        }
      ).response?.data?.error;
      setError(
        typeof error === "string"
          ? error
          : error?.message ||
              (err instanceof Error ? err.message : "Commit failed"),
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
    importSource,
    loadInvoiceDraft,
  };
};
