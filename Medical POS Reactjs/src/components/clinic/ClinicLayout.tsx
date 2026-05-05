import { useEffect, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { useAuth } from '../../lib/auth';
import { useClinicNavHotkeys } from '../../hooks/useClinicNavHotkeys';
import { useTheme } from '../../hooks/useTheme';
import { ShopProfileService } from '../../services/shopProfileService';
import { InventoryAlertService } from '../../services/inventoryAlertService';
import { startBackgroundSync, stopBackgroundSync, runSyncCycle, manualSync, forceQueueAllLocalData } from '../../sync/syncEngine';
import api from '../../lib/api';
import type { ShopProfile } from '../../core/types';
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
    HelpCircle,
    Store,
    Sun,
    Moon,
    AlertTriangle,
    CalendarClock,
    ClipboardList,
    ChevronRight,
    RefreshCw,
} from 'lucide-react';
import { Button } from '../ui/Button';

type NavItem = { name: string; path: string; icon: LucideIcon; fKey: number };

export const ClinicLayout = () => {
    const { signOut, user, session } = useAuth();
    const { theme, toggleTheme } = useTheme();
    const navigate = useNavigate();
    const location = useLocation();
    const [alertsOpen, setAlertsOpen] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);
    const [shopProfile, setShopProfile] = useState<ShopProfile | null>(null);
    const [failedLogoUrl, setFailedLogoUrl] = useState<string | null>(null);

    const handleSync = async () => {
        if (isSyncing) return;
        setIsSyncing(true);
        try {
            const result = await manualSync();
            if (result.errors > 0) {
                toast.error(`Sync completed with ${result.errors} errors. (Pushed: ${result.pushed}, Pulled: ${result.pulled})`);
            } else if (result.pushed === 0 && result.pulled === 0) {
                toast.success('Database is already up to date!');
            } else {
                toast.success(`Sync successful! Pushed: ${result.pushed}, Pulled: ${result.pulled}`);
            }
        } catch (error) {
            console.error('Manual sync failed:', error);
            toast.error('Failed to sync. Please check your connection.');
        } finally {
            setIsSyncing(false);
        }
    };

    useClinicNavHotkeys();

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            try {
                const local = await ShopProfileService.getShopProfileLocal();
                if (!cancelled) setShopProfile(local);
            } catch {
                /* no local row yet */
            }
            try {
                const synced = await ShopProfileService.syncShopProfile();
                if (!cancelled) setShopProfile(synced);
            } catch (err) {
                console.debug('[ClinicLayout] Shop profile sync skipped:', err);
            }
        };
        void load();
        
        // Start background sync and run initial cycle
        runSyncCycle().catch(console.error);
        startBackgroundSync();

        return () => {
            cancelled = true;
            stopBackgroundSync();
        };
    }, []);

    const meta = session?.user?.user_metadata as Record<string, string | undefined> | undefined;
    const shopDisplayName =
        shopProfile?.medical_name?.trim() ||
        (user as { clinics?: { name?: string } } | null)?.clinics?.name?.trim() ||
        meta?.shop_name?.trim() ||
        'Medical shop';

    const logoUrl = shopProfile?.logo_url?.trim();
    const showShopLogo = Boolean(logoUrl && failedLogoUrl !== logoUrl);

    const { data: alertSummary, isLoading: alertsLoading, refetch: refetchAlerts } = useQuery({
        queryKey: ['clinic-header-alerts', 'radar-v2'],
        queryFn: async () => {
            const { lowStock, expiry } = await InventoryAlertService.getCounts();
            let shortbookOpen = 0;
            try {
                const { data } = await api.get<{ data?: unknown[] }>('/shortbook');
                if (Array.isArray(data?.data)) shortbookOpen = data.data.length;
            } catch {
                /* API offline or route unavailable */
            }
            return { lowStock, expiring: expiry, shortbookOpen };
        },
        staleTime: 30_000,
    });

    useEffect(() => {
        if (alertsOpen) void refetchAlerts();
    }, [alertsOpen, refetchAlerts]);

    const lowStockN = alertSummary?.lowStock ?? 0;
    const expiringN = alertSummary?.expiring ?? 0;
    const shortbookN = alertSummary?.shortbookOpen ?? 0;
    const alertTotal = lowStockN + expiringN + shortbookN;

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
                    <div
                        className={`w-10 h-10 rounded border flex-shrink-0 overflow-hidden flex items-center justify-center ${
                            showShopLogo
                                ? 'border-border bg-bg-card'
                                : 'bg-accent-primary/20 border-accent-primary/50 text-accent-primary'
                        }`}
                    >
                        {showShopLogo ? (
                            <img
                                key={logoUrl}
                                src={logoUrl}
                                alt=""
                                className="w-full h-full object-contain"
                                onError={() => logoUrl && setFailedLogoUrl(logoUrl)}
                            />
                        ) : (
                            <Store className="w-5 h-5" strokeWidth={2.25} aria-hidden />
                        )}
                    </div>
                    <div className="truncate">
                        <h2 className="font-bold text-sm truncate">{shopDisplayName}</h2>
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
                <header className="h-14 bg-bg-surface border-b border-border flex items-center justify-end px-3 sm:px-6 gap-2 sm:gap-4 shrink-0 min-w-0">
                    <button
                        type="button"
                        onClick={async () => {
                            if (isSyncing) return;
                            setIsSyncing(true);
                            try {
                                toast.loading('Force uploading all local data to server...', { id: 'force-sync' });
                                const pushed = await forceQueueAllLocalData();
                                if (pushed > 0) {
                                    toast.success(`Force Upload complete! ${pushed} records pushed to server.`, { id: 'force-sync' });
                                } else {
                                    toast.error('No records found in local database to push. (Open browser console for details)', { id: 'force-sync' });
                                }
                            } catch (error: any) {
                                console.error('Force sync failed:', error);
                                toast.error(error?.message || 'Force sync failed.', { id: 'force-sync' });
                            } finally {
                                setIsSyncing(false);
                            }
                        }}
                        disabled={isSyncing}
                        className={`text-[10px] font-bold uppercase tracking-wider text-warning hover:text-warning-strong px-2 py-1.5 transition-colors ${isSyncing ? 'opacity-50 cursor-wait' : ''}`}
                        title="Force upload all existing local data to the server"
                    >
                        Force Upload All
                    </button>
                    <button
                        type="button"
                        onClick={handleSync}
                        disabled={isSyncing}
                        className={`text-xs font-medium border rounded-lg px-3 py-1.5 transition-colors flex items-center gap-2 ${
                            isSyncing 
                                ? 'text-primary bg-primary/10 border-primary/30 cursor-wait' 
                                : 'text-muted border-border hover:text-foreground bg-surface-elevated hover:bg-surface-alt'
                        }`}
                        title="Force sync data with server"
                    >
                        <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin text-primary' : 'text-muted'}`} strokeWidth={2} />
                        <span className="hidden sm:inline font-bold uppercase tracking-wider text-[10px]">{isSyncing ? 'Syncing...' : 'Sync Now'}</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => toggleTheme()}
                        onMouseDown={(e) => e.preventDefault()}
                        title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                        aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                        className="h-9 w-9 rounded-lg border border-border bg-surface-elevated hover:bg-surface-alt text-muted hover:text-foreground flex items-center justify-center transition-colors"
                    >
                        {theme === 'dark' ? (
                            <Sun className="w-5 h-5 text-warning" strokeWidth={2} aria-hidden />
                        ) : (
                            <Moon className="w-5 h-5 text-foreground/80" strokeWidth={2} aria-hidden />
                        )}
                    </button>
                    <button type="button" className="text-muted hover:text-foreground" aria-label="Help">
                        <HelpCircle className="w-5 h-5" />
                    </button>
                    <button 
                        type="button"
                        className="relative text-muted hover:text-accent-primary p-1 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus ring-offset-2 ring-offset-background"
                        onClick={() => setAlertsOpen(!alertsOpen)}
                        aria-expanded={alertsOpen}
                        aria-label={alertsOpen ? 'Close alerts' : 'Open alerts'}
                    >
                        <Bell className="w-5 h-5" aria-hidden />
                        {alertTotal > 0 && (
                            <span className="absolute -top-0.5 -right-0.5 min-w-[1.125rem] h-[1.125rem] px-0.5 rounded-full bg-danger text-[9px] font-black text-on-danger flex items-center justify-center border-2 border-bg-surface shadow-sm tabular-nums leading-none">
                                {alertTotal > 99 ? '99+' : alertTotal}
                            </span>
                        )}
                    </button>
                    <div className="w-px h-6 bg-border mx-1 sm:mx-2 shrink-0" />
                    <div className="text-xs sm:text-sm font-medium min-w-0 flex items-center gap-2 max-w-[45%] sm:max-w-none">
                        <span className="text-[10px] sm:text-xs uppercase bg-bg-card px-2 py-1 rounded border border-border text-muted shrink-0">
                            {user?.role}
                        </span>
                        <span className="truncate text-foreground">{user?.full_name}</span>
                    </div>
                </header>

                {/* Page Content */}
                <main className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden relative bg-background">
                    <Outlet />

                    {/* Alerts Drawer Overlay Placeholder for Block 3 */}
                    {alertsOpen && (
                        <>
                            <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px]" onClick={() => setAlertsOpen(false)} aria-hidden />
                            <aside
                                className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-surface border-l-2 border-border z-50 shadow-2xl flex flex-col"
                                role="dialog"
                                aria-modal="true"
                                aria-labelledby="alerts-drawer-title"
                            >
                                <div className="flex justify-between items-center gap-3 p-4 border-b border-border bg-surface-elevated/80">
                                    <h3 id="alerts-drawer-title" className="font-black text-lg tracking-tight text-foreground-strong">
                                        Alerts
                                    </h3>
                                    <button
                                        type="button"
                                        onClick={() => setAlertsOpen(false)}
                                        className="text-muted hover:text-foreground text-2xl leading-none p-1 rounded-lg hover:bg-bg-card transition-colors"
                                        aria-label="Close alerts"
                                    >
                                        &times;
                                    </button>
                                </div>
                                <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar" aria-busy={alertsLoading}>
                                    <p className="text-xs text-muted leading-relaxed">
                                        Counts follow Settings (expiry window &amp; per-SKU minimum stock). Inventory data is from this device&apos;s local database.
                                    </p>

                                    {alertsLoading && !alertSummary ? (
                                        <div className="space-y-3">
                                            {[1, 2, 3].map((i) => (
                                                <div key={i} className="h-28 rounded-xl bg-bg-card animate-pulse border border-border" />
                                            ))}
                                        </div>
                                    ) : (
                                        <>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    navigate('/inventory?focus=low_stock');
                                                    setAlertsOpen(false);
                                                }}
                                                className="w-full text-left rounded-xl border-2 border-danger/50 bg-danger/10 dark:bg-danger/20 hover:bg-danger/15 dark:hover:bg-danger/25 hover:border-danger p-4 shadow-md transition-all group ring-1 ring-danger/20"
                                            >
                                                <div className="flex items-start gap-4">
                                                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-danger/25 text-danger border border-danger/30">
                                                        <AlertTriangle className="w-6 h-6" strokeWidth={2.25} aria-hidden />
                                                    </div>
                                                    <div className="min-w-0 flex-1">
                                                        <p className="text-xs font-black uppercase tracking-widest text-danger">Low stock</p>
                                                        <p className="text-3xl font-black tabular-nums text-foreground-strong mt-1">{lowStockN}</p>
                                                        <p className="text-sm text-muted mt-0.5">Medicine SKUs below minimum on-hand threshold</p>
                                                        <span className="mt-3 inline-flex items-center gap-1 text-xs font-black uppercase tracking-wider text-danger group-hover:gap-2 transition-all">
                                                            View in inventory <ChevronRight className="w-4 h-4" aria-hidden />
                                                        </span>
                                                    </div>
                                                </div>
                                            </button>

                                            <button
                                                type="button"
                                                onClick={() => {
                                                    navigate('/inventory?focus=expiring');
                                                    setAlertsOpen(false);
                                                }}
                                                className="w-full text-left rounded-xl border-2 border-warning/50 bg-warning/10 dark:bg-warning/20 hover:bg-warning/15 dark:hover:bg-warning/25 hover:border-warning p-4 shadow-md transition-all group ring-1 ring-warning/20"
                                            >
                                                <div className="flex items-start gap-4">
                                                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-warning/25 text-warning border border-warning/30">
                                                        <CalendarClock className="w-6 h-6" strokeWidth={2.25} aria-hidden />
                                                    </div>
                                                    <div className="min-w-0 flex-1">
                                                        <p className="text-xs font-black uppercase tracking-widest text-warning">Expiring / expiry risk</p>
                                                        <p className="text-3xl font-black tabular-nums text-foreground-strong mt-1">{expiringN}</p>
                                                        <p className="text-sm text-muted mt-0.5">Batches with stock in the configured expiry window</p>
                                                        <span className="mt-3 inline-flex items-center gap-1 text-xs font-black uppercase tracking-wider text-warning group-hover:gap-2 transition-all">
                                                            View in inventory <ChevronRight className="w-4 h-4" aria-hidden />
                                                        </span>
                                                    </div>
                                                </div>
                                            </button>

                                            <button
                                                type="button"
                                                onClick={() => {
                                                    navigate('/shortbook');
                                                    setAlertsOpen(false);
                                                }}
                                                className="w-full text-left rounded-xl border-2 border-success/50 bg-success/10 dark:bg-success/20 hover:bg-success/15 dark:hover:bg-success/25 hover:border-success p-4 shadow-md transition-all group ring-1 ring-success/20"
                                            >
                                                <div className="flex items-start gap-4">
                                                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-success/25 text-success border border-success/30">
                                                        <ClipboardList className="w-6 h-6" strokeWidth={2.25} aria-hidden />
                                                    </div>
                                                    <div className="min-w-0 flex-1">
                                                        <p className="text-xs font-black uppercase tracking-widest text-success">Shortbook</p>
                                                        <p className="text-3xl font-black tabular-nums text-foreground-strong mt-1">{shortbookN}</p>
                                                        <p className="text-sm text-muted mt-0.5">Open reorder queue items (when online API is available)</p>
                                                        <span className="mt-3 inline-flex items-center gap-1 text-xs font-black uppercase tracking-wider text-success group-hover:gap-2 transition-all">
                                                            Open shortbook <ChevronRight className="w-4 h-4" aria-hidden />
                                                        </span>
                                                    </div>
                                                </div>
                                            </button>
                                        </>
                                    )}
                                </div>
                            </aside>
                        </>
                    )}
                </main>
            </div>
        </div>
    );
};
