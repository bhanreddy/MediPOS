/** Bare backend origins use the server's /api mount; explicit proxy paths stay intact. */
export function resolveApiBaseUrl(configured?: string): string {
  const base = configured?.trim().replace(/\/+$/, '') || '';
  if (!base) return '/api';
  if (/^https?:\/\/[^/]+$/i.test(base)) return `${base}/api`;
  return base;
}

export const API_BASE_URL = resolveApiBaseUrl(import.meta.env.VITE_API_URL);
