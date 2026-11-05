import { useEffect, lazy, Suspense } from 'react';
import { createBrowserRouter, RouterProvider, Outlet, Navigate, Link } from 'react-router-dom';
import { AuthFrame } from './components/auth/AuthFrame';
import { ArrowLeft } from 'lucide-react';
import { useAuth, observeAuthSession } from './lib/auth';
import { AuthGuard } from './components/auth/AuthGuard';
import { ResetPasswordScreen } from './components/auth/ResetPasswordScreen';
import { LoginFlowPage } from './components/auth/LoginFlowPage';
import { HomeRedirect } from './components/auth/HomeRedirect';
import { PaymentReturnPage } from './components/auth/PaymentReturnPage';
import { getUserSubscriptionReturnPath } from './payment/phonePePG/returnPath';
import { RouteError } from './components/RouteError';
const ClinicProfileSettings = lazy(() => import('./components/Settings/ClinicProfileSettings').then(module => ({ default: module.ClinicProfileSettings })));
const ExpiryAlertsScreen = lazy(() => import('./components/Inventory/ExpiryAlertsScreen').then(module => ({ default: module.ExpiryAlertsScreen })));
const StaffSettings = lazy(() => import('./components/Settings/StaffSettings').then(module => ({ default: module.StaffSettings })));

const Error403 = () => <AuthFrame title="Access restricted" subtitle="Your account does not have permission to open this page."><Link to="/" className="flex items-center gap-2 text-primary text-sm font-semibold"><ArrowLeft size={16} aria-hidden /> Return to your workspace</Link></AuthFrame>;


// The top level App layout where we check session
const RootLayout = () => {
    const { checkSession } = useAuth();
    
    useEffect(() => {
        const stop = observeAuthSession();
        void checkSession();
        const reconnect = () => { void checkSession(); };
        window.addEventListener('online', reconnect);
        return () => { stop(); window.removeEventListener('online', reconnect); };
        // Background sync is started by ClinicLayout — no duplicate listener here.
    }, [checkSession]);

    return <Suspense fallback={<div role="status" className="p-8 text-muted">Loading page…</div>}><Outlet /></Suspense>;
};

import { AdminLayout } from './components/admin/AdminLayout';
const AdminDashboard = lazy(() => import('./components/admin/AdminDashboard').then(module => ({ default: module.AdminDashboard })));
const AdminClinics = lazy(() => import('./components/admin/AdminClinics').then(module => ({ default: module.AdminClinics })));
const AdminUsers = lazy(() => import('./components/admin/AdminUsers').then(module => ({ default: module.AdminUsers })));
const AdminSystemHealth = lazy(() => import('./components/admin/AdminSystemHealth').then(module => ({ default: module.AdminSystemHealth })));
const AdminClinicProfile = lazy(() => import('./components/admin/AdminClinicProfile').then(module => ({ default: module.AdminClinicProfile })));

