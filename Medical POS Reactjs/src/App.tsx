import { useEffect } from 'react';
import { createBrowserRouter, RouterProvider, Outlet } from 'react-router-dom';
import { useAuth } from './lib/auth';
import { AuthGuard } from './components/auth/AuthGuard';
import { LoginFlowPage } from './components/auth/LoginFlowPage';
import { HomeRedirect } from './components/auth/HomeRedirect';
import { startWebSyncListener } from './db/webSyncEngine';
import { supabase } from './lib/supabase';

const Placeholder = ({ title }: { title: string }) => <div className="p-4"><h1 className="text-xl">{title}</h1></div>;

const Error403 = () => <div className="p-8 text-center text-red-500"><h1 className="text-2xl font-bold">403 - Forbidden</h1><p>You do not have permission to access this page.</p></div>;

// The top level App layout where we check session
const RootLayout = () => {
    const { checkSession } = useAuth();
    
    useEffect(() => {
        checkSession();
        
        const getToken = async () => {
            const { data } = await supabase.auth.getSession();
            return data.session?.access_token || null;
        };
        startWebSyncListener(getToken);
    }, [checkSession]);

    return <Outlet />;
};

import { AdminLayout } from './components/admin/AdminLayout';
import { AdminDashboard } from './components/admin/AdminDashboard';
import { AdminClinics } from './components/admin/AdminClinics';
import { AdminUsers } from './components/admin/AdminUsers';
import { AdminSystemHealth } from './components/admin/AdminSystemHealth';
import { AdminClinicProfile } from './components/admin/AdminClinicProfile';

import { ClinicLayout } from './components/clinic/ClinicLayout';
import { ClinicDashboard } from './components/clinic/ClinicDashboard';
import { WebPos } from './components/clinic/WebPos';
import { RegisterWizard } from './components/auth/RegisterWizard';
import BillingSettings from './routes/(clinic)/settings/billing';
import { BusinessAnalyticsScreen } from './components/Analytics/BusinessAnalyticsScreen';
import { ImportDataScreen } from './components/Settings/ImportDataScreen';
import { BillingSalesListPage } from './components/clinic/BillingSalesListPage';
import { PurchasesListPage } from './components/clinic/PurchasesListPage';
import { CustomersListPage } from './components/clinic/CustomersListPage';
import { SuppliersListPage } from './components/clinic/SuppliersListPage';
import { ExpensesListPage } from './components/clinic/ExpensesListPage';
import { ReportsHubPage } from './components/clinic/ReportsHubPage';
import { PurchaseWorkflowPage, InventoryPageShell } from './components/clinic/EmbeddedClinicScreens';
import { ShortbookPage } from './components/clinic/ShortbookPage';
import { SettingsScreen } from './components/Settings/SettingsScreen';

const router = createBrowserRouter([
    {
        path: '/',
        element: <RootLayout />,
        children: [
            { index: true, element: <HomeRedirect /> },
            { path: 'login', element: <LoginFlowPage /> },
            { path: 'register', element: <RegisterWizard /> },
            { path: '403', element: <Error403 /> },
            {
                path: 'admin',
                element: (
                    <AuthGuard requireRole={['SUPER_ADMIN']}>
                        <AdminLayout />
                    </AuthGuard>
                ),
                children: [
                    { path: 'dashboard', element: <AdminDashboard /> },
                    { path: 'clinics', element: <AdminClinics /> },
                    { path: 'clinics/:id/profile', element: <AdminClinicProfile /> },
                    { path: 'clinics/:id', element: <Placeholder title="Clinic Details" /> },
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
                    { path: 'purchases', element: <PurchasesListPage /> },
                    { path: 'purchases/new', element: <PurchaseWorkflowPage /> },
                    { path: 'inventory', element: <InventoryPageShell /> },
                    { path: 'shortbook', element: <ShortbookPage /> },
                    { path: 'customers', element: <CustomersListPage /> },
                    { path: 'suppliers', element: <SuppliersListPage /> },
                    { path: 'expenses', element: <ExpensesListPage /> },
                    { path: 'reports', element: <ReportsHubPage /> },
                    { path: 'alerts', element: <Placeholder title="Alerts" /> },
                    { path: 'analytics', element: <BusinessAnalyticsScreen /> },
                    { path: 'settings', element: <SettingsScreen /> },
                    { path: 'settings/clinic', element: <Placeholder title="Clinic Settings" /> },
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
                                <Placeholder title="User Settings" />
                            </AuthGuard>
                        ),
                    },
                    { path: 'settings/invoice', element: <Placeholder title="Invoice Settings" /> },
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
