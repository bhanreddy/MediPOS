import * as Sentry from '@sentry/node';
import { env } from '../config/env';
import { formatSentryDisabled, formatSentryReady } from './consoleStyle';

let initialized = false;

export function initSentry() {
  if (initialized || !env.SENTRY_DSN) {
    if (!env.SENTRY_DSN) {
      console.warn(formatSentryDisabled());
    }
    return;
  }

  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV,
    tracesSampleRate: env.NODE_ENV === 'production' ? 0.2 : 1.0,
    profilesSampleRate: 0.1,

    // Scrub PII from breadcrumbs and events
    beforeSend(event) {
      // Strip auth headers
      if (event.request?.headers) {
        delete event.request.headers['authorization'];
        delete event.request.headers['cookie'];
      }
      return event;
    },

    beforeBreadcrumb(breadcrumb) {
      // Don't log HTTP breadcrumbs that contain auth tokens
      if (breadcrumb.category === 'http' && breadcrumb.data?.url?.includes('token')) {
        return null;
      }
      return breadcrumb;
    },
  });

  initialized = true;
  console.log(formatSentryReady(env.NODE_ENV));
}

// Capture an exception with clinic context
export function captureError(error: Error, context?: { clinicId?: string; userId?: string; route?: string }) {
  if (!initialized) {
    console.error('[Untracked Error]', error.message);
    return;
  }

  Sentry.withScope((scope) => {
    if (context?.clinicId) scope.setTag('clinic_id', context.clinicId);
    if (context?.userId) scope.setUser({ id: context.userId });
    if (context?.route) scope.setTag('route', context.route);
    Sentry.captureException(error);
  });
}

// Sentry Express error handler — place AFTER all routes, BEFORE generic errorHandler
export const sentryErrorHandler = Sentry.setupExpressErrorHandler
  ? Sentry.setupExpressErrorHandler
  : (_app: any) => {}; // no-op fallback for older SDK versions
