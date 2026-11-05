import express from 'express';
import request from 'supertest';
import { salesRouter } from '../routes/sales';
import { queryRaw, queryCount, queryOne, queryAll } from '../lib/postgresDb';

jest.mock('../lib/postgresDb', () => ({
  queryRaw: jest.fn(), queryCount: jest.fn(), queryOne: jest.fn(),
  queryAll: jest.fn(), localMutate: jest.fn(),
}));
jest.mock('../local-db', () => ({ localDb: {} }));
jest.mock('../services/dailySalesSummary', () => ({ DailySalesSummaryService: {} }));
jest.mock('../middleware/auth', () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { id: 'cashier', clinic_id: 'clinic-a' };
    next();
  },
}));

const app = express();
app.use('/sales', salesRouter);
const raw = jest.mocked(queryRaw);
const count = jest.mocked(queryCount);

beforeEach(() => {
  jest.resetAllMocks();
  count.mockResolvedValue(26);
  raw.mockResolvedValue([]);
});

test('fetches one bounded page and reuses batched customer names in the response', async () => {
  raw.mockResolvedValueOnce([
    { id: 'sale-1', customer_id: 'customer-local' },
    { id: 'sale-2', customer_id: 'customer-local' },
    { id: 'sale-3', customer_id: null },
  ]).mockResolvedValueOnce([{ id: 'customer-cloud', _local_id: 'customer-local', name: 'Customer A' }]);
  const response = await request(app).get('/sales?page=2&limit=25');
  expect(response.status).toBe(200);
  expect(response.body.pagination).toEqual({ page: 2, limit: 25, total: 26, totalPages: 2 });
  expect(response.body.data.map((sale: any) => sale.customers.name)).toEqual(['Customer A', 'Customer A', '']);
  expect(raw.mock.calls[0][1]).toEqual(['clinic-a', 25, 25]);
  expect(raw.mock.calls[1][1]).toEqual(['customer-local', 'customer-local', 'clinic-a']);
  expect(raw.mock.calls[1][0]).toContain('clinic_id = ?');
});

test('searches the entire invoice set with parameterized literal wildcard characters', async () => {
  await request(app).get('/sales').query({ q: '50%_off', from: '2026-10-01', to: '2026-10-07' });
  expect(count.mock.calls[0][1]).toContain('invoice_number ILIKE ?');
  expect(count.mock.calls[0][1]).toContain('c.clinic_id = sales.clinic_id');
  expect(count.mock.calls[0][2]).toEqual([
    'clinic-a', '2026-10-01', '2026-10-07', '%50\\%\\_off%', '%50\\%\\_off%', '%50\\%\\_off%',
  ]);
});

test('clamps negative pagination values and uses a stable invoice ordering', async () => {
  const response = await request(app).get('/sales?page=-2&limit=-100');
  expect(response.body.pagination.page).toBe(1);
  expect(response.body.pagination.limit).toBe(1);
  expect(raw.mock.calls[0][0]).toContain('ORDER BY created_at DESC, id DESC');
  expect(raw.mock.calls[0][1]).toEqual(['clinic-a', 1, 0]);
});

test('starts the page query before waiting for the total count', async () => {
  let resolveCount: (value: number) => void = () => {};
  count.mockImplementation(() => new Promise<number>(resolve => { resolveCount = resolve; }));
  raw.mockImplementation(async () => {
    resolveCount(0);
    return [];
  });
  const response = await request(app).get('/sales');
  expect(response.status).toBe(200);
  expect(response.body.pagination.total).toBe(0);
});


test('customer history includes legacy returns through their original bill within the same clinic', async () => {
  raw.mockResolvedValueOnce([{ id: 'return-1', customer_id: null, is_return: true, return_of: 'original-1' }])
    .mockResolvedValueOnce([{ id: 'customer-one', name: 'Anita' }]);
  const response = await request(app).get('/sales').query({ customer_id: 'customer-one', page: 2 });
  expect(response.status).toBe(200);
  expect(response.body.data[0].customer_id).toBe('customer-one');
  expect(count.mock.calls[0][1]).toContain('original.clinic_id=sales.clinic_id');
  expect(count.mock.calls[0][1]).toContain('original.id=sales.return_of');
  expect(count.mock.calls[0][2]).toEqual(['clinic-a', 'customer-one', 'customer-one']);
});

test('return invoice details recover the original customer and keep archived medicine and batch names', async () => {
  jest.mocked(queryOne).mockResolvedValueOnce({ id: 'return-1', is_return: true, return_of: 'original-1', customer_id: null })
    .mockResolvedValueOnce({ id: 'original-1', customer_id: 'customer-one' });
  jest.mocked(queryAll).mockResolvedValueOnce([{ id: 'line', medicine_id: 'archived-med', batch_id: 'archived-batch', quantity: 2 }]);
  raw.mockResolvedValueOnce([{ id: 'archived-med', name: 'Archived medicine' }])
    .mockResolvedValueOnce([{ id: 'archived-batch', batch_number: 'B-1', expiry_date: '2026-12-01' }]);
  const response = await request(app).get('/sales/return-1');
  expect(response.status).toBe(200);
  expect(response.body.data.customer_id).toBe('customer-one');
  expect(response.body.data.sale_items[0].medicines.name).toBe('Archived medicine');
  expect(response.body.data.sale_items[0].medicine_batches.batch_number).toBe('B-1');
  expect(jest.mocked(queryOne).mock.calls[1]).toEqual(['sales', 'id=? AND clinic_id=?', ['original-1', 'clinic-a']]);
  for (const call of raw.mock.calls) {
    expect(call[0]).toContain('clinic_id=?');
    expect(call[0]).not.toContain('_deleted = 0');
    expect(call[1]?.at(-1)).toBe('clinic-a');
  }
});
