import axios from 'axios';
import type { AxiosError, AxiosResponse, InternalAxiosRequestConfig } from 'axios';

/** Matches list responses from Express routes `{ data: T[], pagination }`. */
export interface ApiPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export function extractPaginated<T>(
  res: AxiosResponse<{ data: T[]; pagination: ApiPagination }>,
): { data: T[]; pagination: ApiPagination } {
  return {
    data: res.data.data,
    pagination: res.data.pagination,
  };
}
import axiosRetry, { exponentialDelay, isNetworkError } from 'axios-retry';
import { Platform, DeviceEventEmitter } from 'react-native';
import { refreshSupabaseAccessToken } from '@/auth/supabaseSessionRefresh';
import { useAuthStore } from '@/stores/authStore';
import { getSecureAuthToken } from '@/utils/secureAuthToken';

/* ─── Base URL ──────────────────────────────────────── */

let baseURL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:5001/api';

// Android emulator routes localhost to a different address
if (Platform.OS === 'android' && baseURL.includes('localhost')) {
  baseURL = baseURL.replace('localhost', '10.0.2.2');
}

/* ─── Instance ──────────────────────────────────────── */

export const apiClient = axios.create({
  baseURL,
  timeout: 10_000,
  headers: {
    'Content-Type': 'application/json',
  },
});

/* ─── Request Interceptor ───────────────────────────── */

apiClient.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    const token = await getSecureAuthToken();
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error: AxiosError) => Promise.reject(error),
);

/* ─── Response Interceptor ──────────────────────────── */

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const status = error.response?.status;
    const originalRequest = error.config as
      | (InternalAxiosRequestConfig & { _retryAfterRefresh?: boolean })
      | undefined;

    if (
      status === 401 &&
      originalRequest &&
      !originalRequest._retryAfterRefresh &&
      originalRequest.url &&
      !String(originalRequest.url).includes('/auth/v1/')
    ) {
      originalRequest._retryAfterRefresh = true;
      const newAccess = await refreshSupabaseAccessToken();
      if (newAccess && originalRequest.headers) {
        originalRequest.headers.Authorization = `Bearer ${newAccess}`;
        return apiClient.request(originalRequest);
      }
    }

    if (status === 401) {
      useAuthStore.getState().logout();
      DeviceEventEmitter.emit('AUTH_LOGOUT');
    }
    return Promise.reject(error);
  },
);

/* ─── Retry Config ──────────────────────────────────── */

axiosRetry(apiClient, {
  retries: 2,
  retryDelay: exponentialDelay,
  retryCondition: (error: AxiosError) => {
    // Always retry network errors
    if (isNetworkError(error)) return true;
    const status = error.response?.status;
    if (!status) return false;
    // Skip all 4xx except 429 (rate limit)
    if (status >= 400 && status < 500 && status !== 429) return false;
    // Retry 5xx and 429
    return true;
  },
});
