import { FEATURE_BADGES } from './appContent';

/** Sidebar grouping order (top → bottom). */
export const NAV_SECTION_ORDER = ['operations', 'finance', 'compliance', 'system', 'beta'] as const;
export type NavSectionId = (typeof NAV_SECTION_ORDER)[number];

export const NAV_SECTION_LABELS: Record<NavSectionId, string> = {
    operations: 'Store',
    finance: 'Finance',
    compliance: 'Compliance',
    system: 'System',
    beta: 'Labs',
};

export type NavItem = {
    id: string;
    label: string;
    /** Short label under icon (sidebar width). */
    abbr: string;
    path: string;
    /** Clinic shell: F1–F11 = sidebar order; F12 = new invoice. Skipped in form fields & inside `[data-pos-local-fkeys]` (Purchase F4/F6/F12, Inventory F6). */
    key?: string;
    badge?: string;
    section: NavSectionId;
};

/** Sort order for F1…F12; items without a key sort last. */
export function fKeySortOrder(key?: string): number {
    if (!key) return 100;
    const m = /^F(1[0-2]|[1-9])$/i.exec(key.trim());
    if (!m) return 99;
    return parseInt(m[1], 10);
}

/** Sidebar + shortcuts: F-key items in F1→F12 order, then unkeyed items in array order. */
export function sortNavItemsByFKey<T extends Pick<NavItem, 'key' | 'label'>>(items: T[]): T[] {
    return [...items].sort((a, b) => {
        const oa = fKeySortOrder(a.key);
        const ob = fKeySortOrder(b.key);
        if (oa !== ob) return oa - ob;
        return a.label.localeCompare(b.label);
    });
}

/**
 * F1–F12: primary routes in **numeric key order** (array order matches F1→F12).
 * GST, Tele, Delivery: sidebar-only (after quick keys).
 */
export const NAV_ITEMS: NavItem[] = [
    { id: 'dashboard', label: 'Dashboard', abbr: 'Home', key: 'F1', path: '/dashboard', section: 'operations' },
    { id: 'billing', label: 'Billing', abbr: 'POS', key: 'F2', path: '/billing', section: 'operations' },
    { id: 'inventory', label: 'Inventory', abbr: 'Stock', key: 'F3', path: '/inventory', section: 'operations' },
    { id: 'purchase', label: 'Purchase', abbr: 'In', key: 'F4', path: '/purchases', section: 'operations' },
    { id: 'expense', label: 'Expense', abbr: 'Cost', key: 'F5', path: '/expenses', section: 'finance' },
    { id: 'customers', label: 'Customers', abbr: 'CRM', key: 'F6', path: '/customers', section: 'operations' },
    { id: 'reports', label: 'Reports', abbr: 'Rpt', key: 'F7', path: '/reports', section: 'finance' },
    { id: 'settings', label: 'Settings', abbr: 'Cfg', key: 'F8', path: '/settings', section: 'system' },
    { id: 'expiry_alerts', label: 'Expiry Alerts', abbr: 'Exp', key: 'F9', path: '/alerts', section: 'compliance' },
    { id: 'medicine_master', label: 'Medicines', abbr: 'Rx', key: 'F10', path: '/inventory', section: 'operations' },
    { id: 'suppliers_hub', label: 'Suppliers', abbr: 'Vend', key: 'F11', path: '/suppliers', section: 'operations' },
    { id: 'sales_analytics', label: 'Analytics', abbr: 'BI', key: 'F12', path: '/analytics', section: 'finance' },

    { id: 'gst_compliance', label: 'GST', abbr: 'GST', path: '/gst', section: 'compliance' },
    { id: 'tele_consultation', label: 'Tele', abbr: 'Dr', path: '/tele', badge: FEATURE_BADGES.beta, section: 'beta' },
    { id: 'doorstep_delivery', label: 'Delivery', abbr: 'Drop', path: '/delivery', badge: FEATURE_BADGES.beta, section: 'beta' },
];
