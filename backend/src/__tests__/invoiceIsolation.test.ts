import { randomUUID } from 'node:crypto';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
const mockFrom = jest.fn();
const mockDownload = jest.fn();
jest.mock('../config/supabase', () => ({ supabaseAdmin: { from: (...args: unknown[]) => mockFrom(...args),
  storage: { from: () => ({ download: (...args: unknown[]) => mockDownload(...args) }) } } }));
import { localDb } from '../local-db';
import { publicRouter } from '../routes/public';
import { errorHandler } from '../middleware/errorHandler';
import { purchasesRouter } from '../routes/purchases';

const clinic = randomUUID(), foreign = randomUUID(), user = randomUUID(), saleId = randomUUID();
const app = express(); app.use('/public', publicRouter); app.use('/purchases', purchasesRouter); app.use(errorHandler);
const sale: any = { id: saleId, clinic_id: clinic, invoice_number: '<script>private</script>', sale_date: '2026-11-05',
  customers: { name: 'Private customer', clinic_id: clinic }, sale_items: [], subtotal: 0, discount: 0, gst_amount: 0, net_amount: 0 };
const filterCalls: Array<[string, unknown]> = [];
beforeAll(() => localDb.prepare('INSERT INTO users(id,_local_id,clinic_id,role,_updated_at) VALUES(?,?,?,?,?)').run(user,user,clinic,'OWNER',new Date().toISOString()));
beforeEach(() => {
  filterCalls.length = 0; mockFrom.mockReset(); mockDownload.mockReset(); sale.customers.clinic_id = clinic;
  mockFrom.mockImplementation((table: string) => {
    const filters: Record<string, unknown> = {};
    const query: any = {
      select: () => query,
      eq: (key: string, value: unknown) => { filters[key] = value; filterCalls.push([key, value]); return query; },
      is: () => query,
      single: async () => ({ data: table === 'sales' ? filters.clinic_id === sale.clinic_id ? sale : null : { name: 'Private pharmacy' }, error: null }),
    };
    return query;
  });
});
const authorization = () => `Bearer ${jwt.sign({ sub: user, token_use: 'access' }, process.env.JWT_SECRET!)}`;
test('invoice IDs grant no anonymous access and responses cannot be publicly cached', async () => {
  const response = await request(app).get(`/public/invoice/${saleId}`);
  expect(response.status).toBe(401); expect(mockFrom).not.toHaveBeenCalled();
  expect(response.headers['cache-control']).toBe('private, no-store');
});
test('an authenticated account cannot read another clinic invoice', async () => {
  sale.clinic_id = foreign;
  try {
    const response = await request(app).get(`/public/invoice/${saleId}`).set('Authorization', authorization());
    expect(response.status).toBe(404); expect(filterCalls).toContainEqual(['clinic_id', clinic]);
    expect(response.text).not.toContain('Private customer');
  } finally { sale.clinic_id = clinic; }
});
test('legacy foreign customer references cannot leak through an owned invoice', async () => {
  sale.customers.clinic_id = foreign;
  const response = await request(app).get(`/public/invoice/${saleId}`).set('Authorization', authorization());
  expect(response.status).toBe(404); expect(response.text).not.toContain('Private customer');
});
test('owned invoices render escaped content with private cache headers', async () => {
  const response = await request(app).get(`/public/invoice/${saleId}`).set('Authorization', authorization());
  expect(response.status).toBe(200); expect(response.text).toContain('&lt;script&gt;private&lt;/script&gt;');
  expect(response.text).not.toContain('<script>'); expect(response.headers['cache-control']).toBe('private, no-store');
});

test('purchase file downloads reject foreign keys and traversal before accessing storage', async () => {
  for (const key of [`${foreign}/private.jpg`, `${clinic}/../private.jpg`, `${clinic}/folder/private.jpg`]) {
    const response = await request(app).get('/purchases/bill-image').query({ key }).set('Authorization', authorization());
    expect(response.status).toBe(404);
  }
  expect(mockDownload).not.toHaveBeenCalled();
});

test('purchase files require a session and are returned only for its clinic', async () => {
  const key = `${clinic}/private.jpg`;
  expect((await request(app).get('/purchases/bill-image').query({ key })).status).toBe(401);
  mockDownload.mockResolvedValue({ data: new Blob(['private file'], { type: 'image/jpeg' }), error: null });
  const response = await request(app).get('/purchases/bill-image').query({ key }).set('Authorization', authorization());
  expect(response.status).toBe(200); expect(mockDownload).toHaveBeenCalledWith(key);
  expect(response.headers['cache-control']).toBe('private, no-store');
});
