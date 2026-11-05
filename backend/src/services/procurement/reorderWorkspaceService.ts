import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { AppError } from "../../lib/appError";
import { localMutate, queryRaw } from "../../lib/postgresDb";
import {
  outstandingByMedicine,
  planReorder,
  type ReorderSource,
} from "./reorderPlanner";
import {
  renderSupplierOrderMessage,
  type SupplierOrderMessage,
} from "./supplierMessaging";

export const createReorderDraftsSchema = z
  .object({
    request_id: z.string().uuid(),
    budget: z.number().finite().positive().max(100000000).optional(),
    notes: z.string().trim().max(1000).default(""),
    lines: z
      .array(
        z.object({
          medicine_id: z.string().uuid(),
          supplier_id: z.string().uuid(),
          quantity: z.number().int().positive().max(1000000),
        }),
      )
      .min(1)
      .max(500),
  })
  .superRefine((input, ctx) => {
    if (
      new Set(input.lines.map((line) => line.medicine_id)).size !==
      input.lines.length
    )
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Each medicine may only appear once.",
      });
  });

export async function getReorderWorkspace(clinicId: string) {
  const [sources, orders, suppliers, quotes, enterpriseIncoming] =
    await Promise.all([
      queryRaw<ReorderSource & { _local_id?: string; unit: string }>(
        `
      SELECT m.id AS medicine_id, m._local_id, m.name, m.generic_name, COALESCE(m.unit, 'stock units') AS unit,
        COALESCE(shortage.preferred_supplier_id, m.preferred_supplier_id) AS preferred_supplier_id, COALESCE(m.low_stock_threshold, 0) AS threshold,
        COALESCE(stock.available, 0) AS available, COALESCE(stock.expiring, 0) AS expiring,
        COALESCE(demand.sold, 0) AS sold_30d, COALESCE(shortage.requested, 0) AS requested,
        5 AS lead_time_days
      FROM medicines m
      LEFT JOIN (
        SELECT medicine_id,
          SUM(CASE WHEN expiry_date >= CURRENT_DATE THEN quantity_remaining ELSE 0 END) AS available,
          SUM(CASE WHEN expiry_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 60 THEN quantity_remaining ELSE 0 END) AS expiring
        FROM medicine_batches WHERE clinic_id=? AND deleted_at IS NULL AND COALESCE(is_disposed, false)=false GROUP BY medicine_id
      ) stock ON stock.medicine_id=m.id
      LEFT JOIN (
        SELECT si.medicine_id, GREATEST(0, SUM(CASE WHEN COALESCE(s.is_return, false) THEN -ABS(si.quantity) ELSE si.quantity END)) AS sold
        FROM sale_items si JOIN sales s ON s.id=si.sale_id AND s.clinic_id=si.clinic_id
        WHERE si.clinic_id=? AND si.deleted_at IS NULL AND s.deleted_at IS NULL
          AND s.created_at >= now() - interval '30 days' GROUP BY si.medicine_id
      ) demand ON demand.medicine_id=m.id
      LEFT JOIN (
        SELECT medicine_id, SUM(COALESCE(quantity_needed, 0)) AS requested,
          (ARRAY_AGG(preferred_supplier_id ORDER BY created_at DESC, id DESC) FILTER (WHERE preferred_supplier_id IS NOT NULL))[1] AS preferred_supplier_id FROM shortbook
        WHERE clinic_id=? AND deleted_at IS NULL AND COALESCE(is_ordered, false)=false GROUP BY medicine_id
      ) shortage ON shortage.medicine_id=m.id
      WHERE m.clinic_id=? AND m.deleted_at IS NULL AND COALESCE(m.is_active, true)=true
      ORDER BY m.name, m.id`,
        [clinicId, clinicId, clinicId, clinicId],
      ),
      queryRaw<{ id: string; lines_json: string }>(
        `SELECT id, lines_json FROM purchase_orders WHERE clinic_id=? AND deleted_at IS NULL
      AND status IN ('DRAFT','SENT','PARTIAL','SUBMITTED','APPROVED','CONFIRMED','PARTIALLY_RECEIVED')`,
        [clinicId],
      ),
      queryRaw(
        `SELECT * FROM suppliers WHERE clinic_id=? AND deleted_at IS NULL AND COALESCE(is_active, true)=true ORDER BY name, id`,
        [clinicId],
      ),
      queryRaw<{
        medicine_id: string;
        supplier_id: string;
        price: number;
        observed_at: string;
      }>(
        `
      SELECT DISTINCT ON (b.medicine_id, b.supplier_id) b.medicine_id, b.supplier_id,
        b.purchase_price AS price, b.created_at AS observed_at
      FROM medicine_batches b JOIN suppliers s ON s.id=b.supplier_id AND s.clinic_id=b.clinic_id
      WHERE b.clinic_id=? AND b.deleted_at IS NULL AND s.deleted_at IS NULL AND COALESCE(s.is_active, true)=true
        AND b.created_at >= now() - interval '180 days'
      ORDER BY b.medicine_id, b.supplier_id, b.created_at DESC, b.id DESC`,
        [clinicId],
      ),
      queryRaw<{ po_id: string; medicine_id: string; incoming: number }>(
        `
      SELECT i.po_id, i.medicine_id, SUM(GREATEST(0, i.ordered_quantity-COALESCE(i.received_quantity,0))) AS incoming
      FROM purchase_order_items i JOIN purchase_orders p ON p.id=i.po_id
      WHERE p.clinic_id=? AND p.deleted_at IS NULL AND p.status IN
        ('DRAFT','SENT','PARTIAL','SUBMITTED','APPROVED','CONFIRMED','PARTIALLY_RECEIVED') GROUP BY i.po_id, i.medicine_id`,
        [clinicId],
      ),
    ]);
  // Enterprise orders use relational lines; simple orders use lines_json. Never add both representations.
  const relationalOrders = new Set(enterpriseIncoming.map((row) => row.po_id));
  const incoming = outstandingByMedicine(
    orders.filter((order) => !relationalOrders.has(order.id)),
  );
  for (const row of enterpriseIncoming)
    incoming.set(
      row.medicine_id,
      (incoming.get(row.medicine_id) || 0) + Number(row.incoming),
    );
  const supplierMap = new Map(suppliers.map((s) => [s.id, s]));
  const quotesByMedicine = new Map<string, typeof quotes>();
  for (const quote of quotes) {
    const price = Number(quote.price);
    if (!Number.isFinite(price) || price < 0) continue;
    const list = quotesByMedicine.get(quote.medicine_id) || [];
    list.push({ ...quote, price });
    quotesByMedicine.set(quote.medicine_id, list);
  }
  const candidates = sources
    .map((source) => {
      const options = (quotesByMedicine.get(source.medicine_id) || []).sort(
        (a, b) => a.price - b.price,
      );
      const supplierId = supplierMap.has(source.preferred_supplier_id)
        ? source.preferred_supplier_id!
        : options[0]?.supplier_id || "";
      return {
        ...planReorder({
          ...source,
          incoming:
            (incoming.get(source.medicine_id) || 0) +
            (source._local_id ? incoming.get(source._local_id) || 0 : 0),
          preferred_supplier_id: supplierId,
          lead_time_days: supplierMap.get(supplierId)?.lead_time_days || 5,
          last_price:
            options.find((q) => q.supplier_id === supplierId)?.price ?? null,
        }),
        unit: source.unit,
        quotes: options,
      };
    })
    .filter(
      (row) =>
        row.recommendedQuantity > 0 ||
        row.requestedQuantity > 0 ||
        row.incomingStock > 0,
    );
  const ranks: Record<string, number> = { critical: 0, urgent: 1, planned: 2 };
  candidates.sort(
    (a, b) =>
      ranks[a.priority] - ranks[b.priority] ||
      a.medicineName.localeCompare(b.medicineName),
  );
  return {
    candidates,
    suppliers,
    openOrderCount: orders.length,
    generatedAt: new Date().toISOString(),
  };
}

