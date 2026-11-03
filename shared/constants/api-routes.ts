export const API_ROUTES = {
  AUTH: {
    LOGIN: '/api/auth/login',
    REGISTER: '/api/auth/register',
    REFRESH: '/api/auth/refresh',
  },
  PATIENTS: {
    BASE: '/api/patients',
    BY_ID: (id: string) => `/api/patients/${id}`,
  },
  INVENTORY: {
    PRODUCTS: '/api/inventory/products',
    BATCHES: '/api/inventory/batches',
  },
  BILLING: {
    INVOICES: '/api/billing/invoices',
    BY_ID: (id: string) => `/api/billing/invoices/${id}`,
  },
  REPORTS: {
    SALES: '/api/reports/sales',
    STOCK: '/api/reports/stock',
  }
};
