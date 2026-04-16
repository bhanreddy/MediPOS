/**
 * Single source of UI copy, seeded demo data, and default business-display values.
 * Screens should import from here instead of embedding literals.
 */

export const BRANDING = {
    productName: 'MedPOS Pro',
    shortProductName: 'MedPOS',
    /** Fallback payee name in UPI QR when shop profile has no medical_name */
    defaultMerchantDisplayName: 'MedPOS Pharmacy',
    poweredByLine: 'Powered by NexSyrus POS',
} as const;

export const FEATURE_BADGES = {
    beta: 'Beta',
} as const;

/** Sidebar emoji icons by navigation id (must match NAV_ITEMS ids). */
export const NAV_SIDEBAR_ICONS: Record<string, string> = {
    dashboard: '🏠',
    billing: '🛒',
    inventory: '📦',
    medicine_master: '💊',
    purchase: '📥',
    suppliers_hub: '🏭',
    expense: '💸',
    customers: '👤',
    reports: '📊',
    sales_analytics: '📈',
    gst_compliance: '🧾',
    expiry_alerts: '⏳',
    settings: '⚙️',
    tele_consultation: '📹',
    doorstep_delivery: '🛵',
} as const;

export const LOGIN_COPY = {
    terminalBadge: 'Terminal 01',
    subtitle: 'Authorized access only. Terminal secured.',
    onlineLabel: 'Online',
    offlineLabel: 'Offline',
    operatorLabel: 'Operator ID',
    operatorPlaceholder: 'Enter username...',
    pinLabel: 'Access Pin',
    pinPlaceholder: '••••••••',
    submitLabel: 'LOGIN AUTHORIZED',
    authFailedFallback: 'Authentication Failed',
    debugSectionTitle: 'Debug Credentials',
} as const;

/** Shown only in development builds (see App.tsx). */
export const LOGIN_DEBUG_CREDENTIAL_LINES: string[] = [
    'admin / admin123',
    'manager / manager123 • cashier / cashier123',
];

export const HEADER_COPY = {
    operatorCaption: 'Operator',
    operatorFallback: 'Authorized Personnel',
    sessionCaption: 'Session',
    offlineMode: 'OFFLINE MODE',
    stableConnect: 'STABLE CONNECT',
    logout: 'Logout',
    expiryBadgeTitle: 'Batches nearing expiry',
    lowStockBadgeTitle: 'SKUs below min stock',
} as const;

export const METRICS_CONFIG = {
    /** Dashboard / metrics hook: count rows with qty below this as “low stock” KPI */
    dashboardLowStockUnitThreshold: 10,
    /** Dashboard KPI: batches expiring within this many days */
    dashboardExpiringWithinDays: 30,
    pollIntervalMs: 30_000,
    lastBackupPlaceholder: 'Local Only',
} as const;

export const RADAR_CONFIG = {
    /** Days ahead to flag “near expiry” in inventory radar (align with dashboard KPI if possible) */
    expiryWarningDays: 30,
} as const;

export const BILL_PRINT_COPY = {
    thankYou: 'Thank you for your purchase!',
    returnPolicy: 'Medicines once sold cannot be returned or exchanged.',
    closingWish: 'Get well soon!',
    propPrefix: 'Prop:',
} as const;

export const PAYMENT_COPY = {
    upiIdPlaceholder: 'pharmacy@upi or 9876543210@paytm',
    upiQrPreviewNote: 'Sample ₹1.00 intent — billing uses the real total',
} as const;

export const STOCK_ALERT_POPUP_COPY = {
    checkExpiryInventory: 'Check Expiry Alerts / Inventory.',
    prefix: 'Stock alerts:',
    batchNearing: (n: number) => `${n} batch(es) nearing expiry`,
    skuBelow: (n: number) => `${n} SKU(s) below threshold`,
} as const;

export const DASHBOARD_COPY = {
    statusSyncing: 'Syncing...',
    statusOnline: 'System Online',
    terminalBadge: 'Terminal 01-A',
    storageLabel: 'Storage: IndexedDB',
    greetMorning: 'Good Morning',
    greetAfternoon: 'Good Afternoon',
    greetEvening: 'Good Evening',
    /** Shown before operator name when profile name unavailable (fallback only). */
    operatorRoleFallback: 'Operator',
    pressPrefix: 'Press',
    kpi: {
        salesToday: 'Sales (Today)',
        lowStock: 'Low Stock',
        lowStockSub: (units: number) => `Items < ${units} units`,
        expiringSoon: 'Expiring Soon',
        expiringSoonSub: (days: number) => `Within ${days} Days`,
        syncQueue: 'Sync Queue',
        syncAllClear: 'All synced',
        syncPending: 'Pending Upload',
        billsSuffix: (n: number) => `${n} Bill${n !== 1 ? 's' : ''}`,
    },
} as const;

