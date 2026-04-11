import type { RoleName } from '../core/types';

/** Permission strings stored on Role and AuthSession */
export const P = {
    route_dashboard: 'route:dashboard',
    route_billing: 'route:billing',
    route_inventory: 'route:inventory',
    route_medicine_master: 'route:medicine_master',
    route_purchase: 'route:purchase',
    route_expense: 'route:expense',
    route_reports: 'route:reports',
    route_sales_analytics: 'route:sales_analytics',
    route_gst_compliance: 'route:gst_compliance',
    route_expiry_alerts: 'route:expiry_alerts',
    route_settings: 'route:settings',
    route_suppliers_hub: 'route:suppliers_hub',
    route_customers: 'route:customers',
    route_tele: 'route:tele_consultation',
    route_delivery: 'route:doorstep_delivery',
    action_manage_users: 'action:manage_users',
} as const;

export type PermissionId = (typeof P)[keyof typeof P];

const ALL_ROUTES: PermissionId[] = [
    P.route_dashboard,
    P.route_billing,
    P.route_inventory,
    P.route_medicine_master,
    P.route_purchase,
    P.route_expense,
    P.route_reports,
    P.route_sales_analytics,
    P.route_gst_compliance,
    P.route_expiry_alerts,
    P.route_settings,
    P.route_suppliers_hub,
    P.route_customers,
    P.route_tele,
    P.route_delivery,
];

export const ROLE_PRESETS: Record<RoleName, PermissionId[]> = {
    ADMIN: [...ALL_ROUTES, P.action_manage_users],
    MANAGER: ALL_ROUTES,
    CASHIER: [
        P.route_dashboard,
        P.route_billing,
        P.route_customers,
        P.route_expiry_alerts,
        P.route_tele,
        P.route_delivery,
    ],
};

/** Navigation screen id → required permission */
export const NAV_ID_PERMISSION: Record<string, PermissionId> = {
    dashboard: P.route_dashboard,
    billing: P.route_billing,
    inventory: P.route_inventory,
    medicine_master: P.route_medicine_master,
    purchase: P.route_purchase,
    expense: P.route_expense,
    reports: P.route_reports,
    sales_analytics: P.route_sales_analytics,
    gst_compliance: P.route_gst_compliance,
    expiry_alerts: P.route_expiry_alerts,
    settings: P.route_settings,
    suppliers_hub: P.route_suppliers_hub,
    customers: P.route_customers,
    tele_consultation: P.route_tele,
    doorstep_delivery: P.route_delivery,
};

export function canAccessNavId(permissions: string[] | undefined, navId: string | undefined | null): boolean {
    if (!navId) return false;
    const required = NAV_ID_PERMISSION[navId];
    if (!required) return true;
    const set = new Set(permissions ?? []);
    return set.has(required);
}
