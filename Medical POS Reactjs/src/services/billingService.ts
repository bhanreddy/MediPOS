import { db } from '../db/index';
import type { Sale, SaleItem, Product, PaymentMode, SalePaymentSplit } from '../core/types';
import { InventoryService, InsufficientStockError } from './inventoryService';
import { AuditService } from './auditService';
import { v4 as uuidv4 } from 'uuid';
import { HydrationService } from '../state/hydration';
import { insertBillWeb, addToWebSyncQueue } from '../db/webLocalDb';

/**
 * PHASE 6: BILLING ENGINE
 * Handles Cart, Calculations, and Atomic Sale Commit.
 */

export interface CartItem {
    product: Product;
    quantity: number;
    discountPercent: number; // 0-100
    /** When set, sell only from this batch (POS line) */
    batchId?: string;
    /** Tax-inclusive unit price before line discount (e.g. batch sales_rate) */
    sellingPrice?: number;
}

export interface FinalizeSaleOptions {
    supplyType: 'INTRA' | 'INTER';
    paymentSplits?: SalePaymentSplit[];
    prescriptionRxNumber?: string;
    prescriptionImageData?: string;
}

export interface BillSummary {
    totalItems: number;
    totalQuantity: number;
    totalAmount: number;
    totalDiscount: number;
    totalTax: number;
    finalAmount: number;
}

