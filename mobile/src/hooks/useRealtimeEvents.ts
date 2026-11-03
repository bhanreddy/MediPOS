import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { getApiBaseURL } from '@/api/client';
import { SecureStorage } from '@/lib/secureStorage';

/**
 * useRealtimeEvents — SSE subscription for real-time updates from the backend.
 *
 * Uses a fetch-based SSE reader because React Native does not support
 * browser-native EventSource. Auto-reconnects on failure with a 5s delay.
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
  const isActiveRef = useRef(true);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    isActiveRef.current = true;
    let retryDelay = 5000; // start at 5s
    let timeoutId: ReturnType<typeof setTimeout>;

    const baseURL = getApiBaseURL();

    async function listenToEvents() {
      if (!isActiveRef.current) return;

      const token = await SecureStorage.getAccessToken();
      if (!token || isTokenExpired(token)) {
        // Not authenticated yet or expired — retry in exponentially backed off time
        if (isActiveRef.current) {
          retryDelay = Math.min(retryDelay * 2, 60000);
          timeoutId = setTimeout(listenToEvents, retryDelay);
        }
        return;
      }

      const url = `${baseURL}/events/stream`;
      const controller = new AbortController();
      controllerRef.current = controller;

      try {
        const response = await fetch(url, {
          headers: { 'Authorization': `Bearer ${token}` },
          signal: controller.signal,
        });

        if (!response.ok) {
          console.warn(`[SSE] Connection failed: ${response.status}`);
          if (isActiveRef.current) {
            retryDelay = Math.min(retryDelay * 2, 60000);
            timeoutId = setTimeout(listenToEvents, retryDelay);
          }
          return;
        }

        retryDelay = 5000; // reset retryDelay on success
        const reader = response.body?.getReader();
        if (!reader) {
          // Some React Native runtimes do not expose streaming response bodies.
          return;
        }

        const decoder = new TextDecoder();
        let buffer = '';

        while (isActiveRef.current) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // Process complete SSE messages (each ends with \n\n)
          const messages = buffer.split('\n\n');
          buffer = messages.pop() ?? ''; // Keep incomplete message in buffer

          for (const msg of messages) {
            const lines = msg.split('\n');
            for (const line of lines) {
              if (line.startsWith('data: ')) {
                try {
                  const event = JSON.parse(line.slice(6));
                  handleEvent(event, queryClient);
                } catch {
                  /* malformed JSON — skip */
                }
              }
            }
          }
        }
      } catch (err: any) {
        if (err?.name === 'AbortError') return; // Expected on cleanup
        console.warn('[SSE] Connection error:', err?.message);
        if (isActiveRef.current) {
          // Reconnect with exponential backoff on failure
          retryDelay = Math.min(retryDelay * 2, 60000);
          timeoutId = setTimeout(listenToEvents, retryDelay);
        }
      }
    }

    listenToEvents();

    // Also reconnect when app comes back to foreground
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active' && isActiveRef.current) {
        retryDelay = 5000; // reset retryDelay
        clearTimeout(timeoutId);
        controllerRef.current?.abort();
        setTimeout(listenToEvents, 500);
      }
    });

    return () => {
      isActiveRef.current = false;
      clearTimeout(timeoutId);
      controllerRef.current?.abort();
      subscription.remove();
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
      // Invalidate whichever query key loads expenses/dashboard data
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      queryClient.invalidateQueries({ queryKey: ['expenses-summary'] });
      queryClient.invalidateQueries({ queryKey: ['expense-summary'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['reports'] });
      queryClient.invalidateQueries({ queryKey: ['accounting-summary'] });
      break;

    // Add more event types here as desktop write operations are added later
    default:
      console.log('[SSE] Unknown event type:', event.type);
  }
}