/** Caller owns the PostgreSQL transaction. No network/message sends occur here. */
export async function createReorderDrafts(
  clinicId: string,
  input: z.infer<typeof createReorderDraftsSchema>,
) {
  await queryRaw(`SELECT pg_advisory_xact_lock(hashtextextended(?, 0))`, [
    `reorder:${clinicId}`,
  ]);
  const payloadHash = createHash("sha256")
    .update(JSON.stringify({ ...input, request_id: undefined }))
    .digest("hex");
  const [previous] = await queryRaw(
    `SELECT payload_hash, result_json FROM reorder_requests WHERE clinic_id=? AND request_id=?`,
    [clinicId, input.request_id],
  );
  if (previous) {
    if (previous.payload_hash !== payloadHash)
      throw new AppError(
        409,
        "This request was already used for a different order. Refresh and try again.",
      );
    return previous.result_json;
  }
  const workspace = await getReorderWorkspace(clinicId);
  const candidates = new Map(
    workspace.candidates.map((item) => [item.medicineId, item]),
  );
  const suppliers = new Map(
    workspace.suppliers.map((supplier) => [supplier.id, supplier]),
  );
  const grouped = new Map<
    string,
    {
      product_id: string;
      product_name: string;
      qty_ordered: number;
      qty_received: number;
      expected_rate?: number;
      unit: string;
    }[]
  >();
  let totalPaise = 0;
  for (const line of input.lines) {
    const candidate = candidates.get(line.medicine_id);
    if (!candidate || line.quantity > candidate.recommendedQuantity)
      throw new AppError(
        409,
        "Stock or pending orders changed. Refresh and review quantities before saving.",
      );
    if (!suppliers.has(line.supplier_id))
      throw new AppError(400, "Choose an active supplier in this shop.");
    const price = candidate.quotes.find(
      (q) => q.supplier_id === line.supplier_id,
    )?.price;
    if (input.budget && price == null)
      throw new AppError(
        400,
        "A budget cannot be verified for items without a recorded supplier rate. Remove the budget or choose a supplier with a rate.",
      );
    if (price != null) totalPaise += Math.round(price * 100) * line.quantity;
    const lines = grouped.get(line.supplier_id) || [];
    lines.push({
      product_id: line.medicine_id,
      product_name: candidate.medicineName,
      qty_ordered: line.quantity,
      qty_received: 0,
      expected_rate: price,
      unit: candidate.unit,
    });
    grouped.set(line.supplier_id, lines);
  }
  if (input.budget && totalPaise > Math.round(input.budget * 100))
    throw new AppError(400, "Selected items exceed your purchase budget.");
  const result = [];
  for (const [supplierId, lines] of grouped) {
    const supplier = suppliers.get(supplierId)!;
    const poNumber = `PO-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${randomUUID().slice(0, 8).toUpperCase()}`;
    const order = await localMutate({
      table: "purchase_orders",
      operation: "INSERT",
      data: {
        clinic_id: clinicId,
        supplier_id: supplierId,
        po_number: poNumber,
        status: "DRAFT",
        order_date: new Date().toISOString().slice(0, 10),
        notes: input.notes || null,
        lines_json: JSON.stringify(lines),
      },
    });
    const payload: SupplierOrderMessage = {
      version: 1,
      orderNumber: poNumber,
      supplierName: supplier.name,
      items: lines.map((line) => ({
        name: line.product_name,
        quantity: line.qty_ordered,
        unit: line.unit,
      })),
      notes: input.notes,
    };
    const body = renderSupplierOrderMessage(payload);
    const channel =
      supplier.preferred_channel === "WHATSAPP" &&
      supplier.whatsapp_opt_in &&
      supplier.phone
        ? "WHATSAPP"
        : supplier.preferred_channel === "SMS" &&
            supplier.sms_opt_in &&
            supplier.phone
          ? "SMS"
          : "MANUAL";
    await queryRaw(
      `INSERT INTO supplier_message_drafts
      (clinic_id,purchase_order_id,supplier_id,channel,recipient,payload_json,body,idempotency_key)
      VALUES (?,?,?,?,?,?::text::jsonb,?,?)`,
      [
        clinicId,
        order.id,
        supplierId,
        channel,
        supplier.phone || null,
        JSON.stringify(payload),
        body,
        `supplier-order:${clinicId}:${order.id}:v1`,
      ],
    );
    result.push({
      id: order.id,
      po_number: poNumber,
      supplier_name: supplier.name,
      supplier_id: supplierId,
      status: "DRAFT",
      body,
      channel,
    });
  }
  // Shortbook remains open until stock is received. Drafts reserve demand through incoming quantities.
  await queryRaw(
    `INSERT INTO reorder_requests (clinic_id,request_id,payload_hash,result_json) VALUES (?,?,?,?::text::jsonb)`,
    [clinicId, input.request_id, payloadHash, JSON.stringify(result)],
  );
  return result;
}
