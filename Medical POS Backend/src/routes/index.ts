import { Router } from 'express';
import { healthRouter } from './health';
import { authRouter } from './auth';
import { userRouter } from './user';
import { adminRouter } from './admin';
import suppliersRouter from './suppliers';
import customersRouter from './customers';
import inventoryRouter from './inventory';
import purchasesRouter from './purchases';
import salesRouter from './sales';
import expensesRouter from './expenses';
import shortbookRouter from './shortbook';
import reportsRouter from './reports';
import accountingRouter from './accounting';
import { devicesRouter } from './devices';
import { subscriptionsRouter } from './subscriptions';
import medicineMasterRouter from './medicineMaster';
import { bulkRouter } from './bulk';
import { analyticsRouter } from './analytics';
import { whatsappRouter } from './whatsapp';
import { clinicsRouter } from './clinics';
// medicalSuperadminRouter moved to SuperAdmin Backend (PORT 4000)

export const routes = Router();

routes.use('/health', healthRouter);
if (authRouter) {
  routes.use('/auth', authRouter);
}
routes.use('/user', userRouter);
routes.use('/admin', adminRouter);

routes.use('/suppliers', suppliersRouter);
routes.use('/customers', customersRouter);
routes.use('/inventory', inventoryRouter);
routes.use('/purchases', purchasesRouter);
routes.use('/sales', salesRouter);
routes.use('/expenses', expensesRouter);
routes.use('/shortbook', shortbookRouter);
routes.use('/reports', reportsRouter);
routes.use('/accounting', accountingRouter);
routes.use('/devices', devicesRouter);
routes.use('/subscriptions', subscriptionsRouter);
routes.use('/clinics', clinicsRouter);
routes.use('/medicines', medicineMasterRouter);
routes.use('/bulk', bulkRouter);
routes.use('/analytics', analyticsRouter);
routes.use('/whatsapp', whatsappRouter);
// medicalSuperadmin routes now served by SuperAdmin Backend (PORT 4000)