export type DashboardQuickActionId = 'billing' | 'inventory' | 'purchase';

export const DASHBOARD_QUICK_ACTIONS: readonly {
    id: DashboardQuickActionId;
    navId: string;
    title: string;
    description: string;
    kbd: string;
    variant: 'primary' | 'warning';
}[] = [
    {
        id: 'billing',
        navId: 'billing',
        title: 'New Billing Flow',
        description: 'Start a new customer checkout transaction',
        kbd: 'F2',
        variant: 'primary',
    },
    {
        id: 'inventory',
        navId: 'inventory',
        title: 'Inventory Health',
        description: 'Manage stock and alerts',
        kbd: 'F3',
        variant: 'warning',
    },
    {
        id: 'purchase',
        navId: 'purchase',
        title: 'Stock Inward',
        description: 'Record new deliveries',
        kbd: 'F4',
        variant: 'primary',
    },
] as const;

export const INVENTORY_PAGE_COPY = {
    title: 'Stock Radar',
    subtitleScanning: 'Scanning...',
    subtitleActive: (n: number) => `Inventory Intelligence • Active Batches: ${n}`,
    searchPlaceholder: 'Filter by name / batch (F1)...',
    newBatch: '+ NEW BATCH (F6)',
    headers: ['MEDICINE / DESCRIPTION', 'BATCH_ID', 'EXPIRY', 'ON_HAND', 'STATUS'] as const,
    emptySearch: 'No matches found.',
    emptyDefault: 'Inventory is empty.',
    miniStats: {
        totalAssets: 'Total Assets',
        criticalStock: 'Critical Stock',
        nearExpiry: 'Near Expiry',
        netValuation: 'Net Valuation',
    },
} as const;

export type TeleConsultSeedRow = {
    id: string;
    doctor: string;
    patient: string;
    time: string;
    status: string;
    mode: string;
};

export const TELE_CONSULT_SEED: TeleConsultSeedRow[] = [
    { id: '1', doctor: 'Dr. Rao', patient: 'Walk-in link', time: 'Today 11:00', status: 'CONFIRMED', mode: 'Video' },
    { id: '2', doctor: 'Dr. Mehta', patient: 'Phone follow-up', time: 'Today 15:30', status: 'PENDING', mode: 'Audio' },
];

export const TELE_CONSULT_DEFAULTS = {
    newStatus: 'SCHEDULED',
    newMode: 'Video',
} as const;

export const TELE_CONSULT_COPY = {
    title: 'Tele consultation',
    subtitle: 'Mock queue — connect EMR / provider when ready',
    scheduleButton: 'Schedule (local)',
    tableHeaders: ['DOCTOR', 'PATIENT', 'SLOT', 'MODE', 'STATUS'] as const,
    labels: { doctor: 'Doctor', patient: 'Patient / case' },
} as const;

export type DeliverySeedRow = {
    id: string;
    invoice: string;
    address: string;
    rider: string;
    status: string;
};

export const DELIVERY_SEED: DeliverySeedRow[] = [
    { id: '1', invoice: 'INV-20260324-0001', address: 'Sector 12 • 3.2 km', rider: 'Ravi', status: 'OUT' },
    { id: '2', invoice: 'INV-20260324-0002', address: 'MG Road • 1.1 km', rider: 'Unassigned', status: 'PACKING' },
];

export const DELIVERY_DEFAULTS = {
    newRider: 'Unassigned',
    newStatus: 'NEW',
} as const;

export const DELIVERY_COPY = {
    title: 'Doorstep delivery',
    subtitle: 'Dispatch board • mock logistics',
    createButton: 'Create job',
    tableHeaders: ['INVOICE', 'ADDRESS', 'RIDER', 'STATUS'] as const,
    labels: { invoice: 'Invoice ref', address: 'Drop address' },
} as const;

export const APP_SHELL_COPY = {
    restoring: 'Decrypting Terminal Data...',
} as const;

export const NOT_FOUND_COPY = {
    title: 'Not Found',
    body: (path: string) => `No screen is wired for: ${path}`,
} as const;

export const ACCESS_DENIED_COPY = {
    title: 'Access denied',
    body: 'Your role cannot open this route.',
    cta: 'Go to dashboard',
} as const;

