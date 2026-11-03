/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  /** Standard Supabase anon (JWT) key; used for client + Edge Function `apikey` header. */
  readonly VITE_SUPABASE_ANON_KEY: string;
  /** Optional alias if your project uses a different env name for the publishable key. */
  readonly VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY?: string;
  /**
   * Path on this app where PhonePe redirects after checkout (must match `PHONEPE_REDIRECT_URL` on Edge Functions).
   * Example: `/payment-return`
   */
  readonly VITE_PHONEPE_RETURN_PATH?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
