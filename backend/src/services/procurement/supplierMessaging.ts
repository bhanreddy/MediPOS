export type SupplierChannel = "MANUAL" | "WHATSAPP" | "SMS";
export interface SupplierOrderMessage {
  version: 1;
  orderNumber: string;
  supplierName: string;
  items: { name: string; quantity: number; unit: string }[];
  notes: string;
}

/** A provider must use the persisted idempotency key and return its delivery ID.
 * Dispatch must recheck supplier consent, order status and current recipient.
 * Provider acceptance is SENT; only verified callbacks may mark DELIVERED.
 */
export interface SupplierMessageProvider {
  channel: Exclude<SupplierChannel, "MANUAL">;
  send(message: {
    recipient: string;
    templateKey: string;
    payload: SupplierOrderMessage;
    idempotencyKey: string;
  }): Promise<{ providerMessageId: string }>;
}

export function renderSupplierOrderMessage(
  payload: SupplierOrderMessage,
): string {
  return [
    `Hello ${payload.supplierName},`,
    `Please confirm availability and rates for ${payload.orderNumber}:`,
    ...payload.items.map(
      (item, index) =>
        `${index + 1}. ${item.name} — ${item.quantity} ${item.unit}`,
    ),
    "Please confirm delivery date, final prices, and adequate expiry before dispatch.",
    ...(payload.notes ? [`Notes: ${payload.notes}`] : []),
  ].join("\n");
}

/** Partial-delivery previews must never request the original quantity again. */
export function currentOrderMessage<
  T extends {
    status: string;
    lines_json: string;
    supplier_name: string;
    po_number: string;
    body: string;
  },
>(order: T): T {
  if (order.status !== "PARTIAL") return order;
  const lines: {
    product_name: string;
    qty_ordered: number;
    qty_received: number;
    unit?: string;
  }[] = JSON.parse(order.lines_json);
  const remaining = lines.filter(
    (line) => Number(line.qty_ordered) > Number(line.qty_received || 0),
  );
  return {
    ...order,
    body: [
      `Hello ${order.supplier_name},`,
      `Please confirm the remaining delivery for existing order ${order.po_number}:`,
      ...remaining.map(
        (line, index) =>
          `${index + 1}. ${line.product_name} — ${Number(line.qty_ordered) - Number(line.qty_received || 0)} ${line.unit || "stock units"} remaining`,
      ),
      "This is a follow-up on the existing order. Please do not create a duplicate order.",
    ].join("\n"),
  };
}
