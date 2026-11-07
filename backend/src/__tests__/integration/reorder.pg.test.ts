import { randomUUID } from "node:crypto";
const database = process.env.TEST_DATABASE_URL;
if (database) {
  const url = new URL(database);
  if (
    !["localhost", "127.0.0.1"].includes(url.hostname) ||
    !url.pathname.endsWith("_qa")
  )
    throw Error("Reorder tests require a disposable local *_qa database");
  process.env.DATABASE_URL = database;
}
let clinic = "",
  otherClinic = "",
  actor = "",
  role = "OWNER";
jest.mock("../../middleware/auth", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { id: actor, clinic_id: clinic, role };
    next();
  },
}));
jest.mock("../../services/cloudStoreContext", () => ({
  resolveCloudStoreContext: async () => ({
    organizationId: null,
    storeId: null,
    counterId: null,
    terminalId: null,
  }),
}));
jest.mock("../../services/commercial/supplierSchemeEngine", () => ({
  SupplierSchemeEngine: {
    evaluateInwardScheme: (p: any) => ({
      totalReceivedQuantity: p.billedQuantity,
      effectiveUnitCost: p.purchasePrice,
      effectiveUnitCostPaise: p.purchasePrice * 100,
      tradeDiscountPct: 0,
    }),
  },
}));
import express from "express";
import request from "supertest";
import sql from "../../db";
import * as persistence from "../../lib/postgresDb";
import { shortbookRouter } from "../../routes/shortbook";
import { suppliersRouter } from "../../routes/suppliers";
import { purchasesRouter } from "../../routes/purchases";
import { errorHandler } from "../../middleware/errorHandler";

