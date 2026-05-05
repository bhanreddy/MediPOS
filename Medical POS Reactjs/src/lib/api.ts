import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';
import axiosRetry, { exponentialDelay, isNetworkError } from 'axios-retry';
import { supabase } from './supabase';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5001/api',
  timeout: 15000,
});

// Attach Supabase JWT to every request
api.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (session?.access_token && config.headers) {
    config.headers.Authorization = `Bearer ${session.access_token}`;
  }
  return config;
});

/* Same retry policy as medical-pos-mobile `src/api/client.ts`: transient errors + 429 + 5xx */
axiosRetry(api, {
  retries: 2,
  retryDelay: exponentialDelay,
  retryCondition: (error: AxiosError) => {
    if (isNetworkError(error)) return true;
    const status = error.response?.status;
    if (!status) return false;
    if (status >= 400 && status < 500 && status !== 429) return false;
    return true;
  },
});

// 401 → clear Supabase session and redirect (parity with mobile hard logout on 401)
api.interceptors.response.use(
  (res) => res,
  async (err: AxiosError) => {
    if (err.response?.status === 401) {
      console.warn('Backend returned 401 Unauthorized. Auto-logout disabled to prevent login loops.');
      // Ignore 401s from subscription or auth/me endpoints to prevent sign-out loops
      const url = err.config?.url || '';
      if (url.includes('/subscriptions/current') || url.includes('/auth/me')) {
        return Promise.reject(err);
      }

      // TEMPORARY: Disabled hard logout on 401 to prevent login loops when backend auth is out of sync.
      // await supabase.auth.signOut();
      // if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
      //   window.location.href = '/login';
      // }
    }
    return Promise.reject(err);
  },
);

export default api;
