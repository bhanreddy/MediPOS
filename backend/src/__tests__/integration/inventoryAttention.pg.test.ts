import { randomUUID } from 'node:crypto';
const database = process.env.TEST_DATABASE_URL;
if (database) {
  const url = new URL(database);
  if (!['127.0.0.1', 'localhost'].includes(url.hostname) || !url.pathname.endsWith('_qa'))
    throw new Error('Inventory tests require a disposable local *_qa database');
  process.env.DATABASE_URL = database;
}
const clinic = randomUUID(), otherClinic = randomUUID();
jest.mock('../../middleware/auth', () => ({ requireAuth: (req: any, _res: any, next: any) => {
  req.user = { id: 'qa-owner', clinic_id: clinic, role: 'OWNER' }; next();
} }));
jest.mock('../../local-db', () => ({ localDb: {} }));
import express from 'express';
import request from 'supertest';
import sql from '../../db';
import { inventoryRouter } from '../../routes/inventory';
import { errorHandler } from '../../middleware/errorHandler';

(database ? describe : describe.skip)('Inventory attention counts with real PostgreSQL', () => {
  const app = express();
  app.use('/inventory', inventoryRouter);
  app.use(errorHandler);
  const ids = new Map<string, string>();
  const counts = async (warning = '2026-12-05') => {
    const response = await request(app).get(`/inventory/attention-counts?today=2026-11-05&warning=${warning}`);
    expect(response.status).toBe(200);
    return response.body.data;
  };
  beforeAll(async () => {
    await sql`INSERT INTO clinics(id,name,slug) VALUES(${clinic},'Inventory attention QA',${clinic}),(${otherClinic},'Other shop QA',${otherClinic})`;
    async function medicine(name: string, quantities: Array<[number, string, boolean?]>, threshold = 10, extra: { active?: boolean; deleted?: boolean; clinic?: string } = {}) {
      const id = randomUUID(); ids.set(name, id);
      await sql`INSERT INTO medicines(id,_local_id,clinic_id,name,low_stock_threshold,is_active,deleted_at)
        VALUES(${id},${id},${extra.clinic || clinic},${name},${threshold},${extra.active !== false},${extra.deleted ? new Date() : null})`;
      for (const [index, [qty, expiry, disposed]] of quantities.entries()) {
        const batch = randomUUID();
        await sql`INSERT INTO medicine_batches(id,_local_id,clinic_id,medicine_id,batch_number,expiry_date,quantity_in,quantity_remaining,purchase_price,mrp,is_disposed)
          VALUES(${batch},${batch},${extra.clinic || clinic},${id},${`${name}-${index}`},${expiry},${qty},${qty},2,5,${!!disposed})`;
      }
    }
    await medicine('healthy split batches', [[6,'2027-01-01'],[6,'2027-01-01']]);
    await medicine('threshold and expiry overlap', [[5,'2026-11-20'],[5,'2027-01-01']]);
    await medicine('stockout without batches', []);
    await medicine('expired only', [[100,'2026-11-04']]);
    await medicine('disposed only', [[100,'2026-11-04',true]]);
    await medicine('depleted', [[0,'2026-11-04']]);
    await medicine('today expiry', [[20,'2026-11-05']]);
    await medicine('warning boundary', [[20,'2026-12-05']]);
    await medicine('after warning', [[20,'2026-12-06']]);
    await medicine('zero threshold', [[1,'2027-01-01']], 0);
    await medicine('inactive', [[1,'2026-11-04']], 10, { active: false });
    await medicine('deleted', [[1,'2026-11-04']], 10, { deleted: true });
    await medicine('other clinic', [[1,'2026-11-04']], 10, { clinic: otherClinic });
    for (const [ordered, deleted] of [[false,false],[true,false],[false,true]]) {
      const id = randomUUID();
      await sql`INSERT INTO shortbook(id,_local_id,clinic_id,medicine_id,quantity_needed,reason,is_ordered,deleted_at)
        VALUES(${id},${id},${clinic},${ids.get('expired only')!},1,'QA',${ordered},${deleted ? new Date() : null})`;
    }
  });
  afterAll(async () => {
    for (const table of ['shortbook', 'medicine_batches', 'medicines'])
      await sql`DELETE FROM ${sql(table)} WHERE clinic_id IN (${clinic},${otherClinic})`;
    await sql`DELETE FROM clinics WHERE id IN (${clinic},${otherClinic})`;
    await sql.end();
  });
  test('counts distinct low-stock medicines, stockouts and all expiry overlaps in the selected window', async () => {
    expect(await counts()).toEqual({ low_stock: 5, expiring: 4, shortbook: 1 });
  });
  test('changing the warning window changes expiry counts without suppressing low stock', async () => {
    expect(await counts('2026-11-10')).toEqual({ low_stock: 5, expiring: 2, shortbook: 1 });
  });
  test('active inventory loads independently, scoped to the same medicines and batch eligibility', async () => {
    const response = await request(app).get('/inventory/medicines');
    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(10);
    const meds = new Map<string, any>(response.body.data.map((row: any) => [row.name, row]));
    expect(meds.get('healthy split batches').total_stock).toBe(12);
    expect(meds.get('healthy split batches').medicine_batches).toHaveLength(2);
    expect(meds.get('disposed only').medicine_batches).toEqual([]);
    expect(meds.get('stockout without batches').medicine_batches).toEqual([]);
    expect(meds.get('expired only').medicine_batches).toHaveLength(1);
  });
  test('newly received stock updates low-stock counts while expiry alerts remain', async () => {
    const medicine = ids.get('threshold and expiry overlap')!;
    await sql`UPDATE medicine_batches SET quantity_remaining = 20 WHERE medicine_id = ${medicine}`;
    expect(await counts()).toEqual({ low_stock: 4, expiring: 4, shortbook: 1 });
  });
});
