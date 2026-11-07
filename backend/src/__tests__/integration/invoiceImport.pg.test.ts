import { randomUUID, createHash } from 'node:crypto';
const database = process.env.TEST_DATABASE_URL;
if (database) {
  const url = new URL(database);
  if (!['127.0.0.1', 'localhost'].includes(url.hostname) || !url.pathname.endsWith('_qa')) throw new Error('Invoice tests require a disposable localhost *_qa database.');
  process.env.DATABASE_URL = database;
}
jest.mock('../../local-db', () => ({ localDb: {} }));
jest.mock('../../services/commercial/supplierSchemeEngine', () => ({ SupplierSchemeEngine: { evaluateInwardScheme: jest.fn(() => { throw new Error('Invoice import must not infer supplier schemes'); }) } }));
import express from 'express';
import request from 'supertest';
import sql from '../../db';
import { purchasesRouter } from '../../routes/purchases';
import { errorHandler } from '../../middleware/errorHandler';

(database ? describe : describe.skip)('Non-AI invoice receipts with real PostgreSQL', () => {
  const clinic = randomUUID(), other = randomUUID(), owner = randomUUID(), supplier = randomUUID(), foreignSupplier = randomUUID(), medicine = randomUUID(), foreignMedicine = randomUUID();
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = { id: owner, clinic_id: clinic, role: 'OWNER', email: '' }; next(); });
  app.use('/purchases', purchasesRouter); app.use(errorHandler);
  const hash = (text: string) => createHash('sha256').update(text).digest('hex');
  function payload(invoice: string, batch = invoice) {
    return { supplier_id: supplier, invoice_number: invoice, invoice_date: '2026-11-05',
      invoice_import: { request_id: randomUUID(), source_sha256: hash(invoice), source_filename: `${invoice}.csv`, source_format: 'csv' },
      items: [{ medicine_id: medicine, batch_number: batch, expiry_date: '2099-02-28', quantity: 10, free_quantity: 2, purchase_price: 10, mrp: 20, gst_rate: 12, discount: 10 }],
    };
  }
  const post = (body: object) => request(app).post('/purchases').send(body);
  const stock = async (batch: string) => Number((await sql`SELECT COALESCE(sum(quantity_remaining),0) AS qty FROM medicine_batches WHERE clinic_id=${clinic} AND batch_number=${batch}`)[0].qty);
  beforeAll(async () => {
    await sql`INSERT INTO clinics(id,name,slug) VALUES (${clinic},'Invoice QA',${clinic}),(${other},'Foreign QA',${other})`;
    await sql`INSERT INTO users(id,email,role,clinic_id) VALUES (${owner},${owner + '@qa.invalid'},'OWNER',${clinic})`;
    await sql`INSERT INTO suppliers(id,_local_id,clinic_id,name) VALUES (${supplier},${supplier},${clinic},'Invoice supplier'),(${foreignSupplier},${foreignSupplier},${other},'Foreign supplier')`;
    await sql`INSERT INTO medicines(id,_local_id,clinic_id,name,gst_rate) VALUES (${medicine},${medicine},${clinic},'QA Drug 500mg',12),(${foreignMedicine},${foreignMedicine},${other},'QA Drug 500mg',12)`;
  });
  afterAll(async () => {
    for (const table of ['supplier_payable_ledger','invoice_import_receipts','stock_ledger','purchase_items','medicine_batches','purchases','suppliers','medicines']) await sql`DELETE FROM ${sql(table)} WHERE clinic_id IN (${clinic},${other})`;
    await sql`DELETE FROM users WHERE id=${owner}`;
    await sql`DELETE FROM clinics WHERE id IN (${clinic},${other})`;
    await sql.end();
  });
  test('exact matches are scoped to this shop', async () => {
    const result = await request(app).post('/purchases/invoice-matches').send({ names: ['QA Drug 500mg'] });
    expect(result.status).toBe(200); expect(result.body.data.map((row: any) => row.id)).toEqual([medicine]);
  });
  test('receipt adds paid plus explicit free stock, correct liability, and one ledger movement', async () => {
    const body = payload('FIRST');
    const result = await post(body);
    expect(result.status).toBe(201);
    expect(await stock('FIRST')).toBe(12);
    const [purchase] = await sql`SELECT * FROM purchases WHERE id=${result.body.data.id}`;
    expect(Number(purchase.grand_total)).toBe(100.8);
    const [line] = await sql`SELECT * FROM purchase_items WHERE purchase_id=${purchase.id}`;
    expect(line.free_quantity).toBe(2);
    const ledger = await sql`SELECT * FROM stock_ledger WHERE reference_id=${purchase.id}`;
    expect(ledger).toHaveLength(1); expect(Number(ledger[0].quantity_delta)).toBe(12);
    expect(Number((await sql`SELECT outstanding_balance FROM suppliers WHERE id=${supplier}`)[0].outstanding_balance)).toBe(100.8);
    const retry = await post(body);
    expect(retry.status).toBe(200); expect(retry.body.data.id).toBe(purchase.id); expect(await stock('FIRST')).toBe(12);
    const changed = structuredClone(body); changed.items[0].quantity = 15;
    expect((await post(changed)).status).toBe(409); expect(await stock('FIRST')).toBe(12);
  });
  test('same file and same normalized supplier invoice cannot add stock twice', async () => {
    const original = payload('DUPLICATE'); expect((await post(original)).status).toBe(201);
    const sameFile = payload('OTHER'); sameFile.invoice_import.source_sha256 = original.invoice_import.source_sha256;
    expect((await post(sameFile)).status).toBe(409);
    const renamed = payload(' duplicate '); renamed.invoice_import.source_sha256 = hash('different-format');
    expect((await post(renamed)).status).toBe(409); expect(await stock('DUPLICATE')).toBe(12);
  });
  test('inventory acquisition cost uses the same line rounding as the purchase liability', async () => {
    const body = payload('FRACTIONAL-RATE');
    Object.assign(body.items[0], { quantity: 1, free_quantity: 0, purchase_price: 0.105, mrp: 1, gst_rate: 0, discount: 10 });
    const response = await post(body); expect(response.status).toBe(201);
    const [purchase] = await sql`SELECT grand_total FROM purchases WHERE id=${response.body.data.id}`;
    const [batch] = await sql`SELECT purchase_price FROM medicine_batches WHERE clinic_id=${clinic} AND batch_number='FRACTIONAL-RATE'`;
    expect(Number(purchase.grand_total)).toBe(0.1); expect(Number(batch.purchase_price)).toBe(0.1);
  });
  test('failure on a later medicine rolls back header, earlier stock, ledger and import receipt', async () => {
    const body = payload('ROLLBACK'); body.items.push({ ...body.items[0], medicine_id: foreignMedicine });
    expect((await post(body)).status).toBeGreaterThanOrEqual(400);
    expect(await stock('ROLLBACK')).toBe(0);
    expect(await sql`SELECT id FROM purchases WHERE clinic_id=${clinic} AND invoice_number='ROLLBACK'`).toHaveLength(0);
    expect(await sql`SELECT request_id FROM invoice_import_receipts WHERE request_id=${body.invoice_import.request_id}`).toHaveLength(0);
  });
  test('existing batches increment and conflicting expiries are rejected atomically', async () => {
    expect((await post(payload('BATCH-1', 'SHARED'))).status).toBe(201);
    expect((await post(payload('BATCH-2', 'SHARED'))).status).toBe(201);
    expect(await stock('SHARED')).toBe(24);
    const body = payload('BAD-EXPIRY', 'SHARED'); body.items[0].expiry_date = '2098-01-01';
    expect((await post(body)).status).toBe(409); expect(await stock('SHARED')).toBe(24);
  });
  test('concurrent deliveries and a simultaneous retry preserve exact stock', async () => {
    const results = await Promise.all([post(payload('CONCURRENT-1','CONCURRENT')), post(payload('CONCURRENT-2','CONCURRENT'))]);
    expect(results.map(result => result.status)).toEqual([201,201]); expect(await stock('CONCURRENT')).toBe(24);
    const body = payload('SIMULTANEOUS');
    const retries = await Promise.all([post(body), post(body)]);
    expect(retries.map(result => result.status).sort()).toEqual([200,201]); expect(await stock('SIMULTANEOUS')).toBe(12);
  });
  test('invalid dates, expired stock, foreign suppliers and quantity overflow cannot post', async () => {
    const cases = [payload('INVALID-DATE'),payload('EXPIRED'),payload('FOREIGN'),payload('OVERFLOW')];
    cases[0].items[0].expiry_date = '2027-02-29'; cases[1].items[0].expiry_date = '2000-01-01';
    cases[2].supplier_id = foreignSupplier; cases[3].items[0].quantity = 2147483647;
    for (const body of cases) { expect((await post(body)).status).toBe(400); expect(await stock(body.items[0].batch_number)).toBe(0); }
  });
});
