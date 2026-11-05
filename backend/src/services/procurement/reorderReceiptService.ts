import { createHash } from "node:crypto";
import { AppError } from "../../lib/appError";
import { localMutate, queryRaw } from "../../lib/postgresDb";

export function receiptHash(input: unknown) {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

/** Shares the clinic lock with draft generation/cancellation; caller owns transaction. */
export async function findReorderReceipt(
  clinicId: string,
  requestId: string | undefined,
  hash: string,
) {
  if (!requestId)
    throw new AppError(
      400,
      "A receipt request ID is required for a linked order.",
    );
  await queryRaw("SELECT pg_advisory_xact_lock(hashtextextended(?, 0))", [
    `reorder:${clinicId}`,
  ]);
  const [previous] = await queryRaw(
    `SELECT r.payload_hash, p.* FROM reorder_receipts r
    JOIN purchases p ON p.id=r.purchase_id AND p.clinic_id=r.clinic_id
    WHERE r.clinic_id=? AND r.request_id=?`,
    [clinicId, requestId],
  );
  if (previous && previous.payload_hash !== hash)
    throw new AppError(
      409,
      "This receipt request was already used with different details.",
    );
  return previous;
}

export function receiveOrderLines(
  lines: { product_id: string; qty_ordered: number; qty_received: number }[],
  quantities: Map<string, number>,
) {
  for (const [medicineId, quantity] of quantities) {
    const line = lines.find((item) => item.product_id === medicineId);
    if (
      !line ||
      quantity > Number(line.qty_ordered) - Number(line.qty_received || 0)
    )
      throw new AppError(
        409,
        "Received quantities exceed the remaining order. Refresh the order and check quantities.",
      );
  }
  return lines.map((line) => ({
    ...line,
    qty_received:
      Number(line.qty_received || 0) + (quantities.get(line.product_id) || 0),
  }));
}

export async function applyReorderReceipt(
  clinicId: string,
  orderId: string,
  supplierId: string | null,
  items: { medicine_id: string; quantity: number; expiry_date: string }[],
) {
  const [order] = await queryRaw(
    `SELECT p.*, CURRENT_DATE::text AS stock_date FROM purchase_orders p
    JOIN supplier_message_drafts m ON m.purchase_order_id=p.id AND m.clinic_id=p.clinic_id
    WHERE p.id=? AND p.clinic_id=? AND p.deleted_at IS NULL FOR UPDATE OF p`,
    [orderId, clinicId],
  );
  if (!order) throw new AppError(404, "Reorder purchase order not found.");
  if (!["DRAFT", "SENT", "PARTIAL"].includes(order.status))
    throw new AppError(409, "This order is already received or cancelled.");
  if (order.supplier_id !== supplierId)
    throw new AppError(400, "Receipt supplier must match the purchase order.");
  if (items.some((item) => item.expiry_date < order.stock_date))
    throw new AppError(
      400,
      "Expired goods cannot be received against this order.",
    );
  const medicines = await queryRaw(
    `SELECT id, _local_id FROM medicines WHERE clinic_id=? AND deleted_at IS NULL`,
    [clinicId],
  );
  const ids = new Map<string, string>();
  for (const medicine of medicines) {
    ids.set(medicine.id, medicine.id);
    if (medicine._local_id) ids.set(medicine._local_id, medicine.id);
  }
  const quantities = new Map<string, number>();
  for (const item of items) {
    const id = ids.get(item.medicine_id);
    if (!id)
      throw new AppError(
        400,
        "Received medicine does not belong to this shop.",
      );
    quantities.set(id, (quantities.get(id) || 0) + item.quantity);
  }
  const lines = receiveOrderLines(JSON.parse(order.lines_json), quantities);
  await localMutate({
    table: "purchase_orders",
    operation: "UPDATE",
    data: {
      _local_id: order._local_id || order.id,
      lines_json: JSON.stringify(lines),
      status: lines.every((line) => line.qty_received >= line.qty_ordered)
        ? "CLOSED"
        : "PARTIAL",
    },
  });
  for (const [medicineId, quantity] of quantities) {
    let remaining = quantity;
    const requests = await queryRaw(
      `SELECT * FROM shortbook WHERE clinic_id=? AND medicine_id=?
      AND deleted_at IS NULL AND COALESCE(is_ordered,false)=false ORDER BY created_at, id FOR UPDATE`,
      [clinicId, medicineId],
    );
    for (const request of requests) {
      if (remaining <= 0) break;
      const fulfilled = Math.min(
        remaining,
        Number(request.quantity_needed || 0),
      );
      remaining -= fulfilled;
      const needed = Number(request.quantity_needed || 0) - fulfilled;
      await localMutate({
        table: "shortbook",
        operation: "UPDATE",
        data: {
          _local_id: request._local_id || request.id,
          quantity_needed: needed,
          is_ordered: needed === 0,
          ordered_at: needed === 0 ? new Date().toISOString() : null,
        },
      });
    }
  }
}
