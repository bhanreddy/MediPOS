import { randomUUID } from 'node:crypto';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { localDb } from '../local-db';
import { localMutate } from '../lib/localMutate';
import { withTenantContext } from '../lib/tenantContext';
import { createApp } from '../app';
import { requireAuth } from '../middleware/auth';
import { requireStoreAccess } from '../middleware/storeAccess';
import { errorHandler } from '../middleware/errorHandler';
import { CommercialEngine } from '../services/commercial/commercialEngine';
import { OrderLifecycleService } from '../services/oms/orderLifecycleService';
import { PurchaseRequisitionService } from '../services/procurement/purchaseRequisitionService';
import { PurchaseOrderService } from '../services/procurement/purchaseOrderService';
import { SupplierPayableService } from '../services/procurement/supplierPayableService';
import { ThreeWayMatchingService } from '../services/procurement/threeWayMatchingService';

const makeTenant = () => ({ org: randomUUID(), clinic: randomUUID(), user: randomUUID(),
  store: randomUUID(), medicine: randomUUID(), batch: randomUUID(), customer: randomUUID(),
  supplier: randomUUID(), invoice: randomUUID(), sale: randomUUID(), order: randomUUID() });
const a = makeTenant(), b = makeTenant();
const match = randomUUID();
const token = (t: typeof a) => jwt.sign({ sub: t.user, token_use: 'access' }, process.env.JWT_SECRET!);
const auth = (t: typeof a) => `Bearer ${token(t)}`;
const actor = (t: typeof a) => ({ id: t.user, clinic_id: t.clinic, organization_id: t.org, role: 'OWNER' as const, email: 'qa@example.invalid' });
function seed(table: string, id: string, data: Record<string, unknown>) {
  const row = { id, _local_id: id, _updated_at: new Date().toISOString(), ...data };
  localDb.prepare(`INSERT INTO ${table} (${Object.keys(row).join(',')}) VALUES (${Object.keys(row).map(() => '?').join(',')})`).run(...Object.values(row));
}
beforeAll(() => {
  for (const t of [a, b]) {
    seed('organizations', t.org, { legal_name: 'Tenant QA', code: t.org });
    seed('clinics', t.clinic, { name: 'Tenant QA', organization_id: t.org });
    seed('users', t.user, { role: 'OWNER', clinic_id: t.clinic, is_active: 1 });
    seed('stores', t.store, { organization_id: t.org, clinic_id: t.clinic, name: 'Tenant QA', store_code: t.store });
    seed('medicines', t.medicine, { organization_id: t.org, clinic_id: t.clinic, name: 'Private medicine', mrp: 20, purchase_price: 10 });
    seed('medicine_batches', t.batch, { organization_id: t.org, clinic_id: t.clinic, medicine_id: t.medicine, store_id: t.store, mrp: 20, expiry_date: '2099-12-31', quantity_remaining: 10 });
    seed('customers', t.customer, { organization_id: t.org, clinic_id: t.clinic, name: 'Private customer' });
    seed('suppliers', t.supplier, { organization_id: t.org, clinic_id: t.clinic, name: 'Private supplier' });
    seed('purchase_invoices', t.invoice, { organization_id: t.org, supplier_id: t.supplier, invoice_number: t.invoice, invoice_date: '2026-11-05', created_by: t.user, total_paise: 5000, balance_due_paise: 5000 });
    seed('sales', t.sale, { organization_id: t.org, clinic_id: t.clinic, store_id: t.store, idempotency_key: `key-${t.sale}`, invoice_number: `PRIVATE-${t.sale}` });
    seed('orders', t.order, { organization_id: t.org, customer_id: t.customer, order_number: `PRIVATE-${t.order}` });
  }
  seed('purchase_match_results', match, { invoice_id: b.invoice, match_status: 'PRICE_VARIANCE', is_exception: 1 });
});

const app = createApp();
test('owners cannot use another tenant store, even when bypassing store grants', async () => {
  const boundary = express(); boundary.use(express.json());
  boundary.get('/', requireAuth, requireStoreAccess(), (req, res) => res.json(req.storeContext));
  boundary.use(errorHandler);
  expect((await request(boundary).get(`/?store_id=${a.store}`).set('Authorization', auth(a))).status).toBe(200);
  expect((await request(boundary).get(`/?store_id=${b.store}`).set('Authorization', auth(a))).status).toBe(403);
});

test('checkout idempotency keys cannot disclose another tenant invoice', async () => {
  const own = await request(app).post('/api/pos/checkout').set('Authorization', auth(a)).send({ idempotency_key: `key-${a.sale}` });
  expect(own.status).toBe(200); expect(own.body.data.id).toBe(a.sale);
  const foreign = await request(app).post('/api/pos/checkout').set('Authorization', auth(a)).send({ idempotency_key: `key-${b.sale}`, items: [] });
  expect(foreign.status).toBeGreaterThanOrEqual(400);
  expect(JSON.stringify(foreign.body)).not.toContain(`PRIVATE-${b.sale}`);
});

test('order tracking is scoped to the authenticated tenant', async () => {
  expect((await request(app).get(`/api/orders/${a.order}/tracking`).set('Authorization', auth(a))).status).toBe(200);
  expect((await request(app).get(`/api/orders/${b.order}/tracking`).set('Authorization', auth(a))).status).toBe(404);
});

