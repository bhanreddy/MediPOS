import axios from 'axios';
import type {
  AxiosError,
  AxiosResponse,
  InternalAxiosRequestConfig,
} from 'axios';

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
import { Platform } from 'react-native';
import { SecureStorage } from '@/lib/secureStorage';
import { refreshAccessToken } from '@/lib/sessionRefresh';

/* ─── Base URL ──────────────────────────────────────── */

export function getApiBaseURL(): string {
  let url =
    process.env.EXPO_PUBLIC_API_URL ??
    process.env.EXPO_PUBLIC_API_BASE_URL ??
    '';

  // Android emulator cannot reach the host machine through localhost/127.0.0.1.
  if (Platform.OS === 'android') {
    url = url.replace('localhost', '10.0.2.2').replace('127.0.0.1', '10.0.2.2');
  }

  return url;
}

const baseURL = getApiBaseURL();

/* ─── Instance ──────────────────────────────────────── */

export const apiClient = axios.create({
  baseURL,
  timeout: 15_000,
  headers: {
    'Content-Type': 'application/json',
  },
});

/* ─── Request Interceptor ───────────────────────────── */

apiClient.interceptors.request.use(
  async (
    config: InternalAxiosRequestConfig & { _sessionRevision?: number },
  ) => {
    const expected = SecureStorage.getRevision();
    if (
      config._sessionRevision !== undefined &&
      config._sessionRevision !== expected
    )
      throw new axios.CanceledError('Session changed.');
    const token = await SecureStorage.getAccessToken();
    if (expected !== SecureStorage.getRevision())
      throw new axios.CanceledError('Session changed.');
    config._sessionRevision = expected;
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    } else {
      delete config.headers.Authorization;
    }
    return config;
  },
  (error: AxiosError) => Promise.reject(error),
);

/* ─── Response Interceptor — Silent Token Refresh ───── */

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as
      | (InternalAxiosRequestConfig & {
          _retryAfterRefresh?: boolean;
          _sessionRevision?: number;
        })
      | undefined;
    const path = original?.url?.split('?')[0] || '';
    const isCredentialRequest = /\/auth\/(login|register|refresh)\/?$/.test(
      path,
    );
    if (
      error.response?.status !== 401 ||
      !original ||
      original._retryAfterRefresh ||
      isCredentialRequest
    ) {
      return Promise.reject(error);
    }
    if (original._sessionRevision !== SecureStorage.getRevision())
      return Promise.reject(error);
    // Mark every request before waiting, including concurrent requests.
    original._retryAfterRefresh = true;
    const authorization = String(original.headers?.Authorization || '');
    const token = await refreshAccessToken(
      baseURL,
      authorization.replace(/^Bearer /i, '') || undefined,
    );
    if (original._sessionRevision !== SecureStorage.getRevision())
      throw new axios.CanceledError('Session changed.');
    original.headers.Authorization = `Bearer ${token}`;
    return apiClient(original);
  },
);

/* ─── Retry Config ──────────────────────────────────── */

axiosRetry(apiClient, {
  retries: 2,
  retryDelay: exponentialDelay,
  retryCondition: (error: AxiosError) => {
    // Always retry network errors
    if (isNetworkError(error)) return true;
    const s = error.response?.status;
    if (!s) return false;
    // Skip all 4xx except 429 (rate limit)
    if (s >= 400 && s < 500 && s !== 429) return false;
    // Retry 5xx and 429
    return true;
  },
});
