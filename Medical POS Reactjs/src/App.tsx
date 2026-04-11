import { useEffect } from 'react';
import { createBrowserRouter, RouterProvider, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from './lib/auth';
import { AuthGuard } from './components/auth/AuthGuard';

// Placeholder Pages - We will map these in Block 4 & 5
const Placeholder = ({ title }: { title: string }) => <div className="p-4"><h1 className="text-xl">{title}</h1></div>;

const Login = () => {
    const { session, role } = useAuth();
    const navigate = useNavigate();

    useEffect(() => {
        if (session) {
            if (role === 'SUPER_ADMIN') {
                navigate('/admin/dashboard', { replace: true });
            } else {
                navigate('/dashboard', { replace: true });
            }
        }
    }, [session, role, navigate]);

    return <Placeholder title="Login Screen" />;
};

const Error403 = () => <div className="p-8 text-center text-red-500"><h1 className="text-2xl font-bold">403 - Forbidden</h1><p>You do not have permission to access this page.</p></div>;

// The top level App layout where we check session
const RootLayout = () => {
    const { checkSession } = useAuth();
    
    useEffect(() => {
        checkSession();
    }, [checkSession]);

    return <Outlet />;
};

import { AdminLayout } from './components/admin/AdminLayout';
import { AdminDashboard } from './components/admin/AdminDashboard';
import { AdminClinics } from './components/admin/AdminClinics';
import { AdminUsers } from './components/admin/AdminUsers';
import { AdminSystemHealth } from './components/admin/AdminSystemHealth';

import { ClinicLayout } from './components/clinic/ClinicLayout';
import { ClinicDashboard } from './components/clinic/ClinicDashboard';
import { WebPos } from './components/clinic/WebPos';
import { RegisterWizard } from './components/auth/RegisterWizard';
import BillingSettings from './routes/(clinic)/settings/billing';
import { BusinessAnalyticsScreen } from './components/Analytics/BusinessAnalyticsScreen';
import { ImportDataScreen } from './components/Settings/ImportDataScreen';

const router = createBrowserRouter([
    {
        path: '/',
        element: <RootLayout />,
        children: [
            { path: 'login', element: <Login /> },
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
                    { path: 'clinics/:id', element: <Placeholder title="Clinic Details" /> },
                    { path: 'users', element: <AdminUsers /> },
                    { path: 'system', element: <AdminSystemHealth /> },
                ]
            },
            {
                path: '',
                element: (
                    <AuthGuard>
                        <ClinicLayout />
                    </AuthGuard>
                ),
                children: [
                    { path: 'dashboard', element: <ClinicDashboard /> },
                    { path: 'billing', element: <Placeholder title="Billing Sales List" /> },
                    { path: 'billing/new', element: <WebPos /> },
                    { path: 'purchases', element: <Placeholder title="Purchases List" /> },
                    { path: 'purchases/new', element: <Placeholder title="New Purchase" /> },
                    { path: 'inventory', element: <Placeholder title="Inventory List" /> },
                    { path: 'customers', element: <Placeholder title="Customers" /> },
                    { path: 'suppliers', element: <Placeholder title="Suppliers" /> },
                    { path: 'expenses', element: <Placeholder title="Expenses" /> },
                    { path: 'reports', element: <Placeholder title="Reports Hub" /> },
                    { path: 'alerts', element: <Placeholder title="Alerts" /> },
                    { path: 'settings/clinic', element: <Placeholder title="Clinic Settings" /> },
                    { path: 'settings/billing', element: <AuthGuard requireRole={['OWNER']}><BillingSettings /></AuthGuard> },
                    { path: 'settings/users', element: <AuthGuard requireRole={['OWNER']}><Placeholder title="User Settings" /></AuthGuard> },
                    { path: 'settings/invoice', element: <Placeholder title="Invoice Settings" /> },
                    { path: 'analytics', element: <BusinessAnalyticsScreen /> },
                    { path: 'settings/import', element: <AuthGuard requireRole={['OWNER']}><ImportDataScreen /></AuthGuard> },
                ]
            }
        ]
    }
]);

function App() {
    return <RouterProvider router={router} />;
}

export default App;
