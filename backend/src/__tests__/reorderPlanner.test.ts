import {
  outstandingByMedicine,
  planReorder,
  type ReorderSource,
} from "../services/procurement/reorderPlanner";
import { receiveOrderLines } from "../services/procurement/reorderReceiptService";
import { createReorderDraftsSchema } from "../services/procurement/reorderWorkspaceService";
import { renderSupplierOrderMessage } from "../services/procurement/supplierMessaging";

const source: ReorderSource = {
  medicine_id: "medicine",
  name: "Medicine",
  available: 10,
  sold_30d: 300,
  threshold: 10,
  requested: 0,
  incoming: 40,
  lead_time_days: 5,
  expiring: 0,
};

test("replenishes to lead time plus coverage and subtracts pending orders once", () => {
  expect(planReorder(source)).toMatchObject({
    recommendedQuantity: 140,
    reorderPoint: 80,
    daysCover: 1,
    priority: "urgent",
  });
  expect(planReorder({ ...source, incoming: 190 }).recommendedQuantity).toBe(0);
});
test("does not add overlapping manual demand to forecast demand", () => {
  expect(planReorder({ ...source, requested: 100 }).recommendedQuantity).toBe(
    140,
  );
  expect(planReorder({ ...source, requested: 250 }).recommendedQuantity).toBe(
    210,
  );
});
test("zero sales uses minimum stock without inventing demand or a price", () => {
  expect(
    planReorder({
      ...source,
      sold_30d: 0,
      available: 0,
      incoming: 0,
      threshold: 5,
    }),
  ).toMatchObject({
    recommendedQuantity: 5,
    daysCover: null,
    lastPrice: null,
    priority: "critical",
  });
  expect(
    planReorder({
      ...source,
      sold_30d: 0,
      available: 0,
      incoming: 0,
      threshold: 0,
    }).recommendedQuantity,
  ).toBe(0);
});
test("aggregates outstanding order lines, subtracting receipts and ignoring corrupt data", () => {
  const result = outstandingByMedicine([
    {
      lines_json: JSON.stringify([
        { product_id: "a", qty_ordered: 20, qty_received: 5 },
        { product_id: "b", qty_ordered: 2, qty_received: 8 },
      ]),
    },
    {
      lines_json: JSON.stringify([
        { product_id: "a", qty_ordered: 10 },
        null,
        { product_id: "c", qty_ordered: "bad" },
      ]),
    },
    { lines_json: "bad" },
  ]);
  expect(result.get("a")).toBe(25);
  expect(result.get("b")).toBe(0);
  expect(result.has("c")).toBe(false);
});
test("partial receipt increments only delivered lines and rejects extra or over-delivered items", () => {
  const lines = [
    { product_id: "a", qty_ordered: 20, qty_received: 5 },
    { product_id: "b", qty_ordered: 10, qty_received: 0 },
  ];
  expect(receiveOrderLines(lines, new Map([["a", 7]]))[0].qty_received).toBe(
    12,
  );
  expect(lines[0].qty_received).toBe(5);
  expect(() => receiveOrderLines(lines, new Map([["a", 16]]))).toThrow(
    "exceed",
  );
  expect(() => receiveOrderLines(lines, new Map([["unknown", 1]]))).toThrow(
    "exceed",
  );
});
test("rejects duplicate medicines and invalid quantities before any writes", () => {
  const line = {
    medicine_id: "11111111-1111-4111-8111-111111111111",
    supplier_id: "22222222-2222-4222-8222-222222222222",
    quantity: 1,
  };
  const body = {
    request_id: "33333333-3333-4333-8333-333333333333",
    lines: [line],
  };
  expect(createReorderDraftsSchema.safeParse(body).success).toBe(true);
  expect(
    createReorderDraftsSchema.safeParse({ ...body, lines: [line, line] })
      .success,
  ).toBe(false);
  expect(
    createReorderDraftsSchema.safeParse({
      ...body,
      lines: [{ ...line, quantity: 1.5 }],
    }).success,
  ).toBe(false);
  expect(
    createReorderDraftsSchema.safeParse({ ...body, budget: -1 }).success,
  ).toBe(false);
});
test("message snapshots contain units and request confirmation rather than claiming dispatch", () => {
  const body = renderSupplierOrderMessage({
    version: 1,
    orderNumber: "PO-123",
    supplierName: "Supplier",
    items: [{ name: "Medicine", quantity: 10, unit: "strip" }],
    notes: "Call before dispatch",
  });
  expect(body).toContain("10 strip");
  expect(body).toContain("confirm availability");
  expect(body).toContain("Call before dispatch");
});
