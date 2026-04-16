import axios from 'axios';

export function formatPhonePeApiError(e: unknown, fallback: string): string {
  if (axios.isAxiosError(e)) {
    const msg = (e.response?.data as { error?: { message?: string } })?.error?.message;
    return msg || e.message || fallback;
  }
  if (e instanceof Error) return e.message;
  return fallback;
}
