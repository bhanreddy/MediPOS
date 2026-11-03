import { useAuth } from '../lib/auth';
import { CloudAuthService } from './cloudAuthService';

export type AuthGate = 'login' | 'signup' | 'payment' | 'renewal' | 'app';

export async function resolveColdStartGate(): Promise<AuthGate> {
  await useAuth.getState().checkSession();
  if (!useAuth.getState().session) return 'login';
  void CloudAuthService.applySubscriptionCacheFromServer().catch(
    () => undefined,
  );
  return 'app';
}

export async function routeAfterPasswordLogin(): Promise<AuthGate> {
  await useAuth.getState().checkSession();
  if (!useAuth.getState().session) return 'login';
  void CloudAuthService.applySubscriptionCacheFromServer().catch(
    () => undefined,
  );
  // Legacy Redux consumers can reconcile when the backend is reachable.
  void CloudAuthService.ensurePosSessionFromCloud();
  return 'app';
}