test('supervisor IDs and shared default PINs cannot authorize an action as another account', async () => {
  for (const credentials of [{ supervisor_user_id: b.user }, { supervisor_pin: '9999' }, { supervisor_pin: '1234' }]) {
    const response = await request(app).post('/api/pos/authorize').set('Authorization', auth(a))
      .send({ action_type: 'HIGH_DISCOUNT', reason: 'QA attempted override', ...credentials });
    expect(response.status).toBe(403);
    expect(response.body.data).toBeUndefined();
  }
  const response = await request(app).post('/api/pos/authorize').set('Authorization', auth(a))
    .send({ action_type: 'HIGH_DISCOUNT', reason: 'QA authenticated owner approval', supervisor_user_id: a.user });
  expect(response.status).toBe(200); expect(response.body.data.authorizingUserId).toBe(a.user);
});

test.each(['medicine', 'batch', 'customer', 'store'] as const)('quotes reject a foreign %s before exposing prices or personal data', async field => {
  const input = { organizationId: a.org, storeId: field === 'store' ? b.store : a.store,
    customerId: field === 'customer' ? b.customer : a.customer,
    items: [{ medicine_id: field === 'medicine' ? b.medicine : a.medicine,
      batch_id: field === 'batch' ? b.batch : a.batch, quantity: 1 }] };
  await expect((async () => (await CommercialEngine.quoteCommercialCart(input)))()).rejects.toThrow('Record not found');
});

test('foreign customers cannot be copied into a draft order', async () => {
  await expect((async () => (await OrderLifecycleService.createDraftOrder({ organizationId: a.org, customerId: b.customer, items: [] })))()).rejects.toThrow('Record not found');
});

test('foreign procurement references fail before creating documents', async () => {
  const count = () => (localDb.prepare('SELECT COUNT(*) AS n FROM sync_queue').get() as { n: number }).n;
  const before = count();
  await expect((async () => (await PurchaseRequisitionService.createRequisition({ organizationId: a.org, requestedBy: a.user, items: [{ medicineId: b.medicine, requestedQuantity: 1 }] })))()).rejects.toThrow('Record not found');
  await expect((async () => (await PurchaseOrderService.createPurchaseOrder({ organizationId: a.org, supplierId: b.supplier, createdBy: a.user, items: [{ medicineId: a.medicine, orderedQuantity: 1, purchaseRatePaise: 1000 }] })))()).rejects.toThrow('Record not found');
  expect(count()).toBe(before);
});

test('a mixed payment batch cannot change either tenant invoice when a reference is foreign', async () => {
  await expect((async () => (await SupplierPayableService.recordPayment({ organizationId: a.org, supplierId: a.supplier,
    paymentDate: '2026-11-05', paymentMode: 'CASH', amountPaise: 2000, recordedBy: a.user,
    allocations: [{ invoiceId: a.invoice, amountPaise: 1000 }, { invoiceId: b.invoice, amountPaise: 1000 }] })))()).rejects.toThrow('Record not found');
  for (const t of [a, b]) expect((localDb.prepare('SELECT paid_amount_paise FROM purchase_invoices WHERE id = ?').get(t.invoice) as any).paid_amount_paise).toBe(0);
});

test('match exceptions inherit the invoice tenant and cannot be approved by another owner', async () => {
  await expect((async () => (await ThreeWayMatchingService.approveMatchException({ matchResultId: match, organizationId: a.org, approvedBy: a.user, userRole: 'OWNER', reason: 'Unauthorized attempt' })))()).rejects.toThrow('Match result not found');
  expect((localDb.prepare('SELECT is_exception FROM purchase_match_results WHERE id = ?').get(match) as any).is_exception).toBe(1);
});

test.each(['INSERT', 'UPDATE', 'DELETE'] as const)('the mutation boundary rejects foreign identities on %s', async operation => {
  await expect(withTenantContext(actor(a), async () => (await localMutate({ table: 'customers', operation,
    data: { id: b.customer, _local_id: b.customer, organization_id: a.org, name: 'Intruder' } })))).rejects.toThrow('Record not found');
  expect((localDb.prepare('SELECT name, _deleted FROM customers WHERE id = ?').get(b.customer) as any)).toMatchObject({ name: 'Private customer', _deleted: 0 });
});

test('the mutation boundary rejects foreign links and keeps concurrent tenant contexts separate', async () => {
  await Promise.all([a, b].map(t => new Promise<void>((resolve, reject) => {
    withTenantContext(actor(t), () => {
      Promise.resolve().then(async () => {
        const id = randomUUID();
        await expect((async () => (await localMutate({ table: 'sales', operation: 'INSERT', data: { id, organization_id: t.org, customer_id: (t === a ? b : a).customer } })))()).rejects.toThrow('Record not found');
        (await localMutate({ table: 'customers', operation: 'UPDATE', data: { id: t.customer, name: 'Private customer' } }));
      }).then(resolve, reject);
    });
  })));
});

test('business routes reject unassigned users instead of falling back to shared data', async () => {
  const id = randomUUID(); seed('users', id, { role: 'OWNER', is_active: 1 });
  const response = await request(app).get('/api/orders').set('Authorization', `Bearer ${jwt.sign({ sub: id }, process.env.JWT_SECRET!)}`);
  expect(response.status).toBe(403); expect(response.body.error.code).toBe('TENANT_REQUIRED');
});
