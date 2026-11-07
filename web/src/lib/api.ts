import { getBranchSelection } from './branchSelection';
import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';
import axiosRetry, { exponentialDelay, isNetworkError } from 'axios-retry';
import { sessionClient } from './sessionClient';
import { API_BASE_URL } from './apiBaseUrl';
import { queryClient } from './queryClient';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
});

type SessionRequest = InternalAxiosRequestConfig & {
  _authVersion?: number;
  _tenantScope?: string;
  _retryAfterRefresh?: boolean;
  _branchScope?: string | null;
};
let lastBranchIdentity: { userId: string; clinicId: string | null } | null = null;
export function setApiBranchIdentity(userId: string, clinicId: string | null) {
  lastBranchIdentity = { userId, clinicId };
}
function branchScope() {
  const identity = lastBranchIdentity;
  if (!identity || sessionClient.peekSession?.()?.user.id !== identity.userId) return null;
  return getBranchSelection(identity.userId, sessionStorage.getItem('impersonate_clinic_id') || identity.clinicId);
}
api.interceptors.request.use(async (config: SessionRequest) => {
  const expected = sessionClient.getVersion();
  if (config._authVersion !== undefined && config._authVersion !== expected)
    throw new axios.CanceledError('Session changed.');
  const session = await sessionClient.getSession();
  if (expected !== sessionClient.getVersion())
    throw new axios.CanceledError('Session changed.');
  config._authVersion = expected;
  const clinicId = sessionStorage.getItem('impersonate_clinic_id');
  const tenantScope = `${expected}:${clinicId || ''}`;
  if (config._tenantScope !== undefined && config._tenantScope !== tenantScope)
    throw new axios.CanceledError('Session changed.');
  config._tenantScope = tenantScope;
  const accountBranch = session?.user.id === lastBranchIdentity?.userId ? branchScope() : null;
  if (config._branchScope !== undefined && config._branchScope !== accountBranch)
    throw new axios.CanceledError('Store changed.');
  config._branchScope = accountBranch;
  if (accountBranch && !/^\/(branches\/accessible|auth\/|offline\/commands|bills\/(sync|migrate))/.test(config.url || ''))
    config.headers['x-store-id'] = accountBranch;
  else delete config.headers['x-store-id'];
  if (clinicId) config.headers['x-impersonate-clinic'] = clinicId;
  else delete config.headers['x-impersonate-clinic'];
  if (session?.access_token)
    config.headers.Authorization = `Bearer ${session.access_token}`;
  else delete config.headers.Authorization;
  return config;
});

/* Same retry policy as medical-pos-mobile `src/api/client.ts`: transient errors + 429 + 5xx */
axiosRetry(api, {
  retries: 2,
  retryDelay: exponentialDelay,
  retryCondition: (error: AxiosError) => {
    // A timed-out write may already have committed. Retry only reads automatically.
    if (!['get', 'head', 'options'].includes(error.config?.method?.toLowerCase() || 'get')) return false;
    if (isNetworkError(error)) return true;
    const status = error.response?.status;
    if (!status) return false;
    if (status >= 400 && status < 500 && status !== 429) return false;
    return status === 429 || status >= 500;
  },
});

// Renew once, share the refresh across concurrent 401s, and keep the UI signed in on failure.
api.interceptors.response.use(
  (res) => {
    const config = res.config as SessionRequest;
    if (config._authVersion !== sessionClient.getVersion() ||
        config._tenantScope !== `${sessionClient.getVersion()}:${sessionStorage.getItem('impersonate_clinic_id') || ''}`)
      throw new axios.CanceledError('Session changed.');
    if (config._branchScope !== undefined && config._branchScope !== branchScope())
      throw new axios.CanceledError('Store changed.');
    const method = res.config.method?.toLowerCase() || 'get';
    if (!['get', 'head', 'options'].includes(method) &&
        /^\/(sales|purchases|inventory|shortbook|bulk)(\/|$)/.test(res.config.url || '')) {
      for (const key of ['inventory-radar', 'inventory-disposed', 'clinic-header-alerts', 'clinic-dashboard']) {
        void queryClient.invalidateQueries({ queryKey: [key] });
      }
    }
    return res;
  },
  async (error: AxiosError) => {
    const original = error.config as SessionRequest | undefined;
    const isCredentialRequest = /\/auth\/(login|register|refresh)\/?$/.test(
      original?.url?.split('?')[0] || '',
    );
    if (
      error.response?.status !== 401 ||
      !original ||
      original._retryAfterRefresh ||
      isCredentialRequest
    )
      return Promise.reject(error);
    if (original._authVersion !== sessionClient.getVersion())
      return Promise.reject(error);
    original._retryAfterRefresh = true;
    const token = String(original.headers.Authorization || '').replace(
      /^Bearer /i,
      '',
    );
    const session = await sessionClient.refresh(token || undefined);
    if (original._authVersion !== sessionClient.getVersion())
      throw new axios.CanceledError('Session changed.');
    original.headers.Authorization = `Bearer ${session.access_token}`;
    return api(original);
  },
);

export default api;