(database ? describe : describe.skip)(
  "Supplier reorder: PostgreSQL transactions and access boundaries",
  () => {
    const app = express();
    app.use(express.json());
    app.use("/shortbook", shortbookRouter);
    app.use("/suppliers", suppliersRouter);
    app.use("/purchases", purchasesRouter);
    app.use(errorHandler);
    let supplier = "",
      cheaper = "",
      medicine = "",
      shortage = "";
    beforeEach(async () => {
      clinic = randomUUID();
      otherClinic = randomUUID();
      actor = randomUUID();
      supplier = randomUUID();
      cheaper = randomUUID();
      medicine = randomUUID();
      shortage = randomUUID();
      role = "OWNER";
      await sql`INSERT INTO clinics(id,name,slug) VALUES(${clinic},'Reorder QA',${clinic}),(${otherClinic},'Other shop',${otherClinic})`;
      await sql`INSERT INTO users(id,email,full_name,role) VALUES(${actor},${actor + "@example.invalid"},'QA owner','OWNER')`;
      await sql`INSERT INTO suppliers(id,_local_id,clinic_id,name,phone,lead_time_days,preferred_channel,whatsapp_opt_in) VALUES(${supplier},${supplier},${clinic},'Preferred distributor','9876543210',5,'WHATSAPP',true),(${cheaper},${cheaper},${clinic},'Value distributor',null,3,'MANUAL',false)`;
      await sql`INSERT INTO medicines(id,_local_id,clinic_id,name,generic_name,low_stock_threshold,preferred_supplier_id) VALUES(${medicine},${medicine},${clinic},'Reorder test medicine','Generic',10,${supplier})`;
      await sql`INSERT INTO medicine_batches(id,clinic_id,medicine_id,supplier_id,batch_number,expiry_date,quantity_in,quantity_remaining,purchase_price,mrp) VALUES(${randomUUID()},${clinic},${medicine},${supplier},'OLD','2020-01-01',100,100,12,20),(${randomUUID()},${clinic},${medicine},${cheaper},'CURRENT','2099-12-31',5,5,10,20)`;
      await sql`INSERT INTO shortbook(id,_local_id,clinic_id,medicine_id,quantity_needed,reason) VALUES(${shortage},${shortage},${clinic},${medicine},20,'manual')`;
    });
    afterEach(() => jest.restoreAllMocks());
    afterAll(async () => {
      await sql.end();
    });
    const draftInput = (quantity = 20, supplierId = supplier) => ({
      request_id: randomUUID(),
      lines: [{ medicine_id: medicine, supplier_id: supplierId, quantity }],
    });
    const create = (body = draftInput()) =>
      request(app).post("/shortbook/draft-orders").send(body);
    const plan = () => request(app).get("/shortbook/workspace");
    const receipt = (orderId: string, quantity: number) => ({
      reorder_order_id: orderId,
      reorder_receipt_id: randomUUID(),
      supplier_id: supplier,
      invoice_number: randomUUID(),
      invoice_date: "2026-11-05",
      items: [
        {
          medicine_id: medicine,
          batch_number: randomUUID(),
          expiry_date: "2099-12-31",
          quantity,
          purchase_price: 12,
          mrp: 20,
          gst_rate: 12,
        },
      ],
    });

    test("ignores expired stock, exposes observed supplier rates, and retains the preferred supplier", async () => {
      const response = await plan();
      expect(response.status).toBe(200);
      const row = response.body.data.candidates[0];
      expect(row).toMatchObject({
        availableStock: 5,
        recommendedQuantity: 20,
        supplierId: supplier,
        lastPrice: 12,
      });
      expect(row.quotes[0]).toMatchObject({ supplier_id: cheaper, price: 10 });
    });
    test("atomically saves a message draft, replays an exact request and rejects changed replays", async () => {
      const body = draftInput();
      const first = await create(body);
      expect(first.status).toBe(201);
      expect(first.body.data).toHaveLength(1);
      expect((await create(body)).body.data).toEqual(first.body.data);
      const changed = await create({
        ...body,
        lines: [{ ...body.lines[0], quantity: 10 }],
      });
      expect(changed.status).toBe(409);
      const messages =
        await sql`SELECT * FROM supplier_message_drafts WHERE clinic_id=${clinic}`;
      expect(messages).toHaveLength(1);
      expect(messages[0]).toMatchObject({
        status: "DRAFT",
        channel: "WHATSAPP",
        attempts: 0,
        provider_message_id: null,
      });
      expect(messages[0].body).toContain("20 strip");
      expect((await plan()).body.data.candidates[0].recommendedQuantity).toBe(
        0,
      );
      const [stock] =
        await sql`SELECT SUM(quantity_remaining)::int AS qty FROM medicine_batches WHERE clinic_id=${clinic}`;
      expect(stock.qty).toBe(105);
    });
    test("serializes different concurrent requests so the same shortage cannot be purchased twice", async () => {
      const responses = await Promise.all([create(), create()]);
      expect(responses.map((r) => r.status).sort()).toEqual([201, 409]);
      const orders =
        await sql`SELECT * FROM purchase_orders WHERE clinic_id=${clinic}`;
      expect(orders).toHaveLength(1);
    });
    test("budget, unknown rate, inactive supplier and duplicate line failures create no orders", async () => {
      expect(
        (await create({ ...draftInput(), budget: 100 } as any)).status,
      ).toBe(400);
      await sql`UPDATE medicine_batches SET created_at=now()-interval '200 days' WHERE supplier_id=${supplier}`;
      expect(
        (await create({ ...draftInput(), budget: 1000 } as any)).status,
      ).toBe(400);
      await sql`UPDATE suppliers SET is_active=false WHERE id=${supplier}`;
      expect((await create()).status).toBe(400);
      const body = draftInput(1, cheaper);
      expect(
        (await create({ ...body, lines: [body.lines[0], body.lines[0]] }))
          .status,
      ).toBe(400);
      expect(
        await sql`SELECT * FROM purchase_orders WHERE clinic_id=${clinic}`,
      ).toHaveLength(0);
    });
    test("cancelling releases draft quantities without erasing the shortbook request", async () => {
      const response = await create();
      const id = response.body.data[0].id;
      expect(
        (await request(app).post(`/shortbook/order-drafts/${id}/cancel`))
          .status,
      ).toBe(200);
      expect((await plan()).body.data.candidates[0].recommendedQuantity).toBe(
        20,
      );
      const [entry] = await sql`SELECT * FROM shortbook WHERE id=${shortage}`;
      expect(entry.is_ordered).toBe(false);
      const [message] =
        await sql`SELECT * FROM supplier_message_drafts WHERE purchase_order_id=${id}`;
      expect(message.status).toBe("CANCELLED");
    });
    test("partial receipts, exact retries and final delivery update stock, PO and shortage together", async () => {
      const created = await create();
      const id = created.body.data[0].id;
      const body = receipt(id, 7);
      const first = await request(app).post("/purchases").send(body);
      expect(first.status).toBe(201);
      expect(
        (await request(app).post("/purchases").send(body)).body.data.id,
      ).toBe(first.body.data.id);
      let [order] = await sql`SELECT * FROM purchase_orders WHERE id=${id}`;
      expect(order.status).toBe("PARTIAL");
      expect(JSON.parse(order.lines_json)[0].qty_received).toBe(7);
      const preview = await request(app).get(`/shortbook/order-drafts/${id}`);
      expect(preview.body.data.body).toContain("13 strip remaining");
      expect(preview.body.data.body).toContain("do not create a duplicate");
      const [snapshot] =
        await sql`SELECT payload_json, body FROM supplier_message_drafts WHERE purchase_order_id=${id}`;
      expect(snapshot.payload_json.version).toBe(1);
      expect(snapshot.body).toContain("20 strip");
      let [entry] = await sql`SELECT * FROM shortbook WHERE id=${shortage}`;
      expect(entry.quantity_needed).toBe(13);
      expect(entry.is_ordered).toBe(false);
      expect(
        (await request(app).post("/purchases").send(receipt(id, 14))).status,
      ).toBe(409);
      expect(
        (await request(app).post("/purchases").send(receipt(id, 13))).status,
      ).toBe(201);
      [order] = await sql`SELECT * FROM purchase_orders WHERE id=${id}`;
      expect(order.status).toBe("CLOSED");
      [entry] = await sql`SELECT * FROM shortbook WHERE id=${shortage}`;
      expect(entry.quantity_needed).toBe(0);
      expect(entry.is_ordered).toBe(true);
      const [balance] =
        await sql`SELECT outstanding_balance FROM suppliers WHERE id=${supplier}`;
      expect(Number(balance.outstanding_balance)).toBe(268.8);
      expect(
        (await request(app).post("/purchases").send(receipt(id, 1))).status,
      ).toBe(409);
      const purchases =
        await sql`SELECT * FROM purchases WHERE clinic_id=${clinic}`;
      expect(purchases).toHaveLength(2);
    });
    test("receipt failures roll back PO, shortbook, purchase, stock and supplier payable", async () => {
      const created = await create();
      const id = created.body.data[0].id;
      const original = persistence.localMutate;
      jest
        .spyOn(persistence, "localMutate")
        .mockImplementation(async (input) => {
          if (input.table === "purchase_items")
            throw Error("Simulated receipt item failure");
          return (await original(input));
        });
      expect(
        (await request(app).post("/purchases").send(receipt(id, 7))).status,
      ).toBe(500);
      const [order] = await sql`SELECT * FROM purchase_orders WHERE id=${id}`;
      expect(order.status).toBe("DRAFT");
      expect(JSON.parse(order.lines_json)[0].qty_received).toBe(0);
      const [entry] =
        await sql`SELECT quantity_needed FROM shortbook WHERE id=${shortage}`;
      expect(entry.quantity_needed).toBe(20);
      expect(
        await sql`SELECT * FROM purchases WHERE clinic_id=${clinic}`,
      ).toHaveLength(0);
      expect(
        await sql`SELECT * FROM reorder_receipts WHERE clinic_id=${clinic}`,
      ).toHaveLength(0);
      const [stock] =
        await sql`SELECT SUM(quantity_remaining)::int AS qty FROM medicine_batches WHERE clinic_id=${clinic}`;
      expect(stock.qty).toBe(105);
      const [balance] =
        await sql`SELECT outstanding_balance FROM suppliers WHERE id=${supplier}`;
      expect(Number(balance.outstanding_balance)).toBe(0);
    });
    test("cancelling an unfulfilled balance retains received stock and allows another supplier order", async () => {
      const created = await create();
      const id = created.body.data[0].id;
      expect(
        (await request(app).post("/purchases").send(receipt(id, 7))).status,
      ).toBe(201);
      expect(
        (await request(app).post(`/shortbook/order-drafts/${id}/cancel`))
          .status,
      ).toBe(200);
      const row = (await plan()).body.data.candidates[0];
      expect(row).toMatchObject({
        availableStock: 12,
        incomingStock: 0,
        recommendedQuantity: 13,
      });
      expect((await create(draftInput(13, cheaper))).status).toBe(201);
      const [balance] =
        await sql`SELECT outstanding_balance FROM suppliers WHERE id=${supplier}`;
      expect(Number(balance.outstanding_balance)).toBe(94.08);
    });
    test("expired deliveries, changed receipt retries and wrong suppliers cannot modify an order", async () => {
      const created = await create();
      const id = created.body.data[0].id;
      const expired = receipt(id, 1);
      expired.items[0].expiry_date = "2020-01-01";
      expect((await request(app).post("/purchases").send(expired)).status).toBe(
        400,
      );
      expect(
        (
          await request(app)
            .post("/purchases")
            .send({ ...receipt(id, 1), supplier_id: cheaper })
        ).status,
      ).toBe(400);
      const body = receipt(id, 1);
      expect((await request(app).post("/purchases").send(body)).status).toBe(
        201,
      );
      expect(
        (
          await request(app)
            .post("/purchases")
            .send({ ...body, invoice_number: "changed" })
        ).status,
      ).toBe(409);
    });
    test("message-write failure rolls back PO creation and idempotency checkpoint", async () => {
      const original = persistence.queryRaw;
      jest.spyOn(persistence, "queryRaw").mockImplementation((async (
        query: string,
        params: any[],
      ) => {
        if (query.includes("INSERT INTO supplier_message_drafts"))
          throw Error("Simulated message persistence failure");
        return (await original(query, params));
      }) as typeof original);
      expect((await create()).status).toBe(500);
      expect(
        await sql`SELECT * FROM purchase_orders WHERE clinic_id=${clinic}`,
      ).toHaveLength(0);
      expect(
        await sql`SELECT * FROM reorder_requests WHERE clinic_id=${clinic}`,
      ).toHaveLength(0);
    });
    test("cross-shop IDs and cashier writes are rejected", async () => {
      const created = await create();
      const id = created.body.data[0].id;
      role = "CASHIER";
      expect((await create()).status).toBe(403);
      expect(
        (await request(app).post(`/shortbook/order-drafts/${id}/cancel`))
          .status,
      ).toBe(403);
      role = "OWNER";
      clinic = otherClinic;
      expect(
        (await request(app).get(`/shortbook/order-drafts/${id}`)).status,
      ).toBe(404);
      expect(
        (await request(app).post(`/shortbook/order-drafts/${id}/cancel`))
          .status,
      ).toBe(404);
      expect((await create()).status).toBe(409);
      expect((await plan()).body.data.candidates).toHaveLength(0);
    });
    test("supplier filters and summary apply to the entire shop and preferences persist", async () => {
      expect(
        (await request(app).get("/suppliers/summary")).body.data,
      ).toMatchObject({ total: 2, active: 2, missing_contact: 1 });
      const response = await request(app).get(
        "/suppliers?filter=missing_contact",
      );
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].id).toBe(cheaper);
      expect(
        (
          await request(app).put(`/suppliers/${supplier}`).send({
            lead_time_days: 8,
            minimum_order_value: 500,
            preferred_channel: "SMS",
            sms_opt_in: true,
          })
        ).status,
      ).toBe(200);
      expect(
        (await request(app).get(`/suppliers/${supplier}`)).body.data,
      ).toMatchObject({
        lead_time_days: 8,
        preferred_channel: "SMS",
        sms_opt_in: true,
      });
    });
  },
);