import { ClinicLayout } from './components/clinic/ClinicLayout';
const ClinicDashboard = lazy(() => import('./components/clinic/ClinicDashboard').then(module => ({ default: module.ClinicDashboard })));
const WebPos = lazy(() => import('./components/clinic/WebPos').then(module => ({ default: module.WebPos })));
const RegisterWizard = lazy(() => import('./components/auth/RegisterWizard').then(module => ({ default: module.RegisterWizard })));
const BillingSettings = lazy(() => import('./routes/(clinic)/settings/billing'));
const BusinessAnalyticsScreen = lazy(() => import('./components/Analytics/BusinessAnalyticsScreen').then(module => ({ default: module.BusinessAnalyticsScreen })));
const ImportDataScreen = lazy(() => import('./components/Settings/ImportDataScreen').then(module => ({ default: module.ImportDataScreen })));
const BillingSalesListPage = lazy(() => import('./components/clinic/BillingSalesListPage').then(module => ({ default: module.BillingSalesListPage })));
const PurchasesListPage = lazy(() => import('./components/clinic/PurchasesListPage').then(module => ({ default: module.PurchasesListPage })));
const CustomerHistoryPage = lazy(() => import('./components/clinic/CustomerHistoryPage').then(module => ({ default: module.CustomerHistoryPage })));
const CustomersListPage = lazy(() => import('./components/clinic/CustomersListPage').then(module => ({ default: module.CustomersListPage })));
const SuppliersListPage = lazy(() => import('./components/clinic/SuppliersListPage').then(module => ({ default: module.SuppliersListPage })));
const ExpensesListPage = lazy(() => import('./components/clinic/ExpensesListPage').then(module => ({ default: module.ExpensesListPage })));
const ReportsHubPage = lazy(() => import('./components/clinic/ReportsHubPage').then(module => ({ default: module.ReportsHubPage })));
const PurchaseWorkflowPage = lazy(() => import('./components/clinic/EmbeddedClinicScreens').then(module => ({ default: module.PurchaseWorkflowPage })));
const InventoryPageShell = lazy(() => import('./components/clinic/EmbeddedClinicScreens').then(module => ({ default: module.InventoryPageShell })));
const ShortbookPage = lazy(() => import('./components/clinic/ShortbookPage').then(module => ({ default: module.ShortbookPage })));
const SettingsScreen = lazy(() => import('./components/Settings/SettingsScreen').then(module => ({ default: module.SettingsScreen })));
const PriceBooksPage = lazy(() => import('./components/Commercial/PriceBooksPage').then(module => ({ default: module.PriceBooksPage })));
const PromotionsPage = lazy(() => import('./components/Commercial/PromotionsPage').then(module => ({ default: module.PromotionsPage })));
const CouponsPage = lazy(() => import('./components/Commercial/CouponsPage').then(module => ({ default: module.CouponsPage })));
const LoyaltyAdminPage = lazy(() => import('./components/Commercial/LoyaltyAdminPage').then(module => ({ default: module.LoyaltyAdminPage })));
const SupplierSchemesPage = lazy(() => import('./components/Commercial/SupplierSchemesPage').then(module => ({ default: module.SupplierSchemesPage })));
const PrescriptionQueuePage = lazy(() => import('./components/Prescriptions/PrescriptionQueuePage').then(module => ({ default: module.PrescriptionQueuePage })));
const PatientMedicationHistoryPage = lazy(() => import('./components/Prescriptions/PatientMedicationHistoryPage').then(module => ({ default: module.PatientMedicationHistoryPage })));
const InventoryCommandCenter = lazy(() => import('./components/Inventory/InventoryCommandCenter').then(module => ({ default: module.InventoryCommandCenter })));
const StocktakePage = lazy(() => import('./components/Inventory/StocktakePage').then(module => ({ default: module.StocktakePage })));
const ExpiryRecallPage = lazy(() => import('./components/Inventory/ExpiryRecallPage').then(module => ({ default: module.ExpiryRecallPage })));
const ReorderShortbookPage = lazy(() => import('./components/Inventory/ReorderShortbookPage').then(module => ({ default: module.ReorderShortbookPage })));
const ProcurementCommandCenter = lazy(() => import('./components/Procurement/ProcurementCommandCenter').then(module => ({ default: module.ProcurementCommandCenter })));
const TransfersCommandCenter = lazy(() => import('./components/Transfers/TransfersCommandCenter').then(module => ({ default: module.TransfersCommandCenter })));
const OrdersCommandCenter = lazy(() => import('./components/Orders/OrdersCommandCenter').then(module => ({ default: module.OrdersCommandCenter })));

