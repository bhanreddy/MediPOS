import { randomUUID } from 'node:crypto';
const database = process.env.TEST_DATABASE_URL;
if (database) {
  const url = new URL(database);
  if (!['127.0.0.1', 'localhost'].includes(url.hostname) || !url.pathname.endsWith('_qa')) throw new Error('Import write tests require a disposable local *_qa database');
  process.env.DATABASE_URL = database;
}
import express from 'express';
import request from 'supertest';
import sql from '../../db';
import { bulkRouter } from '../../routes/bulk';
import { inventoryRouter } from '../../routes/inventory';
import { errorHandler } from '../../middleware/errorHandler';

const describePg = database ? describe : describe.skip;
describePg('Medicine template, API and durable import contract', () => {
  const clinic = randomUUID(), foreign = randomUUID(), user = randomUUID();
  const app = express();
  app.use(express.json({ limit: '2mb' }));
  app.use((req, _res, next) => {
    if (req.header('x-qa-role')) req.user = {
      id: user, clinic_id: req.header('x-qa-clinic') === 'none' ? null : req.header('x-qa-clinic') || clinic,
      role: req.header('x-qa-role') as 'OWNER', email: 'import@example.invalid',
    };
    next();
  });
  app.use('/bulk', bulkRouter);
  app.use('/inventory', inventoryRouter);
  app.use(errorHandler);
  const post = (medicines: unknown) => request(app).post('/bulk/medicines').set('x-qa-role', 'OWNER').send({ medicines });
  const stock = (lines: unknown) => request(app).post('/bulk/inventory').set('x-qa-role', 'OWNER').send({ lines });
  const count = async () => Number((await sql`SELECT count(*) FROM medicines WHERE clinic_id=${clinic}`)[0].count);
  beforeAll(async () => {
    await sql`INSERT INTO auth.users(id) VALUES(${user})`;
    for (const id of [clinic, foreign]) await sql`INSERT INTO clinics(id,_local_id,name,slug) VALUES(${id},${id},'Import QA',${id})`;
    await sql`INSERT INTO users(id,_local_id,clinic_id,full_name,email,role) VALUES(${user},${user},${clinic},'Import owner',${`${user}@example.invalid`},'OWNER')`;
  });
  afterAll(async () => {
    for (const id of [clinic, foreign]) {
      await sql`DELETE FROM stock_ledger WHERE clinic_id=${id}`;
      await sql`DELETE FROM medicine_batches WHERE clinic_id=${id}`;
      await sql`DELETE FROM purchases WHERE clinic_id=${id}`;
      await sql`DELETE FROM medicines WHERE clinic_id=${id}`;
    }
    await sql`DELETE FROM users WHERE id=${user}`;
    await sql`DELETE FROM clinics WHERE id IN (${clinic},${foreign})`;
    await sql`DELETE FROM auth.users WHERE id=${user}`;
    await sql.end();
  });
  test('all supplied fields persist, including optional values appearing only in later rows', async () => {
    const response = await post([
      { name: 'Minimal QA' },
      { name: ' Full QA ', generic_name: 'Generic QA', manufacturer: 'Maker QA', product_type: 'MEDICINE', category: 'gel',
        gst_rate: 28, barcode: '00012345', hsn_code: '03004', unit: 'tablet', base_unit: 'tablet', sale_unit: 'strip',
        conversion_factor: 10, strength: '200 mg', pack_size: '10', composition: 'QA composition', brand_name: 'Brand',
        dosage_form: 'Gel', marketer: 'Marketer', is_schedule_h1: true, cold_chain_required: true,
        storage_instructions: 'Keep cold', minimum_margin_percent: 5, low_stock_threshold: 20 },
    ]);
    expect(response.status).toBe(201); expect(response.body).toMatchObject({ success: 2, skipped: 0, failed: 0 });
    const [full] = await sql`SELECT * FROM medicines WHERE clinic_id=${clinic} AND name='Full QA'`;
    expect(full).toMatchObject({ generic_name: 'Generic QA', manufacturer: 'Maker QA', gst_rate: '28', barcode: '00012345', primary_barcode: '00012345',
      hsn_code: '03004', unit: 'tablet', conversion_factor: '10', prescription_required: true, is_schedule_h1: true,
      schedule_classification: 'SCHEDULE_H1', cold_chain_required: true, composition: 'QA composition', low_stock_threshold: 20 });
    const search = await request(app).get('/inventory/medicines/search?barcode=00012345&include_substitutes=false').set('x-qa-role', 'OWNER');
    expect(search.status).toBe(200); expect(search.body.results[0].id).toBe(full.id);
    expect(full._local_id).toBe(full.id);
    const detail = await request(app).get(`/inventory/medicines/${full._local_id}`).set('x-qa-role', 'OWNER');
    expect(detail.status).toBe(200); expect(detail.body.data.id).toBe(full.id);
  });
  test('identical rows and concurrent/reordered retries never create duplicate medicines', async () => {
    const row = { name: 'Replay QA', generic_name: 'Replay generic' };
    const first = await post([row, row]); expect(first.body).toMatchObject({ success: 1, skipped: 1 });
    const replies = await Promise.all([post([row]), post([{ generic_name: 'Replay generic', name: 'Replay QA' }])]);
    for (const response of replies) { expect(response.status).toBe(201); expect(response.body).toMatchObject({ success: 0, skipped: 1 }); }
    expect(Number((await sql`SELECT count(*) FROM medicines WHERE clinic_id=${clinic} AND name='Replay QA'`)[0].count)).toBe(1);
  });
  test('barcode conflicts reject the entire file and never overwrite existing medicines', async () => {
    const before = await count();
    const response = await post([{ name: 'Must rollback QA' }, { name: 'Barcode conflict QA', primary_barcode: '00012345' }]);
    expect(response.status).toBe(409); expect(response.body.error.message).toMatch(/Row 3/); expect(await count()).toBe(before);
    const duplicate = await post([{ name: 'Barcode A QA', barcode: 'NEW-CODE' }, { name: 'Barcode B QA', barcode: 'NEW-CODE' }]);
    expect(duplicate.status).toBe(409); expect(await count()).toBe(before);
  });
  test('cross-clinic imports are independent and supplied tenant IDs are rejected', async () => {
    const response = await request(app).post('/bulk/medicines').set('x-qa-role', 'OWNER').set('x-qa-clinic', foreign).send({ medicines: [{ name: 'Other clinic QA', barcode: '00012345' }] });
    expect(response.status).toBe(201);
    expect((await sql`SELECT clinic_id FROM medicines WHERE name='Other clinic QA'`)[0].clinic_id).toBe(foreign);
    expect((await post([{ name: 'Injected QA', clinic_id: foreign }])).status).toBe(400);
  });
  test('authentication, owner role and clinic context are required', async () => {
    expect((await request(app).post('/bulk/medicines').send({ medicines: [{ name: 'Unauthorized QA' }] })).status).toBe(401);
    expect((await request(app).post('/bulk/medicines').set('x-qa-role', 'CASHIER').send({ medicines: [{ name: 'Unauthorized QA' }] })).status).toBe(403);
    expect((await request(app).post('/bulk/medicines').set('x-qa-role', 'OWNER').set('x-qa-clinic', 'none').send({ medicines: [{ name: 'No clinic QA' }] })).status).toBe(403);
  });
  test('invalid or empty rows reject the entire file before writing, with source indexes', async () => {
    const before = await count();
    for (const medicines of [[], [{ name: 'Valid QA' }, { name: ' ' }], [{ name: 'Bad GST QA', gst_rate: 13 }], [{ name: 'Bad threshold QA', low_stock_threshold: 0 }], [{ name: 'Bad unit QA', conversion_factor: 0 }], [{ name: 'Safety QA', is_schedule_h1: 'yes' }]]) {
      expect((await post(medicines)).status).toBe(400);
    }
    const invalid = await post([{ name: 'Valid QA' }, { name: 'Bad QA', gst_rate: 13 }]);
    expect(invalid.body.details[0].path).toEqual([1, 'gst_rate']); expect(await count()).toBe(before);
  });
  test('database failure in a later insert batch rolls back every earlier batch', async () => {
    const before = await count();
    await sql.unsafe("ALTER TABLE medicines ADD CONSTRAINT qa_import_failure CHECK (name <> 'IMPORT_DB_FAILURE_QA') NOT VALID");
    try {
      const rows = Array.from({ length: 200 }, (_, i) => ({ name: `Rollback QA ${i}` }));
      const response = await post([...rows, { name: 'IMPORT_DB_FAILURE_QA' }]);
      expect(response.status).toBe(500); expect(await count()).toBe(before);
    } finally { await sql.unsafe('ALTER TABLE medicines DROP CONSTRAINT qa_import_failure'); }
  });
  test('maximum 5000-row import persists and replays correctly; 5001 rows are rejected', async () => {
    const rows = Array.from({ length: 5000 }, (_, i) => ({ name: `Volume QA ${i}`, manufacturer: i % 2 ? 'Volume maker' : undefined }));
    const start = Date.now();
    const response = await post(rows); expect(response.status).toBe(201); expect(response.body.success).toBe(5000);
    expect((await post(rows)).body).toMatchObject({ success: 0, skipped: 5000 });
    expect((await post([...rows, { name: 'Excess QA' }])).status).toBe(400);
    console.info(`Medicine import QA: 5000-row save + replay completed in ${Date.now() - start} ms`);
  });
  test('deleted imported medicines cannot be silently re-created on retry', async () => {
    await post([{ name: 'Deleted QA' }]);
    await sql`UPDATE medicines SET deleted_at=now() WHERE clinic_id=${clinic} AND name='Deleted QA'`;
    const response = await post([{ name: 'Deleted QA' }]); expect(response.status).toBe(409); expect(response.body.error.code).toBe('IMPORT_DELETED_MEDICINE');
  });
  const line = (batch: string) => ({ medicine_name: 'Opening QA', batch_number: batch, expiry_date: '2031-12-31', quantity: 10, mrp: 20, purchase_price: 10, gst_rate: 28 });
  test('opening stock reuses one medicine, persists correct quantity columns and ledger, and replays safely', async () => {
    const response = await stock([line('OPEN-A'), line('OPEN-B')]);
    expect(response.status).toBe(201); expect(response.body.success).toBe(2);
    const meds = await sql`SELECT id FROM medicines WHERE clinic_id=${clinic} AND name='Opening QA'`; expect(meds.length).toBe(1);
    const batches = await sql`SELECT quantity_in,quantity_remaining FROM medicine_batches WHERE medicine_id=${meds[0].id}`;
    expect(batches.length).toBe(2); for (const batch of batches) expect(batch).toMatchObject({ quantity_in: 10, quantity_remaining: 10 });
    expect(Number((await sql`SELECT sum(quantity_delta) as total FROM stock_ledger WHERE medicine_id=${meds[0].id} AND movement_type='OPENING_STOCK'`)[0].total)).toBe(20);
    expect((await stock([line('OPEN-A'), line('OPEN-B')])).body).toMatchObject({ success: 0, skipped: 2 });
    const search = await request(app).get('/inventory/medicines/search?q=Opening%20QA&include_substitutes=false').set('x-qa-role', 'OWNER');
    expect(search.status).toBe(200); expect(Number(search.body.results[0].total_stock)).toBe(20);
  });
  test('existing batches, ambiguous medicines and invalid dates cause no partial opening stock writes', async () => {
    const before = Number((await sql`SELECT count(*) FROM purchases WHERE clinic_id=${clinic}`)[0].count);
    const response = await stock([line('NEW-BATCH'), line('OPEN-A')]); expect(response.status).toBe(409);
    expect(Number((await sql`SELECT count(*) FROM purchases WHERE clinic_id=${clinic}`)[0].count)).toBe(before);
    expect((await sql`SELECT id FROM medicine_batches WHERE clinic_id=${clinic} AND batch_number='NEW-BATCH'`).length).toBe(0);
    expect((await stock([{ ...line('INVALID'), expiry_date: '2026-02-30' }])).status).toBe(400);
    await sql`INSERT INTO medicines(clinic_id,name,generic_name) VALUES(${clinic},'Ambiguous QA','A'),(${clinic},'Ambiguous QA','B')`;
    expect((await stock([{ ...line('AMBIGUOUS'), medicine_name: 'Ambiguous QA' }])).status).toBe(409);
  });
});
