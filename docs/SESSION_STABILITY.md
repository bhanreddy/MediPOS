# Session stability

The web/desktop and mobile apps preserve the saved login through token refreshes, offline periods, API outages, and temporary storage failures. These failures do not navigate to login or delete credentials. Only an explicit sign-out clears the application session; the existing mobile PIN lockout remains a security exception.

## Web and desktop

- Supabase uses the same durable storage adapter as the application. Tauri installations read their previous browser token during migration and remove that copy after saving the durable token.
- `sessionClient` coalesces startup and refresh operations. Auth events update the current token immediately and queue its durable snapshot without calling SDK methods inside the SDK callback. Routine requests do not rewrite unchanged snapshots.
- Expired API requests share a renewal and replay once. Delayed responses for an older token use the current token. A second 401 is returned to the caller without a redirect loop.
- A cached profile for the same user keeps protected screens mounted during backend outages. If no profile can be recovered, a recovery screen offers retry/sign-out without inventing permissions. Reconnecting triggers another check.
- Every sign-out button uses one path to clear Zustand, Redux, query caches, SDK credentials and saved profile/session data. Sign-out uses the SDK's local scope so other devices are not revoked. A manual sign-out is propagated to other browser tabs.
- Session generations invalidate stale requests and profile lookups. Late refreshes and background cache writes cannot restore a manually signed-out session.

## Mobile

- Access and refresh tokens are saved together in one SecureStore value. Previous separate keys remain readable for migration.
- Refreshes share one promise, and every waiting request settles on success or failure. Offline, 5xx, and invalid-refresh responses preserve credentials and return an error to the caller.
- SecureStore failures produce a retry state during startup. A missing cached user profile does not discard saved tokens.
- A generation counter plus serialized writes prevents login, hydration or refresh operations from restoring credentials after manual logout. Token rotations update the active Zustand token in place.

## Backend and provider limits

The refresh endpoint reports database/transport failures as retryable 503 responses. Valid renewal reads current role/store assignments. Missing/invalid/expired refresh tokens and deleted users still receive 401; access tokens remain short-lived (15 minutes), with a rolling 30-day mobile refresh credential. Supabase session lifetime, inactivity, and concurrent-session restrictions remain controlled by the deployed project's settings.

This change does not make expired or revoked credentials valid. Such credentials may require a deliberate sign-out and sign-in to restore server access. The application retains its saved state instead of automatically cycling through the login screen. No hosted provider settings were changed.

## Verification

```sh
cd web && npm run test:auth && npm run test:billing && npm run build
cd mobile && npm run test:auth && npx tsc --noEmit
# From mobile, optional native JavaScript bundle validation:
npx expo export --platform ios --platform android --output-dir /tmp/medical-session-export
cd backend && npm run typecheck
npm test -- --runInBand src/__tests__/authSessionRefresh.test.ts src/__tests__/security.test.ts
```

Regression coverage includes simultaneous refreshes, all waiting callers settling on failures, retained saved credentials, application restarts, legacy storage migration, bounded 401 replay, cached-profile permission preservation, cross-tab sign-out, and logout during hydration/profile lookup/refresh/native writes.

For release QA, sign in on a test account, leave the app open past access-token expiry, issue concurrent dashboard requests, toggle the network, restart the app, and confirm no login-page flash. Then sign out while requests are pending and reopen to confirm credentials stay cleared. Repeat on web, Tauri, and physical iOS/Android devices; native exports do not replace physical-device testing.