const router = createBrowserRouter([
    {
        path: '/',
        element: <RootLayout />,
        errorElement: <RouteError />,
        children: [
            { index: true, element: <HomeRedirect /> },
            { path: 'login', element: <LoginFlowPage /> },
            { path: 'reset-password', element: <ResetPasswordScreen /> },
            { path: 'register', element: <RegisterWizard /> },
            { path: getUserSubscriptionReturnPath(), element: <PaymentReturnPage /> },
            { path: '403', element: <Error403 /> },
            {
                path: 'admin',
                element: (
                    <AuthGuard requireRole={['SUPER_ADMIN']}>
                        <AdminLayout />
                    </AuthGuard>
                ),
                children: [
                    { index: true, element: <Navigate to="dashboard" replace /> },
                    { path: 'dashboard', element: <AdminDashboard /> },
                    { path: 'clinics', element: <AdminClinics /> },
                    { path: 'clinics/:id/profile', element: <AdminClinicProfile /> },
                    { path: 'clinics/:id', element: <AdminClinicProfile /> },
                    { path: 'users', element: <AdminUsers /> },
                    { path: 'system', element: <AdminSystemHealth /> },
                ]
            },
            {
                /* Pathless layout: matches /dashboard, /shortbook, etc. A parent with path: "" can fail to rank /shortbook in the data router. */
                element: (
                    <AuthGuard>
                        <ClinicLayout />
                    </AuthGuard>
                ),
                children: [
                    { path: 'dashboard', element: <ClinicDashboard /> },
                    { path: 'billing', element: <BillingSalesListPage /> },
                    { path: 'billing/new', element: <WebPos /> },
                    { path: 'orders', element: <OrdersCommandCenter /> },
                    { path: 'delivery', element: <OrdersCommandCenter fulfilment="HOME_DELIVERY" /> },
                    { path: 'procurement', element: <ProcurementCommandCenter /> },
                    { path: 'transfers', element: <TransfersCommandCenter /> },
                    { path: 'warehouse', element: <TransfersCommandCenter initialTab="warehouse" /> },
                    { path: 'purchases', element: <PurchasesListPage /> },
                    { path: 'purchases/new', element: <PurchaseWorkflowPage /> },
                    { path: 'inventory', element: <InventoryPageShell /> },
                    { path: 'inventory/command-center', element: <InventoryCommandCenter /> },
                    { path: 'inventory/stocktake', element: <StocktakePage /> },
                    { path: 'inventory/expiry-recall', element: <ExpiryRecallPage /> },
                    { path: 'inventory/reorder', element: <ReorderShortbookPage /> },
                    { path: 'inventory/classic', element: <InventoryPageShell /> },
                    { path: 'shortbook', element: <ShortbookPage /> },
                    { path: 'prescriptions', element: <PrescriptionQueuePage /> },
                    { path: 'patients/:id/medications', element: <PatientMedicationHistoryPage /> },
                    { path: 'customers', element: <CustomersListPage /> },
                    { path: 'customers/:id', element: <CustomerHistoryPage /> },
                    { path: 'suppliers', element: <SuppliersListPage /> },
                    { path: 'expenses', element: <ExpensesListPage /> },
                    { path: 'reports', element: <ReportsHubPage /> },
                    { path: 'price-books', element: <PriceBooksPage /> },
                    { path: 'promotions', element: <PromotionsPage /> },
                    { path: 'coupons', element: <CouponsPage /> },
                    { path: 'loyalty', element: <LoyaltyAdminPage /> },
                    { path: 'supplier-schemes', element: <SupplierSchemesPage /> },
                    { path: 'alerts', element: <ExpiryAlertsScreen /> },
                    { path: 'analytics', element: <BusinessAnalyticsScreen /> },
                    { path: 'settings', element: <SettingsScreen /> },
                    { path: 'settings/clinic', element: <ClinicProfileSettings /> },
                    {
                        path: 'settings/billing',
                        element: (
                            <AuthGuard requireRole={['OWNER']}>
                                <BillingSettings />
                            </AuthGuard>
                        ),
                    },
                    {
                        path: 'settings/users',
                        element: (
                            <AuthGuard requireRole={['OWNER']}>
                                <StaffSettings />
                            </AuthGuard>
                        ),
                    },
                    { path: 'settings/invoice', element: <ClinicProfileSettings invoiceOnly /> },
                    {
                        path: 'settings/import',
                        element: (
                            <AuthGuard requireRole={['OWNER']}>
                                <ImportDataScreen />
                            </AuthGuard>
                        ),
                    },
                ],
            },
        ]
    }
]);

function App() {
    return <RouterProvider router={router} />;
}

export default App;
