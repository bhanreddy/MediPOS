import { useEffect, useRef, useState } from "react";
import * as Dialog from '@radix-ui/react-dialog';
import type { LucideIcon } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ConnectionStatus, WorkspaceRoute } from '../layout/WorkspaceRoute';
import { useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { useAuth } from "../../lib/auth";
import { useClinicNavHotkeys } from "../../hooks/useClinicNavHotkeys";
import { useTheme } from "../../hooks/useTheme";
import { ShopProfileService } from "../../services/shopProfileService";
import { InventoryAlertService } from "../../services/inventoryAlertService";
import { useRealtimeEvents } from "../../hooks/useRealtimeEvents";
import type { ShopProfile } from "../../core/types";
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
  Bell,
  Sun,
  Moon,
  AlertTriangle,
  CalendarClock,
  ClipboardList,
  ChevronRight,
  RefreshCw,
  BookOpen,
  Sparkles,
  Ticket,
  Award,
  Truck,
  Grid2X2,
  X,
} from "lucide-react";
import { Button } from "../ui/Button";
import { ClinicSidebar } from "./ClinicSidebar";
import { LiquidSurface } from "../glass/LiquidGlass";

type NavItem = { name: string; path: string; icon: LucideIcon; fKey?: number };

export const ClinicLayout = () => {
  const { signOut, user, session } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const [alertsOpen, setAlertsOpen] = useState(false);
  const alertsTriggerRef = useRef<HTMLButtonElement>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);
  useEffect(() => {
    if (!mobileMenuOpen) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const panel = document.getElementById("clinic-navigation");
    panel?.querySelector<HTMLButtonElement>(".liquid-menu-close")?.focus();
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileMenuOpen(false);
      if (event.key !== "Tab" || !panel) return;
      const controls = Array.from(
        panel.querySelectorAll<HTMLElement>("a[href],button:not([disabled]),input:not([disabled])"),
      ).filter((element) => element.offsetParent !== null);
      const first = controls[0],
        last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    const breakpoint = window.matchMedia("(max-width: 480px)");
    const onBreakpoint = () => {
      if (!breakpoint.matches) setMobileMenuOpen(false);
    };
    window.addEventListener("keydown", close);
    breakpoint.addEventListener("change", onBreakpoint);
    return () => {
      window.removeEventListener("keydown", close);
      breakpoint.removeEventListener("change", onBreakpoint);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [mobileMenuOpen]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [shopProfile, setShopProfile] = useState<ShopProfile | null>(null);
  const [failedLogoUrl, setFailedLogoUrl] = useState<string | null>(null);

  const handleSync = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      await queryClient.invalidateQueries();
      toast.success("Refreshed from server.");
    } catch (error) {
      console.error("Manual sync failed:", error);
      toast.error("Failed to refresh. Please check your connection.");
    } finally {
      setIsSyncing(false);
    }
  };

  useClinicNavHotkeys();
  useRealtimeEvents();

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
        console.debug("[ClinicLayout] Shop profile sync skipped:", err);
      }
    };
    void load();
    window.addEventListener("medpos:shop-profile-updated", load);

    return () => {
      cancelled = true;
      window.removeEventListener("medpos:shop-profile-updated", load);
    };
  }, []);

  const meta = session?.user?.user_metadata as
    Record<string, string | undefined> | undefined;
  const shopDisplayName =
    shopProfile?.medical_name?.trim() ||
    (user as { clinics?: { name?: string } } | null)?.clinics?.name?.trim() ||
    meta?.shop_name?.trim() ||
    "Medical shop";

  const logoUrl = shopProfile?.logo_url?.trim();
  const showShopLogo = Boolean(logoUrl && failedLogoUrl !== logoUrl);

  const {
    data: alertSummary,
    isLoading: alertsLoading,
    isError: alertsError,
    refetch: refetchAlerts,
  } = useQuery({
    queryKey: ["clinic-header-alerts", "radar-v2"],
    queryFn: async () => {
      const { lowStock, expiry, shortbook } = await InventoryAlertService.getCounts();
      return { lowStock, expiring: expiry, shortbookOpen: shortbook };
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
    { name: "Dashboard", path: "/dashboard", icon: LayoutDashboard, fKey: 1 },
    { name: "Billing", path: "/billing", icon: Receipt, fKey: 2 },
    { name: "Prescriptions", path: "/prescriptions", icon: ClipboardList },
    { name: "Purchases", path: "/purchases", icon: ShoppingCart, fKey: 3 },
    { name: "Inventory", path: "/inventory", icon: PackageSearch, fKey: 4 },
  ];

  const PEOPLE_NAV: NavItem[] = [
    { name: "Customers", path: "/customers", icon: Users, fKey: 5 },
    { name: "Suppliers", path: "/suppliers", icon: Building2, fKey: 6 },
  ];

  const FINANCE_NAV: NavItem[] = [
    { name: "Expenses", path: "/expenses", icon: Wallet, fKey: 7 },
    { name: "Reports", path: "/reports", icon: FileBarChart, fKey: 8 },
    { name: "Analytics", path: "/analytics", icon: LineChart, fKey: 9 },
  ];

  const COMMERCIAL_NAV: NavItem[] = [
    { name: "Price Books", path: "/price-books", icon: BookOpen },
    { name: "Promotions", path: "/promotions", icon: Sparkles },
    { name: "Coupons", path: "/coupons", icon: Ticket },
    { name: "Loyalty & Tiers", path: "/loyalty", icon: Award },
    { name: "Supplier Schemes", path: "/supplier-schemes", icon: Truck },
  ];

  const OPERATIONS_NAV: NavItem[] = [
    { name: "Orders", path: "/orders", icon: ClipboardList },
    { name: "Delivery", path: "/delivery", icon: Truck },
    { name: "Procurement", path: "/procurement", icon: ShoppingCart },
    { name: "Transfers", path: "/transfers", icon: Truck },
    { name: "Warehouse", path: "/warehouse", icon: Building2 },
    { name: "Stocktake", path: "/inventory/stocktake", icon: ClipboardList },
    {
      name: "Expiry & recalls",
      path: "/inventory/expiry-recall",
      icon: CalendarClock,
    },
    { name: "Reorder", path: "/inventory/reorder", icon: PackageSearch },
    {
      name: "Inventory intelligence",
      path: "/inventory/command-center",
      icon: LineChart,
    },
  ];

  const SYSTEM_NAV: NavItem[] = [
    { name: "Settings", path: "/settings", icon: Settings, fKey: 10 },
    { name: "Import data", path: "/settings/import", icon: Upload, fKey: 11 },
  ];

  const activeNav = [...MAIN_NAV, ...PEOPLE_NAV, ...FINANCE_NAV, ...COMMERCIAL_NAV, ...OPERATIONS_NAV, ...SYSTEM_NAV]
    .filter((item) => location.pathname === item.path || location.pathname.startsWith(`${item.path}/`))
    .sort((a, b) => b.path.length - a.path.length)[0];
  const pageLabel = location.pathname === '/billing/new' ? 'New invoice'
    : location.pathname === '/purchases/new' ? 'New purchase'
    : location.pathname.startsWith('/patients/') ? 'Medication history'
    : activeNav?.name || 'Workspace';

  return (
    <div
      className={`flex h-screen bg-bg-primary text-foreground overflow-hidden clinic-liquid-shell ${mobileMenuOpen ? "is-mobile-menu-open" : ""} ${location.pathname === "/dashboard" ? "nex-dashboard-shell" : ""}`}
    >
      <a href="#workspace-content" className="skip-link">Skip to page content</a>
      {mobileMenuOpen && (
        <button
          className="liquid-menu-scrim"
          aria-hidden="true"
          tabIndex={-1}
          onClick={() => setMobileMenuOpen(false)}
        />
      )}
      <ClinicSidebar
        primary={MAIN_NAV}
        sections={[
          { id: 'people', label: 'People', icon: Users, items: PEOPLE_NAV },
          { id: 'finance', label: 'Finance', icon: Wallet, items: FINANCE_NAV },
          { id: 'commercial', label: 'Commercial', icon: Sparkles, items: COMMERCIAL_NAV },
          { id: 'operations', label: 'Operations', icon: PackageSearch, items: OPERATIONS_NAV },
        ]}
        settings={SYSTEM_NAV}
        activePath={activeNav?.path}
        shopName={shopDisplayName}
        logoUrl={showShopLogo ? logoUrl : undefined}
        onLogoError={() => logoUrl && setFailedLogoUrl(logoUrl)}
        mobileOpen={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
        onSignOut={() => void signOut()}
      />

      <LiquidSurface
        className="liquid-mobile-dock"
        inert={mobileMenuOpen || undefined}
      >
        <nav aria-label="Quick navigation">
          <Link
            to="/dashboard"
            aria-current={
              location.pathname === "/dashboard" ? "page" : undefined
            }
          >
            <LayoutDashboard size={20} />
            <span>Home</span>
          </Link>
          <Link
            to="/inventory"
            aria-current={
              location.pathname.startsWith("/inventory") ? "page" : undefined
            }
          >
            <PackageSearch size={20} />
            <span>Stock</span>
          </Link>
          <Link
            to="/billing"
            aria-current={
              location.pathname.startsWith("/billing") ? "page" : undefined
            }
          >
            <Receipt size={20} />
            <span>Sales</span>
          </Link>
          <button
            onClick={() => setMobileMenuOpen((open) => !open)}
            aria-expanded={mobileMenuOpen}
            aria-controls="clinic-navigation"
          >
            <Grid2X2 size={20} />
            <span>More</span>
          </button>
        </nav>
      </LiquidSurface>
      {/* Main Content Area */}
      <div
        className="flex-1 flex flex-col min-w-0"
        inert={mobileMenuOpen || undefined}
      >
        {/* Topbar */}
        <header className="h-14 bg-bg-surface border-b border-border flex items-center justify-end px-3 sm:px-6 gap-2 sm:gap-4 shrink-0 min-w-0">
          <div className="workspace-breadcrumb">
            <span>Workspace</span><ChevronRight size={13} aria-hidden /><strong>{pageLabel}</strong>
          </div>
          <button
            type="button"
            onClick={handleSync}
            disabled={isSyncing}
            className={`text-xs font-medium border rounded-lg px-3 py-1.5 transition-colors flex items-center gap-2 ${
              isSyncing
                ? "text-primary bg-primary/10 border-primary/30 cursor-wait"
                : "text-muted border-border hover:text-foreground bg-surface-elevated hover:bg-surface-alt"
            }`}
            title="Refresh data"
            aria-label="Refresh data"
          >
            <RefreshCw
              className={`w-4 h-4 ${isSyncing ? "animate-spin text-primary" : "text-muted"}`}
              strokeWidth={2}
            />
            <span className="hidden sm:inline font-medium text-[11px]">
              {isSyncing ? "Refreshing..." : "Refresh"}
            </span>
          </button>
          <button
            type="button"
            onClick={() => toggleTheme()}
            onMouseDown={(e) => e.preventDefault()}
            title={
              theme === "dark" ? "Switch to light mode" : "Switch to dark mode"
            }
            aria-label={
              theme === "dark" ? "Switch to light mode" : "Switch to dark mode"
            }
            className="h-9 w-9 rounded-lg border border-border bg-surface-elevated hover:bg-surface-alt text-muted hover:text-foreground flex items-center justify-center transition-colors"
          >
            {theme === "dark" ? (
              <Sun
                className="w-5 h-5 text-warning"
                strokeWidth={2}
                aria-hidden
              />
            ) : (
              <Moon
                className="w-5 h-5 text-foreground/80"
                strokeWidth={2}
                aria-hidden
              />
            )}
          </button>
          <button
            type="button"
            ref={alertsTriggerRef}
            className="workspace-icon-button relative"
            title="Inventory alerts"
            onClick={() => setAlertsOpen(!alertsOpen)}
            aria-expanded={alertsOpen}
            aria-label={alertsOpen ? "Close alerts" : "Open alerts"}
          >
            <Bell className="w-5 h-5" aria-hidden />
            {alertTotal > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[1.125rem] h-[1.125rem] px-0.5 rounded-full bg-danger text-[9px] font-black text-on-danger flex items-center justify-center border-2 border-bg-surface shadow-sm tabular-nums leading-none">
                {alertTotal > 99 ? "99+" : alertTotal}
              </span>
            )}
          </button>
          <div className="w-px h-6 bg-border mx-1 sm:mx-2 shrink-0" />
          <div className="text-xs sm:text-sm font-medium min-w-0 flex items-center gap-2 max-w-[45%] sm:max-w-none">
            <span className="workspace-role text-[10px] text-muted shrink-0">
              {user?.role}
            </span>
            <span className="workspace-user-name truncate text-foreground text-xs">{user?.full_name}</span>
            <span className="workspace-avatar" title={user?.full_name || 'Account'}>
              {(user?.full_name || 'User').split(' ').filter(Boolean).slice(0, 2).map((word) => word[0]).join('').toUpperCase()}
            </span>
          </div>
        </header>

        {/* Page Content */}
        {sessionStorage.getItem("impersonate_clinic_id") && (
          <div className="p-3 bg-warning/10 text-warning flex items-center justify-between">
            <span>
              Viewing{" "}
              {sessionStorage.getItem("impersonate_clinic_name") || "clinic"} as
              administrator
            </span>
            <Button
              onClick={() => {
                sessionStorage.removeItem("impersonate_clinic_id");
                sessionStorage.removeItem("impersonate_clinic_name");
                queryClient.clear();
                window.location.href = "/admin/clinics";
              }}
            >
              Exit clinic view
            </Button>
          </div>
        )}
        <ConnectionStatus />
        <main id="workspace-content" tabIndex={-1} className="premium-content flex-1 min-w-0 overflow-y-auto overflow-x-hidden relative bg-background">
          <WorkspaceRoute label={pageLabel} />

          <Dialog.Root open={alertsOpen} onOpenChange={setAlertsOpen}>
            <Dialog.Portal>
              <Dialog.Overlay className="notification-overlay" />
              <Dialog.Content className="notification-panel" aria-describedby={undefined} onCloseAutoFocus={event => { event.preventDefault(); alertsTriggerRef.current?.focus(); }}>
                <div className="notification-heading">
                  <span className="notification-heading-icon"><Bell size={18} aria-hidden="true" /></span>
                  <Dialog.Title>Notifications</Dialog.Title>
                  <Dialog.Close className="notification-close" aria-label="Close alerts"><X size={18} /></Dialog.Close>
                </div>
                <div className="notification-list" aria-busy={alertsLoading}>
                  {alertsLoading && !alertSummary ? (
                    <div role="status" aria-label="Loading notifications">{[1, 2, 3].map(i => <div key={i} className="notification-skeleton" />)}</div>
                  ) : alertsError ? (
                    <div className="notification-error" role="alert"><p>Notifications couldn’t load.</p><button onClick={() => void refetchAlerts()}>Try again</button></div>
                  ) : (
                    [
                      { title: 'Low stock', count: lowStockN, message: `${lowStockN} ${lowStockN === 1 ? 'medicine needs' : 'medicines need'} restocking`, clear: 'Stock levels are healthy', icon: AlertTriangle, tone: 'rose', path: '/inventory?focus=low_stock' },
                      { title: 'Expiring soon', count: expiringN, message: `${expiringN} ${expiringN === 1 ? 'batch needs' : 'batches need'} a review`, clear: 'No batches nearing expiry', icon: CalendarClock, tone: 'amber', path: '/inventory?focus=expiring' },
                      { title: 'Reorder queue', count: shortbookN, message: `${shortbookN} ${shortbookN === 1 ? 'item is' : 'items are'} ready to reorder`, clear: 'Your reorder queue is clear', icon: ClipboardList, tone: 'blue', path: '/shortbook' },
                    ].map(item => (
                      <button key={item.title} type="button" className="notification-item" onClick={() => { navigate(item.path); setAlertsOpen(false); }}>
                        <span className={`notification-icon notification-icon-${item.tone}`}><item.icon size={18} aria-hidden="true" /></span>
                        <span className="notification-copy"><strong>{item.title}</strong><span>{item.count > 0 ? item.message : item.clear}</span></span>
                        {item.count > 0 && <span className="notification-count" aria-label={`${item.count} items`}>{item.count > 99 ? '99+' : item.count}</span>}
                        <ChevronRight size={14} className="notification-chevron" aria-hidden="true" />
                      </button>
                    ))
                  )}
                </div>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
        </main>
      </div>
    </div>
  );
};
