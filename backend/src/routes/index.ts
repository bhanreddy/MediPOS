import { branchesRouter } from './branches';
import { dispensingRouter } from './dispensing';
import { counterRouter } from './counter';
import { registerRouter } from './register';
import { offlineRouter } from './offline';
import { Router } from 'express';
import { adminRouter } from './admin';
import authRoutes from './auth.routes';
import { requireAuth } from '../middleware/auth';
import { businessDb as localDb } from '../lib/businessDb';
import { ensureCloudReferenceCatalog, invalidateCloudReferenceCatalog } from '../services/cloudReferenceCatalog';

// Import all operational routers
import { healthRouter } from './health';
import { authRouter } from './auth';
import salesRouter from './sales';
import purchasesRouter from './purchases';
import expensesRouter from './expenses';
import inventoryRouter from './inventory';
import suppliersRouter from './suppliers';
import customersRouter from './customers';
import { devicesRouter } from './devices';
import eventsRouter from './events';
import reportsRouter from './reports';
import accountingRouter from './accounting';
import { analyticsRouter } from './analytics';
import shortbookRouter from './shortbook';
import { subscriptionsRouter } from './subscriptions';
import { whatsappRouter } from './whatsapp';
import medicineMasterRouter from './medicineMaster';
import billsRouter from './bills';
import { userRouter } from './user';
import { bulkRouter } from './bulk';
import { medicalSuperadminRouter } from './medicalSuperadmin';
import backupRouter from './backup';
import { clinicsRouter } from './clinics';
import organizationsRouter from './organizations';
import barcodesRouter from './barcodes';
import { posRouter } from './pos';
import { commercialRouter } from './commercial';
import { doctorsRouter } from './doctors';
import { prescriptionsRouter } from './prescriptions';
import { patientsRouter } from './patients';
import { procurementRouter } from './procurement';
import transfersRouter from './transfers';
import warehouseRouter from './warehouse';
import { walletRouter } from './wallet';
import { ordersRouter } from './orders';

export const routes = Router();

routes.use((req, res, next) => {
  if (req.method !== 'GET' && /^\/(inventory|suppliers|customers|sales|purchases)(\/|$)/.test(req.path)) res.on('finish', () => {
    if (res.statusCode < 400 && req.user?.clinic_id) invalidateCloudReferenceCatalog(req.user.clinic_id);
  });
  next();
});

const tenantPaths = ['/sales', '/purchases', '/expenses', '/inventory', '/suppliers', '/customers',
  '/offline', '/wallet', '/devices', '/events', '/reports', '/accounting', '/analytics', '/shortbook',
  '/whatsapp', '/bills', '/bulk', '/backup', '/barcodes', '/pos', '/commercial',
  '/doctors', '/prescriptions', '/patients', '/procurement', '/transfers', '/warehouse', '/orders'];
routes.use(tenantPaths, requireAuth, (req, res, next) => {
  if (!req.user?.clinic_id) return res.status(403).json({ error: { code: 'TENANT_REQUIRED', message: 'Choose a clinic before accessing business data.' } });
  next();
});

// Public routes
routes.use('/auth', authRoutes);
routes.use('/health', healthRouter);

// Protected routes (Phase 2)
// routes.use(authenticateJWT);

// Mount operational routes
routes.use('/auth', authRouter);
routes.use('/admin', adminRouter);
routes.use('/sales', salesRouter);
routes.use('/offline',offlineRouter);
routes.use('/purchases', purchasesRouter);
routes.use('/expenses', expensesRouter);
routes.use('/inventory', inventoryRouter);
routes.use('/suppliers', suppliersRouter);
routes.use('/customers', customersRouter);
routes.use('/wallet', walletRouter);
routes.use('/devices', devicesRouter);
routes.use('/events', eventsRouter);
routes.use('/reports', reportsRouter);
routes.use('/accounting', accountingRouter);
routes.use('/analytics', analyticsRouter);
routes.use('/shortbook', shortbookRouter);
routes.use('/subscriptions', subscriptionsRouter);
routes.use('/whatsapp', whatsappRouter);
routes.use('/', medicineMasterRouter); // Mounted at / because it contains the prefix '/master'
routes.use('/bills', billsRouter);
routes.use('/user', userRouter);
routes.use('/bulk', bulkRouter);
routes.use('/superadmin', medicalSuperadminRouter);
routes.use('/backup', backupRouter);
routes.use('/clinics', clinicsRouter);
routes.use('/organizations', organizationsRouter);
routes.use('/barcodes', barcodesRouter);
routes.use('/pos', posRouter);
routes.use('/register', registerRouter);
routes.use('/counter', counterRouter);
routes.use('/commercial', commercialRouter);
routes.use('/doctors', doctorsRouter);
routes.use('/prescriptions', prescriptionsRouter);
routes.use('/dispensing', dispensingRouter);
routes.use('/branches', branchesRouter);
routes.use('/patients', patientsRouter);
routes.use('/procurement', procurementRouter);
routes.use('/transfers', transfersRouter);
routes.use('/warehouse', warehouseRouter);
routes.use('/orders', ordersRouter);
