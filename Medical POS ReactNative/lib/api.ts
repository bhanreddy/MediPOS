import axios, { AxiosError } from 'axios';
import { supabase } from './supabase';

export const api = axios.create({
  baseURL: process.env.EXPO_PUBLIC_API_URL || 'http://localhost:5000/api',
  timeout: 15000,
});

api.interceptors.request.use(async (config) => {
  const { data: { session } } = await supabase.auth.getSession();
  
  if (session?.access_token) {
    config.headers.Authorization = `Bearer ${session.access_token}`;
  }
  
  return config;
}, (error) => {
  return Promise.reject(error);
});

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    if (error.response?.status === 401) {
      await supabase.auth.signOut();
      // Applayout handles redirect via session change magically, but we could enforce navigation here if needed
    }
    return Promise.reject(error);
  }
);

// Typed API Helpers
export const inventoryApi = {
  getMedicines: (params?: any) => api.get('/inventory/medicines', { params }),
  searchMedicines: (q: string) => api.get('/inventory/medicines/search', { params: { q } }),
  searchMedicinesByBarcode: (barcode: string) =>
    api.get('/inventory/medicines/search', { params: { barcode } }),
  getLowStock: () => api.get('/inventory/stock/low'),
  getExpiringBatches: (days = 90) => api.get('/inventory/batches/expiring', { params: { days } }),
};

export const salesApi = {
  create: (payload: any) => api.post('/sales', payload),
  list: (params?: any) => api.get('/sales', { params }),
  getById: (id: string) => api.get(`/sales/${id}`),
  getInvoiceHtml: (id: string) => api.get(`/sales/${id}/invoice`),
  createReturn: (payload: any) => api.post('/sales/returns', payload),
};

export const purchasesApi = {
  create: (payload: any) => api.post('/purchases', payload),
  list: (params?: any) => api.get('/purchases', { params }),
  scanBill: (imageBase64: string, mimeType: string) => api.post('/purchases/bill-scan', { imageBase64, mimeType }),
  importCsv: (formData: any) => api.post('/purchases/import-csv', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
};

export const reportsApi = {
  getDashboard: () => api.get('/reports/dashboard'),
  getGstSales: (from: string, to: string) => api.get('/reports/gst-sales', { params: { from, to } }),
  getGstPurchases: (from: string, to: string) => api.get('/reports/gst-purchases', { params: { from, to } }),
  getProfitLoss: (from?: string, to?: string) => api.get('/reports/profit-loss', { params: { from, to } }),
  getExpiryReport: (days: number) => api.get('/reports/expiry-report', { params: { days } }),
  getScheduleH1: (from?: string, to?: string) => api.get('/reports/schedule-h1', { params: { from, to } }),
  getProductWise: (from?: string, to?: string) => api.get('/reports/product-wise', { params: { from, to } }),
  getSlowMoving: (days: number) => api.get('/reports/slow-moving', { params: { days } }),
};