export const BillingService = {

    // --- CALCULATIONS (DETERMINISTIC) ---

    calculateItemTotal(
        item: CartItem,
        inclusiveLineUnitPrice: number,
        supplyType: 'INTRA' | 'INTER'
    ): { base: number; discount: number; tax: number; cgst: number; sgst: number; igst: number; final: number } {
        const gstRate = item.product.gst_rate || 0;
        const qty = item.quantity;
        const discountRate = item.discountPercent || 0;

        const lineGross = inclusiveLineUnitPrice * qty;
        const discountAmount = Math.round((lineGross * discountRate / 100) * 100) / 100;
        const discountedTotal = lineGross - discountAmount;

        const baseAmount = Math.round((discountedTotal / (1 + gstRate / 100)) * 100) / 100;
        const taxAmount = Math.round((discountedTotal - baseAmount) * 100) / 100;

        let cgst = 0;
        let sgst = 0;
        let igst = 0;
        if (supplyType === 'INTER') {
            igst = taxAmount;
        } else {
            cgst = Math.round((taxAmount / 2) * 100) / 100;
            sgst = Math.round((taxAmount - cgst) * 100) / 100;
        }

        return {
            base: baseAmount,
            discount: discountAmount,
            tax: taxAmount,
            cgst,
            sgst,
            igst,
            final: discountedTotal
        };
    },

    calculateBill(_cartItems: CartItem[]): BillSummary {
        let summary: BillSummary = {
            totalItems: 0,
            totalQuantity: 0,
            totalAmount: 0, // Sum of MRP
            totalDiscount: 0,
            totalTax: 0,
            finalAmount: 0 // Payable
        };

        return summary;
    },

    // --- ATOMIC TRANSACTION ---

    /**
     * THE COMMIT.
     * 1. Allocate Stock (FEFO) -> Fails if insufficient.
     * 2. Calculate Exact Amounts based on allocated batches.
     * 3. Create Sale & SaleItems.
     * 4. Deduct Inventory.
     * 5. Audit.
     */
    async finalizeSale(
        cartItems: CartItem[],
        customerId: string | undefined,
        userId: string,
        paymentMode: PaymentMode,
        options: FinalizeSaleOptions
    ): Promise<Sale> {

        if (cartItems.length === 0) throw new Error('Cart is empty');

        const scheduleHLines = cartItems.filter(c => c.product.schedule_h);
        if (scheduleHLines.length > 0) {
            const rx = (options.prescriptionRxNumber || '').trim();
            const img = (options.prescriptionImageData || '').trim();
            if (!rx || !img) {
                throw new Error('Prescription reference and image are required for Schedule H items');
            }
        }

        const splits = paymentMode === 'MIXED' ? (options.paymentSplits ?? []) : [];
        if (paymentMode === 'MIXED') {
            if (splits.length === 0) throw new Error('Add at least one payment split');
        }

        // Use Array format for tables to avoid argument limit issues
        const tables = [db.sales, db.sale_items, db.inventory, db.batches, db.audit_logs, db.app_settings, db.customers];

        const committedSale = await db.transaction('rw', tables, async () => {

            const now = new Date().toISOString();
            const saleId = uuidv4();
            const saleItemsToCreate: SaleItem[] = [];
            const inventoryAdjustments: { batchId: string, delta: number }[] = [];

            let grandTotalDiscount = 0;
            let grandTotalTax = 0;
            let grandTotalFinal = 0;
            let grandCgst = 0;
            let grandSgst = 0;
            let grandIgst = 0;

            // 1. Process Each Cart Item
            for (const item of cartItems) {

                let allocation: { batchId: string; qty: number }[];

                if (item.batchId) {
                    const batch = await db.batches.get(item.batchId);
                    if (!batch || batch.product_id !== item.product.id) {
                        throw new Error(`Invalid batch for ${item.product.name}`);
                    }
                    const invRows = await db.inventory.where('batch_id').equals(item.batchId).toArray();
                    const available = invRows.reduce((s, r) => s + r.quantity, 0);
                    if (available >= item.quantity) {
                        allocation = [{ batchId: item.batchId, qty: item.quantity }];
                    } else {
                        // Cart line may reference an empty early-expiry batch; fulfill from FEFO across all batches.
                        try {
                            allocation = await InventoryService.allocateStock(item.product.id, item.quantity);
                        } catch (err: unknown) {
                            if (err instanceof InsufficientStockError) {
                                err.productName = item.product.name;
                            }
                            throw err;
                        }
                    }
                } else {
                    try {
                        allocation = await InventoryService.allocateStock(item.product.id, item.quantity);
                    } catch (err: unknown) {
                        if (err instanceof InsufficientStockError) {
                            err.productName = item.product.name;
                        }
                        throw err;
                    }
                }

                // B. Process Allocation & Calculate Costs
                for (const alloc of allocation) {
                    const batch = await db.batches.get(alloc.batchId);
                    if (!batch) throw new Error(`Batch ${alloc.batchId} missing during commit`);

                    const fulfilledFromPreferredLine =
                        item.batchId != null &&
                        allocation.length === 1 &&
                        allocation[0].batchId === item.batchId;
                    const inclusiveUnit = fulfilledFromPreferredLine
                        ? (item.sellingPrice ?? batch.sales_rate ?? batch.mrp)
                        : (batch.sales_rate ?? batch.mrp);

                    const math = this.calculateItemTotal(
                        {
                            product: item.product,
                            quantity: alloc.qty,
                            discountPercent: item.discountPercent
                        },
                        inclusiveUnit,
                        options.supplyType
                    );

                    // C. Prepare Sale Item
                    saleItemsToCreate.push({
                        id: uuidv4(),
                        sale_id: saleId,
                        product_id: item.product.id,
                        batch_id: batch.id,
                        quantity: alloc.qty,
                        unit_price: math.final / alloc.qty, // Effective Unit Price
                        mrp: batch.mrp,
                        gst_rate: item.product.gst_rate,
                        discount_amount: math.discount,
                        tax_amount: math.tax,
                        total_amount: math.final,
                        created_at: now,
                        updated_at: now,
                        last_modified: Date.now()
                    });

                    // Accumulate Totals
                    grandTotalDiscount += math.discount;
                    grandTotalTax += math.tax;
                    grandTotalFinal += math.final;
                    grandCgst += math.cgst;
                    grandSgst += math.sgst;
                    grandIgst += math.igst;

                    // D. Prepare Inventory Deduction
                    inventoryAdjustments.push({ batchId: batch.id, delta: -alloc.qty });
                }
            }

            const roundedFinal = Math.round(grandTotalFinal * 100) / 100;

            if (paymentMode === 'MIXED') {
                const sumSplits = Math.round(splits.reduce((a, s) => a + s.amount, 0) * 100) / 100;
                if (Math.abs(sumSplits - roundedFinal) > 0.05) {
                    throw new Error('Split payment total must match bill total');
                }
            }

            // 2. Create Sale Record
            const newSale: Sale = {
                id: saleId,
                invoice_number: await this.generateInvoiceNumber(),
                customer_id: customerId,
                user_id: userId,
                total_amount: grandTotalFinal + grandTotalDiscount, // Gross
                discount_amount: grandTotalDiscount,
                tax_amount: grandTotalTax,
                final_amount: grandTotalFinal, // Net Payable
                payment_mode: paymentMode,
                payment_splits_json: paymentMode === 'MIXED' ? JSON.stringify(splits) : undefined,
                supply_type: options.supplyType,
                gst_cgst_total: Math.round(grandCgst * 100) / 100,
                gst_sgst_total: Math.round(grandSgst * 100) / 100,
                gst_igst_total: Math.round(grandIgst * 100) / 100,
                prescription_rx_number: options.prescriptionRxNumber,
                prescription_image_data: options.prescriptionImageData,
                status: 'COMPLETED',
                created_at: now,
                updated_at: now,
                last_modified: Date.now()
            };

            // 3. EXECUTE WRITES (Atomic)

            // Save Sale
            await db.sales.add(newSale);
            await AuditService.log('sales', newSale.id, 'CREATE', null, newSale);

            // Save Items
            for (const msg of saleItemsToCreate) {
                await db.sale_items.add(msg);
            }

            // 4. LOCAL Inventory Deduction (optimistic)
            // Deduct stock locally so the UI reflects updated quantities immediately.
            // The server-side FIFO deduction remains the authoritative source of truth;
            // pullDelta() will reconcile exact batch quantities from the server later.
            for (const adj of inventoryAdjustments) {
                const invItems = await db.inventory.where('batch_id').equals(adj.batchId).toArray();
                if (invItems.length > 0) {
                    const targetInv = invItems[0];
                    const newQty = Math.max(0, targetInv.quantity + adj.delta);
                    await db.inventory.update(targetInv.id, {
                        quantity: newQty,
                        updated_at: now,
                        last_modified: Date.now()
                    });
                }
            }

            let dueAmount = 0;
            if (paymentMode === 'DUE') {
                dueAmount = roundedFinal;
            } else if (paymentMode === 'MIXED') {
                dueAmount = Math.round(splits.filter(s => s.mode === 'DUE').reduce((a, s) => a + s.amount, 0) * 100) / 100;
            }

            if (dueAmount > 0 && customerId) {
                const cust = await db.customers.get(customerId);
                if (cust) {
                    const limit = cust.credit_limit ?? 0;
                    const bal = cust.credit_balance ?? 0;
                    if (limit > 0 && bal + dueAmount > limit + 0.05) {
                        throw new Error('Customer credit limit exceeded');
                    }
                    await db.customers.update(customerId, {
                        credit_balance: Math.round((bal + dueAmount) * 100) / 100,
                        updated_at: now,
                        last_modified: Date.now()
                    });
                }
            }

            return newSale;
        });

        // 4. Update Redux Mirror (Post-Commit)
        await HydrationService.hydrateSales();
        await HydrationService.hydrateCustomers();
        await HydrationService.hydrateInventory();

        // 5. Add to Offline Sync Queue (for server-side FIFO deduction)
        const items = await db.sale_items.where('sale_id').equals(committedSale.id).toArray();
        const syncPayload = {
            ...committedSale,
            clinic_id: 'LOCAL_CLINIC', // Re-validated on server
            items: items
        };

        await insertBillWeb(syncPayload);
        await addToWebSyncQueue('CREATE_BILL', syncPayload);

        return committedSale;
    },

    // --- HELPERS ---

    async generateInvoiceNumber(): Promise<string> {
        // Phase 6: Simple Offline Counter
        // user_id prefix + timestamp? Or just counter?
        // Let's use Year + Counter for simplicity and collision resistance (locally).
        // Better: UUID or DeviceID + Counter. 
        // Requirement: "Sequential per device or shop".

        // We count existing sales today?
        const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const count = await db.sales.count(); // Global count for now
        return `INV-${today}-${(count + 1).toString().padStart(4, '0')}`;
    }
};
