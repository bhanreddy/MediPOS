import axios from 'axios';
import { supabase } from './supabase';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api',
  timeout: 15000,
});

// Attach Supabase JWT to every request
api.interceptors.request.use(async (config) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.access_token) {
    config.headers.Authorization = `Bearer ${session.access_token}`;
  }
  return config;
});

// 401 → let callers handle it. Only force sign-out for non-auth API calls
// when there is genuinely no Supabase session left.
api.interceptors.response.use(
  (res) => res,
  async (err) => {
    if (err.response?.status === 401) {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        window.location.href = '/login';
      }
    }
    return Promise.reject(err);
  }
);

export default api;
