import express from 'express';
import request from 'supertest';
import { assertNoLegacyLoyalty, rejectLegacyLoyalty } from '../services/commercial/retiredLoyalty';
import { errorHandler } from '../middleware/errorHandler';

jest.mock('../middleware/auth', () => ({
  requireAuth: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    req.user = { id: 'owner', clinic_id: 'store', role: 'OWNER' } as express.Request['user'];
    next();
  },
}));
import { commercialRouter } from '../routes/commercial';
import { posRouter } from '../routes/pos';
import { ordersRouter } from '../routes/orders';

const app = express();
app.use(express.json());
app.use('/commercial', commercialRouter);
app.use('/pos', posRouter);
app.use('/orders', ordersRouter);
app.use(errorHandler);

test.each(['/commercial/loyalty/program', '/commercial/loyalty/account/customer'])('retired reads return 410: %s', async path => {
  const response = await request(app).get(path);
  expect(response.status).toBe(410);
  expect(response.body.error.code).toBe('LOYALTY_REMOVED');
});

test('manual legacy point adjustment is removed', async () => {
  const response = await request(app).post('/commercial/loyalty/adjust').send({ customer_id: 'customer', credits: 100 });
  expect(response.status).toBe(410);
});

test.each(['/pos/quote', '/pos/checkout', '/orders/quote', '/orders/draft', '/orders/confirm'])('stale redemption fails before business work: %s', async path => {
  const response = await request(app).post(path).send({ redeem_loyalty_credits: 50 });
  expect(response.status).toBe(410);
  expect(response.body.error.code).toBe('LOYALTY_REMOVED');
});

test('legacy payment tender is rejected', async () => {
  const response = await request(app).post('/pos/checkout').send({ payments: [{ tender_type: 'LOYALTY', amount: 10 }] });
  expect(response.status).toBe(410);
});

test('ordinary billing and Nex Coins pass the retirement guard', async () => {
  const guardApp = express();
  guardApp.use(express.json(), rejectLegacyLoyalty);
  guardApp.post('/checkout', (_req, res) => res.sendStatus(204));
  guardApp.use(errorHandler);
  for (const body of [{}, { redeem_loyalty_credits: 0 }, { wallet_amount_paise: 1250, payments: [{ tender_type: 'CASH', amount: 87.5 }] }]) {
    expect((await request(guardApp).post('/checkout').send(body)).status).toBe(204);
  }
  expect(() => assertNoLegacyLoyalty(50)).toThrow('Loyalty points have been removed');
});