export const EXPIRY_ALERTS_SCREEN_COPY = {
    title: 'Ready to Expiry',
    subtitle: 'Products requiring immediate attention',
    hint: 'Prioritize clearance or supplier return for critical batches.',
    withinDays: (n: number) => `Within ${n} Days`,
    filterPresets: [7, 30, 60, 90] as const,
} as const;

export const ANALYTICS_SCREEN_COPY = {
    title: 'Sales analytics',
    subtitle: 'Revenue trend • Fast movers • Margins',
    today: 'Today',
    sevenDays: '7 days',
    month: 'Month',
    run: 'Run',
    startLabel: 'Start',
    endLabel: 'End',
    dailyRevenue: 'Daily revenue',
    barScaleHint: 'Bar scale = max day in range',
    chartEmpty: 'Run analysis to load chart',
    topFastMovers: 'Top 10 fast movers (qty)',
    profitByProduct: 'Profit margin by product',
    tableHeadFast: ['PRODUCT', 'QTY', 'REVENUE'] as const,
    tableHeadMargin: ['PRODUCT', 'PROFIT', 'MARGIN %'] as const,
    emptyData: 'No data',
} as const;

export const GST_SCREEN_COPY = {
    title: 'GST & compliance',
    subtitle: 'CGST / SGST / IGST • Export',
    startDate: 'Start date',
    endDate: 'End date',
    generate: 'Generate',
    csv: 'CSV',
    pdfPrint: 'PDF (print)',
    taxable: 'Taxable',
    totalTax: 'Total tax',
    badge: 'GST return helper',
    tableHead: ['RATE %', 'TAXABLE', 'TAX', 'CGST', 'SGST', 'IGST'] as const,
    emptyTable: 'Generate a report',
    printDocTitle: 'GST Summary',
    csvFilenamePrefix: 'GST_Summary',
} as const;

export const CUSTOMERS_SCREEN_COPY = {
    title: 'Customers',
    subtitle: 'Profiles • Credit • Purchase history',
    newSection: 'New customer',
    name: 'Name',
    phone: 'Phone',
    stateLabel: 'State (for IGST)',
    creditLimit: 'Credit limit ₹ (optional)',
    save: 'Save',
    tableHead: ['NAME', 'PHONE', 'DUE BAL', 'LIMIT', 'ACTION'] as const,
    history: 'History',
    recentInvoices: 'Recent invoices',
    tableInv: ['INVOICE', 'DATE', 'TOTAL', 'MODE'] as const,
    emptySales: 'No sales yet',
    updateState: 'Update state',
    updateCreditLabel: 'Credit limit ₹',
    updateCredit: 'Update credit',
    close: 'Close',
    namePhoneRequired: 'Name and phone required',
} as const;

export const SUPPLIERS_SCREEN_COPY = {
    title: 'Suppliers',
    subtitle: 'Master vendors • Purchase orders • Payables • Returns',
} as const;

export const MEDICINE_MASTER_SCREEN_COPY = {
    title: 'Medicine Master',
    subtitle: 'Central SKU • Categories • Schedule H • Barcode',
    searchPlaceholder: 'Search name / category / barcode...',
    newMedicine: '+ New medicine',
} as const;

export const PURCHASE_SCREEN_COPY = {
    title: 'Inward Entry',
    subtitle: 'Stock Acquisition • Supplier Invoice Logic',
    committedBadge: 'COMMITTED • LEDGER UPDATED',
    draftBadge: 'DRAFT • UNCOMMITTED',
} as const;

export const EXPENSE_SCREEN_COPY = {
    title: 'Expense Ledger',
    subtitle: 'Overheads • Non-Inventory Spending',
    quickEntry: '+ QUICK ENTRY (F6)',
    dailyOutflow: 'Daily Outflow',
    monthlyAggregate: 'Monthly Aggregate',
    tableHeaders: ['RECORD_DATE', 'CATEGORY', 'DESCRIPTION', 'AMOUNT_INR'] as const,
    emptyMessage: 'No expenses recorded yet.',
} as const;

export const REPORTS_SCREEN_COPY = {
    title: 'Reports',
    subtitle: 'F7 • Read-only analytics',
    today: 'Today',
    thisMonth: 'This Month',
    generate: 'Generate',
} as const;

export const SETTINGS_SCREEN_COPY = {
    title: 'Settings',
    subtitle: 'System configuration, backups, alerts, and UPI.',
} as const;

export const BILLING_SCREEN_COPY = {
    terminalReady: 'Terminal Ready',
    terminalReadySub: 'Ready for scan input or F2 sequence',
} as const;
