import { useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../lib/auth';
import { useClinicNavHotkeys } from '../../hooks/useClinicNavHotkeys';
import { 
    LayoutDashboard, 
    Receipt, 
    ShoppingCart, 
    PackageSearch, 
    Users, 
    Building2, 
    Wallet, 
    FileBarChart, 
    LineChart,
    Upload,
    Settings, 
    LogOut,
    Bell,
    HelpCircle
} from 'lucide-react';
import { Button } from '../ui/Button';

type NavItem = { name: string; path: string; icon: LucideIcon; fKey: number };

export const ClinicLayout = () => {
    const { signOut, user } = useAuth();
    const location = useLocation();
    const [alertsOpen, setAlertsOpen] = useState(false);

    useClinicNavHotkeys();

    const MAIN_NAV: NavItem[] = [
        { name: 'Dashboard', path: '/dashboard', icon: LayoutDashboard, fKey: 1 },
        { name: 'Billing', path: '/billing', icon: Receipt, fKey: 2 },
        { name: 'Purchases', path: '/purchases', icon: ShoppingCart, fKey: 3 },
        { name: 'Inventory', path: '/inventory', icon: PackageSearch, fKey: 4 },
    ];

    const PEOPLE_NAV: NavItem[] = [
        { name: 'Customers', path: '/customers', icon: Users, fKey: 5 },
        { name: 'Suppliers', path: '/suppliers', icon: Building2, fKey: 6 },
    ];

    const FINANCE_NAV: NavItem[] = [
        { name: 'Expenses', path: '/expenses', icon: Wallet, fKey: 7 },
        { name: 'Reports', path: '/reports', icon: FileBarChart, fKey: 8 },
        { name: 'Analytics', path: '/analytics', icon: LineChart, fKey: 9 },
    ];

    const SYSTEM_NAV: NavItem[] = [
        { name: 'Settings', path: '/settings', icon: Settings, fKey: 10 },
        { name: 'Import data', path: '/settings/import', icon: Upload, fKey: 11 },
    ];

    const renderNavLinks = (links: NavItem[]) => {
        return links.map((link) => {
            const isActive = location.pathname.startsWith(link.path);
            const Icon = link.icon;
            return (
                <Link
                    key={link.path}
                    to={link.path}
                    title={`${link.name} (F${link.fKey})`}
                    aria-keyshortcuts={`F${link.fKey}`}
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-sm font-medium ${
                        isActive 
                            ? 'bg-accent-primary/10 text-accent-primary' 
                            : 'text-muted hover:bg-bg-card hover:text-foreground'
                    }`}
                >
                    <Icon className="w-5 h-5" />
                    <span className="flex-1">{link.name}</span>
                    <kbd className="hidden xl:inline text-[10px] font-mono text-muted/70 border border-border rounded px-1 py-0.5 bg-bg-card">
                        F{link.fKey}
                    </kbd>
                </Link>
            );
        });
    };

    return (
        <div className="flex h-screen bg-bg-primary text-foreground overflow-hidden">
            {/* Sidebar */}
            <aside className="w-64 bg-bg-surface border-r border-border flex flex-col flex-shrink-0 relative">
                <div className="p-4 border-b border-border flex items-center gap-3">
                    <div className="w-10 h-10 bg-accent-primary/20 rounded border border-accent-primary/50 flex items-center justify-center flex-shrink-0 text-accent-primary font-black text-xl">
                        {user?.clinics?.name?.charAt(0) || 'M'}
                    </div>
                    <div className="truncate">
                        <h2 className="font-bold text-sm truncate">{user?.clinics?.name || 'Clinic Name'}</h2>
                        <p className="text-xs text-muted truncate">{user?.full_name}</p>
                    </div>
                </div>
                
                <nav className="flex-1 p-3 space-y-6 overflow-y-auto custom-scrollbar">
                    <div>
                        <p className="px-3 text-xs font-bold uppercase tracking-wider text-muted mb-2">Main</p>
                        <div className="space-y-1">{renderNavLinks(MAIN_NAV)}</div>
                    </div>
                    <div>
                        <p className="px-3 text-xs font-bold uppercase tracking-wider text-muted mb-2">People</p>
                        <div className="space-y-1">{renderNavLinks(PEOPLE_NAV)}</div>
                    </div>
                    <div>
                        <p className="px-3 text-xs font-bold uppercase tracking-wider text-muted mb-2">Finance</p>
                        <div className="space-y-1">{renderNavLinks(FINANCE_NAV)}</div>
                    </div>
                    <div>
                        <p className="px-3 text-xs font-bold uppercase tracking-wider text-muted mb-2">System</p>
                        <div className="space-y-1">{renderNavLinks(SYSTEM_NAV)}</div>
                    </div>
                </nav>

                <div className="p-3 border-t border-border space-y-2">
                    <p className="px-2 text-[10px] text-muted leading-snug">
                        <span className="font-bold text-foreground/80">F12</span> New invoice · F1–F11 sidebar (off when typing)
                    </p>
                    <Button 
                        variant="ghost" 
                        size="sm"
                        className="w-full justify-start text-muted hover:text-danger hover:bg-danger/10"
                        onClick={() => signOut()}
                    >
                        <LogOut className="w-4 h-4 mr-3" />
                        Sign Out
                    </Button>
                </div>
            </aside>

            {/* Main Content Area */}
            <div className="flex-1 flex flex-col min-w-0">
                {/* Topbar */}
                <header className="h-14 bg-bg-surface border-b border-border flex items-center justify-end px-6 gap-4">
                    <button className="text-muted hover:text-foreground">
                        <HelpCircle className="w-5 h-5" />
                    </button>
                    <button 
                        className="text-muted hover:text-accent-primary relative"
                        onClick={() => setAlertsOpen(!alertsOpen)}
                    >
                        <Bell className="w-5 h-5" />
                        <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-danger rounded-full border border-bg-surface" />
                    </button>
                    <div className="w-px h-6 bg-border mx-2" />
                    <div className="text-sm font-medium">
                        <span className="text-xs uppercase bg-bg-card px-2 py-1 rounded border border-border mr-2 text-muted">{user?.role}</span>
                        {user?.full_name}
                    </div>
                </header>

                {/* Page Content */}
                <main className="flex-1 overflow-y-auto relative bg-background">
                    <Outlet />

                    {/* Alerts Drawer Overlay Placeholder for Block 3 */}
                    {alertsOpen && (
                        <>
                            <div className="fixed inset-0 z-40 bg-black/50" onClick={() => setAlertsOpen(false)} />
                            <div className="fixed right-0 top-0 bottom-0 w-80 bg-bg-surface border-l border-border z-50 p-4 shadow-xl translate-x-0 transition-transform">
                                <div className="flex justify-between items-center mb-6">
                                    <h3 className="font-bold text-lg">Alerts</h3>
                                    <button onClick={() => setAlertsOpen(false)} className="text-muted hover:text-foreground text-2xl leading-none">&times;</button>
                                </div>
                                <div className="space-y-4">
                                    <div className="p-3 rounded-lg border border-warning/30 bg-warning/5 text-warning font-medium">12 Items Low Stock</div>
                                    <div className="p-3 rounded-lg border border-danger/30 bg-danger/5 text-danger font-medium">3 Batches Expiring</div>
                                </div>
                            </div>
                        </>
                    )}
                </main>
            </div>
        </div>
    );
};
