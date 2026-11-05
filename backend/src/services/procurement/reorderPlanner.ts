export interface ReorderSource {
  medicine_id: string;
  name: string;
  generic_name?: string;
  available: number;
  sold_30d: number;
  threshold: number;
  requested: number;
  incoming: number;
  preferred_supplier_id?: string | null;
  lead_time_days: number;
  last_price?: number | null;
  expiring: number;
}

/** All quantities use the same stock unit as medicine_batches.quantity_remaining. */
export function planReorder(source: ReorderSource, coverageDays = 14) {
  const available = Math.max(0, Number(source.available) || 0);
  const incoming = Math.max(0, Number(source.incoming) || 0);
  const dailyDemand = Math.max(0, Number(source.sold_30d) || 0) / 30;
  const threshold = Math.max(0, Number(source.threshold) || 0);
  const requested = Math.max(0, Number(source.requested) || 0);
  const leadDays = Math.max(1, Number(source.lead_time_days) || 5);
  const daysCover =
    dailyDemand > 0 ? Math.round((available / dailyDemand) * 10) / 10 : null;
  const reorderPoint = Math.max(
    threshold,
    Math.ceil(dailyDemand * (leadDays + 3)),
  );
  const targetStock = Math.max(
    threshold,
    Math.ceil(dailyDemand * (leadDays + coverageDays)),
  );
  // Manual shortages and forecast deficits overlap; summing them would double order.
  const needed =
    available <= reorderPoint ? Math.max(0, targetStock - available) : 0;
  const recommendedQuantity = Math.max(
    0,
    Math.ceil(Math.max(needed, requested) - incoming),
  );
  const price = source.last_price == null ? null : Number(source.last_price);
  return {
    medicineId: source.medicine_id,
    medicineName: source.name,
    genericName: source.generic_name || "",
    availableStock: available,
    incomingStock: incoming,
    dailyDemand,
    daysCover,
    reorderPoint,
    recommendedQuantity,
    requestedQuantity: requested,
    leadTimeDays: leadDays,
    supplierId: source.preferred_supplier_id || "",
    lastPrice:
      price != null && Number.isFinite(price) && price >= 0 ? price : null,
    expiringStock: Math.max(0, Number(source.expiring) || 0),
    priority:
      available === 0
        ? "critical"
        : daysCover != null && daysCover <= leadDays
          ? "urgent"
          : "planned",
    reason:
      requested > 0
        ? "Shortbook request"
        : dailyDemand > 0
          ? "Demand & lead time"
          : "Minimum stock level",
  };
}

export type ReorderCandidate = ReturnType<typeof planReorder>;

export function outstandingByMedicine(orders: { lines_json: string }[]) {
  const incoming = new Map<string, number>();
  for (const order of orders) {
    let lines: unknown;
    try {
      lines = JSON.parse(order.lines_json);
    } catch {
      continue;
    }
    if (!Array.isArray(lines)) continue;
    for (const line of lines) {
      if (!line || typeof line.product_id !== "string") continue;
      const ordered = Number(line.qty_ordered),
        received = Number(line.qty_received || 0);
      if (!Number.isFinite(ordered) || !Number.isFinite(received)) continue;
      incoming.set(
        line.product_id,
        (incoming.get(line.product_id) || 0) + Math.max(0, ordered - received),
      );
    }
  }
  return incoming;
}
