import api from "../lib/api";
import type { Sale, Product, PaymentMode } from "../core/types";

export interface CartItem {
  product: Pick<Product, "id" | "_local_id" | "gst_rate">;
  quantity: number;
  discountPercent: number; // 0-100
  batchId?: string;
  allocationMode?: "auto" | "manual";
  sellingPrice?: number;
}

export interface FinalizeSaleOptions {
  supplyType: "INTRA" | "INTER";
  paidAmount?: number;
  walletAmountPaise?: number;
  requestId?: string;
  billDiscount?: number;
  isBillDiscountPercentage?: boolean;
  expectedTotalPaise?: number;
  paymentSplits?: Array<{ tender_type: 'CASH' | 'UPI' | 'CARD' | 'CREDIT'; amount_paise: number; reference_number?: string }>;
  requireRegister?: boolean;
  parkId?: string | null;
  discountReason?: string;
  discountApprovalId?: string | null;
  prescriptionId?: string;
  dispensingAttestation?: {
    signed_original_checked: true; annotated_and_signed: true; prescription_register?: string;
    h1_register?: string; x_register_page?: string; x_duplicate_reference?: string;
  };
  placeOfSupply?: string;
  deliveryAddress?: string;
  prescriptionRxNumber?: string;
  prescriptionImageData?: string;
}

export const BillingService = {
  async finalizeSale(
    cartItems: CartItem[],
    customerId: string | undefined,
    _userId: string,
    paymentMode: PaymentMode,
    options: FinalizeSaleOptions,
  ): Promise<Sale> {
    let backendMode: "cash" | "upi" | "card" | "credit" = "cash";
    if (paymentMode === "UPI") backendMode = "upi";
    else if (paymentMode === "CARD") backendMode = "card";
    else if (paymentMode === "DUE") backendMode = "credit";

    let paymentStatus: "paid" | "partial" | "credit" = "paid";
    if (paymentMode === "DUE") paymentStatus = "credit";

    const itemsPayload = cartItems.map((item) => ({
      medicine_id: item.product.id || item.product._local_id,
      batch_id: item.batchId,
      allocation_mode: item.allocationMode || (item.batchId ? "manual" : "auto"),
      quantity: item.quantity,
      mrp: Number(item.sellingPrice || 0),
      discount_pct: Number(item.discountPercent || 0),
      gst_rate: Number(item.product.gst_rate || 0),
    }));

    let paidAmount =
      options.paidAmount ??
      Math.round(
        itemsPayload.reduce(
          (sum, item) =>
            sum +
            Math.round(
              item.quantity * item.mrp * (1 - item.discount_pct / 100) * 100,
            ) /
              100,
          0,
        ) * 100,
      ) / 100;
    if (paymentMode === "DUE" && options.paidAmount === undefined) {
      paidAmount = 0;
    }

    const payload = {
      price_includes_tax: true,
      customer_id: customerId || null,
      discount: options.billDiscount || 0,
      is_bill_discount_percentage: !!options.isBillDiscountPercentage,
      expected_total_paise: options.expectedTotalPaise,
      payment_mode: backendMode,
      payment_status: paymentStatus,
      paid_amount: paidAmount,
      items: itemsPayload,
      payments: options.paymentSplits,
      register_required: options.requireRegister,
      park_id: options.parkId || undefined,
      discount_reason: options.discountReason?.trim() || undefined,
      discount_approval_id: options.discountApprovalId || undefined,
      prescription_id: options.prescriptionId || undefined,
      dispensing_attestation: options.dispensingAttestation,
      place_of_supply_state_code: options.placeOfSupply || undefined,
      delivery_address: options.deliveryAddress || undefined,
      ...(options.walletAmountPaise ? { wallet_amount_paise: options.walletAmountPaise } : {}),
      ...(options.requestId ? { _local_id: options.requestId } : {}),
    };

    const res = await api.post("/sales", payload, {
      "axios-retry": { retries: 0 },
    });
    const sale = res.data?.data;
    return {
      ...sale,
      id: sale._local_id || sale.id,
    };
  },
};
