import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { API_BASE_URL } from '../lib/apiBaseUrl';

/**
 * useRealtimeEvents — Desktop SSE subscription for real-time updates.
 *
 * Uses browser-native EventSource. Since EventSource doesn't support
 * custom Authorization headers, the token is passed as a query param
 * and validated server-side.
 *
 * On receiving events, invalidates the relevant react-query cache keys
 * so screens refetch fresh data automatically.
 */
const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function b64Decode(input: string): string {
  const str = input.replace(/=+$/, '');
  let output = '';
  if (str.length % 4 === 1) {
    throw new Error("'atob' failed: The string to be decoded is not correctly encoded.");
  }
  for (
    let bc = 0, bs = 0, buffer, idx = 0;
    (buffer = str.charAt(idx++));
    ~buffer && ((bs = bc % 4 ? bs * 64 + buffer : buffer), bc++ % 4)
      ? (output += String.fromCharCode(255 & (bs >> ((-2 * bc) & 6))))
      : 0
  ) {
    buffer = chars.indexOf(buffer);
  }
  return output;
}

function isTokenExpired(token: string): boolean {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return true;
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const decoded = typeof atob !== 'undefined' ? atob(base64) : b64Decode(base64);
    const payload = JSON.parse(decoded);
    return payload.exp * 1000 < Date.now();
  } catch {
    return true;
  }
}

export function useRealtimeEvents() {
  const queryClient = useQueryClient();
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    let cancelled = false;
    let generation = 0;
    let retryTimeout: ReturnType<typeof setTimeout>;
    let retryDelay = 5000; // start at 5s

    async function connect() {
      if (cancelled) return;
      const attempt = ++generation;

      const { data: { session } } = await supabase.auth.getSession();
      if (cancelled || attempt !== generation) return;
      const token = session?.access_token;
      if (!token || isTokenExpired(token)) {
        // Not authenticated or token expired — retry in exponentially backed off time
        if (!cancelled) {
          retryDelay = Math.min(retryDelay * 2, 60000);
          retryTimeout = setTimeout(connect, retryDelay);
        }
        return;
      }

      const url = `${API_BASE_URL}/events/stream?token=${encodeURIComponent(token)}`;

      esRef.current?.close();
      const es = new EventSource(url);
      esRef.current = es;

      es.onmessage = (e) => {
        retryDelay = 5000; // reset on success
        try {
          const event = JSON.parse(e.data);
          handleEvent(event, queryClient);
        } catch {
          /* skip malformed events */
        }
      };

      es.onerror = () => {
        es.close();
        if (!cancelled) {
          // Exponential backoff, cap at 60s
          retryDelay = Math.min(retryDelay * 2, 60000);
          retryTimeout = setTimeout(connect, retryDelay);
        }
      };
    }

    connect();

    // Reconnect when Supabase session refreshes (new token)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.access_token) {
        retryDelay = 5000; // reset retryDelay
        clearTimeout(retryTimeout);
        esRef.current?.close();
        connect();
      }
    });

    return () => {
      cancelled = true;
      generation++;
      esRef.current?.close();
      clearTimeout(retryTimeout);
      subscription.unsubscribe();
    };
  }, [queryClient]);
}

/**
 * Handle an incoming SSE event by invalidating the relevant query caches.
 */
function handleEvent(event: { type: string; payload?: any }, queryClient: ReturnType<typeof useQueryClient>) {
  console.log('[SSE] Received event:', event.type);

  switch (event.type) {
    case 'CONNECTED':
      console.log('[SSE] Connected to clinic:', event.payload?.clinicId);
      break;

    case 'EXPENSE_ADDED':
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      queryClient.invalidateQueries({ queryKey: ['directory', '/expenses'] });
      queryClient.invalidateQueries({ queryKey: ['clinic-dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['expense-summary'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['reports'] });
      queryClient.invalidateQueries({ queryKey: ['accounting'] });
      break;

    case 'SYNC_DATA_UPDATED':
      console.log('[SSE] Remote device pushed data, invalidating queries...', event.payload);
      queryClient.invalidateQueries();
      break;

    // Add more event types here as more write operations are broadcast
    default:
      console.log('[SSE] Unknown event type:', event.type);
  }
}
