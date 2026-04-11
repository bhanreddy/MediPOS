import React, { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { BRANDING } from '../../config/appContent';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Badge } from '../ui/Badge';
import { uiSlice } from '../../state/slices';
import type { RootState } from '../../state/store';
import { CloudAuthService } from '../../services/cloudAuthService';
import { routeAfterPasswordLogin } from '../../services/authGateService';
import type { AuthGate } from '../../services/authGateService';
import { AuthService } from '../../services/authService';

type LoginScreenProps = {
  onNavigate: (gate: AuthGate) => void;
  allowLegacyOffline?: boolean;
};

/**
 * Cloud login (email/password) with optional legacy offline operator PIN flow for unmigrated terminals.
 */
export function LoginScreen({ onNavigate, allowLegacyOffline = true }: LoginScreenProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'CLOUD' | 'LEGACY_OFFLINE'>('CLOUD');
  const [legacyUser, setLegacyUser] = useState('');
  const [legacyPin, setLegacyPin] = useState('');
  const [error, setError] = useState('');

  const dispatch = useDispatch();
  const { isLoading } = useSelector((s: RootState) => s.ui);

  const submitCloud = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setError('');
    dispatch(uiSlice.actions.setLoading(true));
    try {
      await CloudAuthService.signInAndPersist({ email: email.trim(), password });
      await CloudAuthService.persistSessionFromClient();
      const next = await routeAfterPasswordLogin();
      onNavigate(next);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Sign in failed');
    } finally {
      dispatch(uiSlice.actions.setLoading(false));
    }
  };

  const submitLegacy = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setError('');
    dispatch(uiSlice.actions.setLoading(true));
    try {
      await AuthService.loginOffline(legacyUser, legacyPin);
      onNavigate('app');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Offline login failed');
    } finally {
      dispatch(uiSlice.actions.setLoading(false));
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6 select-none font-sans relative overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0 opacity-50 dark:opacity-40"
        aria-hidden
        style={{
          backgroundImage: `
            radial-gradient(ellipse 70% 50% at 50% -10%, rgb(var(--primary) / 0.18), transparent 50%),
            radial-gradient(ellipse 50% 40% at 100% 100%, rgb(var(--primary) / 0.08), transparent 45%)
          `,
        }}
      />
      <div className="w-full max-w-md relative bg-surface/95 dark:bg-surface/90 backdrop-blur-md border border-border/80 rounded-2xl shadow-xl p-8 ring-1 ring-black/5 dark:ring-white/10">
        <div className="mb-6">
          <Badge variant="primary">Secure sign in</Badge>
          <h2 className="text-3xl font-black text-foreground-strong mt-2 tracking-tighter uppercase italic">
            {BRANDING.productName}
          </h2>
          <p className="text-muted text-sm font-medium mt-1">Use your registered email and password.</p>
        </div>

        {allowLegacyOffline && (
          <div className="flex gap-2 p-1 bg-surface-elevated rounded-lg mb-6">
            <button
              type="button"
              onClick={() => setMode('CLOUD')}
              className={`flex-1 py-2 text-xs font-black uppercase tracking-widest rounded-md transition-all ${
                mode === 'CLOUD' ? 'bg-primary text-on-primary shadow-lg' : 'text-muted hover:text-foreground'
              }`}
            >
              Cloud
            </button>
            <button
              type="button"
              onClick={() => setMode('LEGACY_OFFLINE')}
              className={`flex-1 py-2 text-xs font-black uppercase tracking-widest rounded-md transition-all ${
                mode === 'LEGACY_OFFLINE' ? 'bg-primary text-on-primary shadow-lg' : 'text-muted hover:text-foreground'
              }`}
            >
              Legacy offline
            </button>
          </div>
        )}

        {mode === 'CLOUD' ? (
          <form onSubmit={submitCloud} className="space-y-5">
            <Input
              label="Email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoComplete="email"
              autoFocus
            />
            <Input
              label="Password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              error={error}
            />
            <Button type="submit" className="w-full h-12" isLoading={isLoading}>
              Sign in
            </Button>
          </form>
        ) : (
          <form onSubmit={submitLegacy} className="space-y-5">
            <Input label="Operator ID" value={legacyUser} onChange={e => setLegacyUser(e.target.value)} required />
            <Input
              label="Access PIN"
              type="password"
              value={legacyPin}
              onChange={e => setLegacyPin(e.target.value)}
              required
              error={error}
            />
            <Button type="submit" className="w-full h-12" isLoading={isLoading}>
              Unlock terminal
            </Button>
          </form>
        )}

        {mode === 'CLOUD' && (
          <p className="text-center text-xs text-muted mt-6">
            New shop?{' '}
            <button
              type="button"
              className="text-primary font-black uppercase tracking-widest underline-offset-2 hover:underline"
              onClick={() => onNavigate('signup')}
            >
              Create account
            </button>
          </p>
        )}
      </div>
    </div>
  );
}
